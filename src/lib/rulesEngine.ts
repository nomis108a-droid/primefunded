import { RULES_CONFIG, getPlanKey } from '@/lib/rulesConfig';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import { sendBreachEmail, sendChallengePassEmail } from '@/lib/email';

/**
 * @fileOverview Institutional Demo Audit Engine (V2)
 * Evaluates internal demo accounts and trades against prop firm risk protocols.
 * ENFORCES: 1% single floating loss, 3% daily drawdown, 6% max drawdown, 2m duration, 3m spacing.
 */

type TradeRecord = {
  id: string;
  openedAt?: any;
  closedAt?: any;
  pnl?: number | string;
  status?: string;
  type?: string;
  lots?: number;
  symbol?: string;
  openPrice?: number;
  ref: any;
  [key: string]: any;
};

const CONTRACT_SIZE: Record<string, number> = {
  XAUUSD: 100, BTCUSD: 1, ETHUSD: 1, EURUSD: 100000, GBPUSD: 100000, USDJPY: 100000,
};

function getTradeDate(time: any) {
  if (!time) return null;
  if (time.toDate) return time.toDate();
  return new Date(time);
}

export async function auditDemoAccount(accountId: string) {
  const db = getAdminDb();
  const accRef = db.collection('demoAccounts').doc(accountId);
  const accSnap = await accRef.get();
  
  if (!accSnap.exists) return null;
  const account = accSnap.data()!;
  if (account.status !== 'active') return { status: account.status };

  const { userId, startBalance, balance, planType, phase, email, name } = account;
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

    const exitPrice = t.type === 'buy' ? (priceData.bid || priceData.price) : (priceData.ask || priceData.price);
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
  sessionStart.setUTCHours(2, 0, 0, 0); 
  if (now.getUTCHours() < 2) sessionStart.setUTCDate(sessionStart.getUTCDate() - 1);

  let realizedLossToday = 0;
  closedTrades.forEach(t => {
    const closedDate = getTradeDate(t.closedAt);
    if (closedDate && closedDate >= sessionStart && (parseFloat(String(t.pnl)) < 0)) {
      realizedLossToday += Math.abs(parseFloat(String(t.pnl)));
    }
  });

  const dailyLimit = initialBalance * (rules.dailyDrawdown / 100);
  const totalDailyRisk = realizedLossToday + (totalFloatingPnl < 0 ? Math.abs(totalFloatingPnl) : 0);

  if (!breachReason && totalDailyRisk >= dailyLimit) {
    breachReason = `Daily drawdown violation: Risk ($${totalDailyRisk.toFixed(2)}) exceeded ${rules.dailyDrawdown}% limit ($${dailyLimit.toFixed(2)})`;
  }

  // ── RULE 3: Max Total Drawdown ───────────────────────────────
  const maxLimit = initialBalance * (rules.maxDrawdown / 100);
  if (!breachReason && (initialBalance - currentEquity) >= maxLimit) {
    breachReason = `Maximum drawdown violation: Equity fell below ${rules.maxDrawdown}% limit`;
  }

  // ── RULE 4: Profit Target Check ──────────────────────────────
  const profitTarget = initialBalance * (rules.profitTarget || 10) / 100;
  const isPassed = !breachReason && currBalance >= (initialBalance + profitTarget);

  // ── RULE 5: Trade Duration (Min 2m) ──────────────────────────
  if (!breachReason) {
    for (const t of closedTrades) {
      const open = getTradeDate(t.openedAt);
      const close = getTradeDate(t.closedAt);
      if (open && close) {
        const duration = (close.getTime() - open.getTime()) / 1000;
        if (duration < universal.minTradeDurationSeconds) {
          breachReason = `Duration violation: Trade ${t.id} held for ${duration.toFixed(0)}s (Min 2m)`;
          break;
        }
      }
    }
  }

  // ── RULE 6: Execution Spacing (Min 3m) ────────────────────────
  if (!breachReason) {
    const sortedOpens = trades.map(t => getTradeDate(t.openedAt)).filter(d => !!d).sort((a: any, b: any) => a.getTime() - b.getTime());
    for (let i = 1; i < sortedOpens.length; i++) {
      const diff = (sortedOpens[i].getTime() - sortedOpens[i - 1].getTime()) / 1000;
      if (diff < universal.maxExecutionFrequencySeconds) {
        breachReason = `Frequency violation: Less than 3m spacing between executions (${diff.toFixed(0)}s)`;
        break;
      }
    }
  }

  // 3. EXECUTE BREACH PROTOCOL
  if (breachReason) {
    const batch = db.batch();
    
    batch.update(accRef, {
      status: 'blown',
      breachReason,
      equity: currentEquity,
      blownAt: FieldValue.serverTimestamp()
    });

    for (const t of openTrades) {
      const priceData = prices[t.symbol?.toUpperCase() || ''];
      const exitPrice = priceData ? (t.type === 'buy' ? (priceData.bid || priceData.price) : (priceData.ask || priceData.price)) : t.openPrice;
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

    batch.update(db.collection('users').doc(userId), { accountStatus: 'breached' });

    batch.set(db.collection('breaches').doc(), {
      accountId, userId, reason: breachReason, type: 'hard', breachedAt: FieldValue.serverTimestamp(), planType, phase
    });

    batch.set(db.collection('users').doc(userId).collection('notifications').doc(), {
      userId, type: 'account_breached', title: '❌ Account Breached', 
      message: `Your demo account has been liquidated: ${breachReason}`, 
      isRead: false, createdAt: FieldValue.serverTimestamp()
    });

    await batch.commit();
    sendBreachEmail(email || userId, breachReason);
    return { breached: true, reason: breachReason };
  }

  // 4. EXECUTE PASS PROTOCOL
  if (isPassed) {
    const batch = db.batch();
    batch.update(accRef, { status: 'passed', passedAt: FieldValue.serverTimestamp(), readyForNextPhase: true });
    batch.update(db.collection('users').doc(userId), { accountStatus: 'passed' });
    batch.set(db.collection('users').doc(userId).collection('notifications').doc(), {
      userId, type: 'phase_passed', title: '✅ Challenge Passed!', 
      message: `Congratulations! You reached the profit target. Admin will review your performance.`, 
      isRead: false, createdAt: FieldValue.serverTimestamp()
    });
    await batch.commit();
    sendChallengePassEmail(email || userId, name || "Trader", pKey, String(initialBalance));
    return { passed: true };
  }

  // Normal Equity Sync
  await accRef.update({ equity: currentEquity, updatedAt: FieldValue.serverTimestamp() });
  return { status: 'active', equity: currentEquity };
}

export async function runDemoAudit() {
  const db = getAdminDb();
  const snapshot = await db.collection('demoAccounts').where('status', '==', 'active').get();
  const results = { totalChecked: snapshot.size, breachesDetected: 0, passed: 0, errors: 0 };
  
  await Promise.all(snapshot.docs.map(async (doc) => {
    try {
      const res = await auditDemoAccount(doc.id);
      if (res?.breached) results.breachesDetected++;
      else if (res?.passed) results.passed++;
    } catch (err) {
      results.errors++;
    }
  }));
  
  return results;
}
