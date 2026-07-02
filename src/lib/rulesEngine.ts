import { RULES_CONFIG, getPlanKey } from '@/lib/rulesConfig';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';

type TradeRecord = {
  id: string;
  closeTime?: any;
  openTime?: any;
  openedAt?: any;
  closedAt?: any;
  pnl?: number | string;
  profit?: number | string;
  ticket?: string | number;
  status?: string;
  type?: string;
  lots?: number;
  symbol?: string;
  openPrice?: number;
  [key: string]: any;
};

const CONTRACT_SIZE: Record<string, number> = {
  XAUUSD: 100, BTCUSD: 1, ETHUSD: 1, EURUSD: 100000, GBPUSD: 100000, USDJPY: 100000,
};

const lastAudit = new Map<string, number>();
const AUDIT_TTL = 30 * 1000; // 30 seconds

/**
 * INSTITUTIONAL DEMO AUDIT ENGINE
 * Evaluates demoAccounts and demoTrades against prop firm risk protocols.
 */
export async function auditDemoAccount(accountId: string) {
  const db = getAdminDb();
  const accRef = db.collection('demoAccounts').doc(accountId);
  const accSnap = await accRef.get();
  
  if (!accSnap.exists) return null;
  const account = accSnap.data()!;
  if (account.status !== 'active') return { status: account.status };

  const { userId, startBalance, balance, planType, phase } = account;
  const initialBalance = parseFloat(String(startBalance || 100000));
  const currBalance = parseFloat(String(balance || initialBalance));

  const pKey = getPlanKey(planType || '1-step-pro');
  const phKey = phase || 'evaluation';
  const rules = RULES_CONFIG.plans[pKey]?.[phKey] || RULES_CONFIG.plans['1-step-pro']['evaluation'];
  const universal = RULES_CONFIG.universal;

  // 1. Fetch Trades & Prices
  const [tradesSnap, pricesSnap] = await Promise.all([
    db.collection('demoTrades').where('accountId', '==', accountId).get(),
    db.collection('livePrices').get()
  ]);

  const trades: TradeRecord[] = tradesSnap.docs.map(d => ({ id: d.id, ref: d.ref, ...d.data() } as TradeRecord));
  const prices: Record<string, any> = {};
  pricesSnap.docs.forEach(d => prices[d.id.toUpperCase()] = d.data());

  const openTrades = trades.filter(t => t.status === 'open');
  const closedTrades = trades.filter(t => t.status === 'closed');

  // 2. Calculate Real-time Equity & Floating Loss
  let totalFloatingPnl = 0;
  let maxSingleFloatingLoss = 0;

  for (const t of openTrades) {
    const priceData = prices[t.symbol?.toUpperCase() || ''];
    if (!priceData) continue;

    const exitPrice = t.type === 'buy' ? priceData.bid : priceData.ask;
    const contractSize = CONTRACT_SIZE[t.symbol?.toUpperCase() || ''] || 100000;
    const pnl = (t.type === 'buy' ? exitPrice - t.openPrice! : t.openPrice! - exitPrice) * t.lots! * contractSize;
    
    totalFloatingPnl += pnl;
    if (pnl < 0) maxSingleFloatingLoss = Math.max(maxSingleFloatingLoss, Math.abs(pnl));
  }

  const currentEquity = currBalance + totalFloatingPnl;
  const floatingLossLimit = initialBalance * (rules.maxFloatingLoss || 1) / 100;

  let breachReason = '';

  // ── RULE 1: Max Floating Loss (1% per trade) ──────────────────
  if (maxSingleFloatingLoss >= floatingLossLimit) {
    breachReason = `Floating loss violation: Single position hit 1% limit ($${floatingLossLimit.toLocaleString()})`;
  }

  // ── RULE 2: Daily Drawdown (3% of start balance) ──────────────
  const now = new Date();
  const sessionStart = new Date(now);
  sessionStart.setUTCHours(2, 0, 0, 0); // 2:00 AM UTC reset
  if (now.getUTCHours() < 2) sessionStart.setUTCDate(sessionStart.getUTCDate() - 1);

  let realizedLossToday = 0;
  closedTrades.forEach(t => {
    const closedAt = t.closedAt?.toDate ? t.closedAt.toDate() : new Date(t.closedAt);
    if (closedAt >= sessionStart && (parseFloat(String(t.pnl)) < 0)) {
      realizedLossToday += Math.abs(parseFloat(String(t.pnl)));
    }
  });

  const dailyLimit = initialBalance * (rules.dailyDrawdown / 100);
  const totalDailyRisk = realizedLossToday + (totalFloatingPnl < 0 ? Math.abs(totalFloatingPnl) : 0);

  if (!breachReason && totalDailyRisk >= dailyLimit) {
    breachReason = `Daily drawdown violation: Risk ($${totalDailyRisk.toFixed(2)}) exceeded 3% limit ($${dailyLimit.toFixed(2)})`;
  }

  // ── RULE 3: Max Total Drawdown (6%) ───────────────────────────
  const maxLimit = initialBalance * (rules.maxDrawdown / 100);
  if (!breachReason && (initialBalance - currentEquity) >= maxLimit) {
    breachReason = `Maximum drawdown violation: Equity fell below 6% limit`;
  }

  // ── RULE 4: Profit Target (10% Evaluation) ────────────────────
  const profitTarget = initialBalance * (rules.profitTarget || 10) / 100;
  const isPassed = !breachReason && currBalance >= (initialBalance + profitTarget);

  // ── RULE 5 & 6: Duration & Frequency ──────────────────────────
  if (!breachReason) {
    for (const t of closedTrades) {
      const open = t.openedAt?.toDate ? t.openedAt.toDate() : new Date(t.openedAt);
      const close = t.closedAt?.toDate ? t.closedAt.toDate() : new Date(t.closedAt);
      const duration = (close.getTime() - open.getTime()) / 1000;
      if (duration < universal.minTradeDurationSeconds) {
        breachReason = `Duration violation: Trade ${t.id} held for ${duration.toFixed(0)}s (Min 2m)`;
        break;
      }
    }
  }

  // 3. EXECUTE BREACH PROTOCOL
  if (breachReason) {
    const batch = db.batch();
    
    // Update Account
    batch.update(accRef, {
      status: 'blown',
      breachReason,
      equity: currentEquity,
      blownAt: FieldValue.serverTimestamp()
    });

    // Force Close Open Trades
    for (const t of openTrades) {
      const priceData = prices[t.symbol?.toUpperCase() || ''];
      const exitPrice = priceData ? (t.type === 'buy' ? priceData.bid : priceData.ask) : t.openPrice;
      const contractSize = CONTRACT_SIZE[t.symbol?.toUpperCase() || ''] || 100000;
      const finalPnl = priceData ? (t.type === 'buy' ? exitPrice - t.openPrice! : t.openPrice! - exitPrice) * t.lots! * contractSize : 0;

      batch.update(t.ref, {
        status: 'closed',
        closedAt: FieldValue.serverTimestamp(),
        closeReason: 'account_blown',
        closePrice: exitPrice,
        pnl: finalPnl
      });
    }

    // Update User
    batch.update(db.collection('users').doc(userId), { accountStatus: 'breached' });

    // Records
    batch.set(db.collection('breaches').doc(`demo_${accountId}_${Date.now()}`), {
      accountId, userId, reason: breachReason, type: 'hard', breachedAt: FieldValue.serverTimestamp(), planType, phase
    });

    // Notification
    batch.set(db.collection('notifications').doc(), {
      userId, type: 'account_breached', title: '❌ Account Breached', 
      message: `Your demo account has been liquidated: ${breachReason}`, 
      isRead: false, createdAt: FieldValue.serverTimestamp()
    });

    await batch.commit();
    return { breached: true, reason: breachReason };
  }

  // 4. EXECUTE PASS PROTOCOL
  if (isPassed) {
    const batch = db.batch();
    batch.update(accRef, { status: 'passed', passedAt: FieldValue.serverTimestamp(), readyForNextPhase: true });
    batch.update(db.collection('users').doc(userId), { accountStatus: 'passed' });
    batch.set(db.collection('notifications').doc(), {
      userId, type: 'phase_passed', title: '✅ Challenge Passed!', 
      message: `Congratulations! You reached the $${profitTarget.toLocaleString()} target. Our desk will review your performance.`, 
      isRead: false, createdAt: FieldValue.serverTimestamp()
    });
    await batch.commit();
    return { passed: true };
  }

  // Normal Update
  await accRef.update({ equity: currentEquity, updatedAt: FieldValue.serverTimestamp() });
  return { status: 'active', equity: currentEquity };
}

export async function runGlobalAudit() {
  const db = getAdminDb();
  
  // 1. Audit MT5 Accounts
  const mt5Snap = await db.collection('mt5_accounts').where('status', '==', 'active').get();
  
  // 2. Audit Demo Accounts
  const demoSnap = await db.collection('demoAccounts').where('status', '==', 'active').get();

  const results = { checked: mt5Snap.size + demoSnap.size, breaches: 0 };

  for (const doc of mt5Snap.docs) {
    await auditAccount({ id: doc.id, ...doc.data() }, true);
  }

  for (const doc of demoSnap.docs) {
    await auditDemoAccount(doc.id);
  }

  return results;
}

export async function auditAccount(accountDoc: any, forceRun = false) {
  const loginKey = String(accountDoc.login || accountDoc.id);

  if (!forceRun) {
    const last = lastAudit.get(loginKey) || 0;
    if (Date.now() - last < AUDIT_TTL) return { breached: false, reason: null, skipped: true };
  }
  lastAudit.set(loginKey, Date.now());

  const db = getAdminDb();
  const { login, userId, accountPlan, accountBalance, balance, equity, phase, liveBalance, liveEquity } = accountDoc;

  const planKey = getPlanKey(accountPlan || '');
  const phaseKey = phase || 'evaluation';
  const rules = RULES_CONFIG.plans[planKey]?.[phaseKey];
  const universal = RULES_CONFIG.universal;

  if (!rules || !userId) return null;

  const initialBalance = parseFloat(String(accountBalance || 100000));
  const currBalance = parseFloat(String(balance || liveBalance || initialBalance));
  const currEquity = parseFloat(String(equity || liveEquity || currBalance));

  let breachType: 'hard' | null = null;
  let breachReason = '';

  const now = new Date();
  const sessionStart = new Date(now);
  sessionStart.setUTCHours(2, 0, 0, 0);
  if (now.getUTCHours() < 2) sessionStart.setUTCDate(sessionStart.getUTCDate() - 1);
  const sessionEnd = new Date(sessionStart);
  sessionEnd.setUTCDate(sessionEnd.getUTCDate() + 1);

  const userRef = db.collection('users').doc(userId);
  const tradesRef = userRef.collection('trades');
  const allTradesSnap = await tradesRef.where('login', '==', String(login)).get();
  const trades: TradeRecord[] = allTradesSnap.docs.map(d => ({ id: d.id, ...d.data() } as TradeRecord));
  const closedTrades = trades.filter(t => t.closeTime);
  const openTrades = trades.filter(t => !t.closeTime);
  const recentTrades = [...closedTrades].sort((a, b) => Number(b.closeTime) - Number(a.closeTime)).slice(0, 50);
  
  const currentFloatingLoss = currBalance > currEquity ? currBalance - currEquity : 0;

  // Rule 1 - 1% Max Floating Loss
  if (!breachType && rules.maxFloatingLoss) {
    const limit = initialBalance * (rules.maxFloatingLoss / 100);
    for (const t of openTrades) {
      const pnl = parseFloat(String(t.pnl ?? t.profit ?? 0));
      if (pnl < 0 && Math.abs(pnl) >= limit) { 
        breachType = 'hard'; 
        breachReason = '1% Max Floating Loss Exceeded'; 
        break; 
      }
    }
  }

  // Rule 2 - 3% Daily Drawdown
  if (!breachType) {
    const dailyLimit = initialBalance * 0.03;
    let realizedLossesToday = 0;
    closedTrades.forEach(t => {
      const cTime = typeof t.closeTime === 'number' ? t.closeTime * 1000 : new Date(t.closeTime as any).getTime();
      if (cTime >= sessionStart.getTime() && cTime < sessionEnd.getTime()) {
        const pnl = parseFloat(String(t.pnl ?? t.profit ?? 0));
        if (pnl < 0) realizedLossesToday += Math.abs(pnl);
      }
    });
    if (realizedLossesToday + currentFloatingLoss >= dailyLimit) { 
      breachType = 'hard'; 
      breachReason = 'Daily Drawdown Limit Breached'; 
    }
  }

  // Rule 3 - 6% Max Drawdown
  if (!breachType) {
    const maxLimit = initialBalance * 0.06;
    let realizedLossesAllTime = 0;
    closedTrades.forEach(t => { 
      const pnl = parseFloat(String(t.pnl ?? t.profit ?? 0)); 
      if (pnl < 0) realizedLossesAllTime += Math.abs(pnl); 
    });
    if (realizedLossesAllTime + currentFloatingLoss >= maxLimit) { 
      breachType = 'hard'; 
      breachReason = 'Maximum Drawdown Limit Breached'; 
    }
  }

  // Universal Rule - Min Trade Duration
  if (!breachType) {
    for (const t of recentTrades) {
      if (t.closeTime && t.openTime) {
        const duration = Number(t.closeTime) - Number(t.openTime);
        if (duration < universal.minTradeDurationSeconds) { 
          breachType = 'hard'; 
          breachReason = 'Trade Duration Violation'; 
          break; 
        }
      }
    }
  }

  if (breachType === 'hard') {
    await db.collection('mt5_accounts').doc(String(login)).update({ status: 'breached', breachedAt: FieldValue.serverTimestamp(), breachReason });
    await userRef.update({ accountStatus: 'breached', breachReason });
    await db.collection('breaches').add({ login, userId, reason: breachReason, type: 'hard', breachedAt: FieldValue.serverTimestamp() });
    return { breached: true, reason: breachReason };
  }

  return { breached: false, reason: null };
}
