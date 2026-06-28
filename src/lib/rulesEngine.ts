import { RULES_CONFIG, getPlanKey } from '@/lib/rulesConfig';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';

type TradeRecord = {
  id: string;
  closeTime?: number;
  openTime?: number;
  pnl?: number | string;
  profit?: number | string;
  ticket?: string | number;
  [key: string]: any;
};

const lastAudit = new Map<string, number>();
const AUDIT_TTL = 5 * 60 * 1000;

const NEXT_PHASE: Record<string, Record<string, string>> = {
  '1-step-pro':      { evaluation: 'funded' },
  '2-step-classic':  { phase1: 'phase2', phase2: 'funded' },
  '3-step-classic':  { phase1: 'phase2', phase2: 'phase3', phase3: 'funded' },
  'instant-funding': { evaluation: 'funded' },
};

export async function runGlobalAudit() {
  const db = getAdminDb();
  const snapshot = await db.collection('mt5_accounts').where('status', '==', 'active').get();
  const results = { totalChecked: snapshot.size, breachesDetected: 0, passed: 0, errors: 0, details: [] as any[] };
  const BATCH_SIZE = 50;
  const docs = snapshot.docs;

  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    await Promise.all(docs.slice(i, i + BATCH_SIZE).map(async (doc) => {
      try {
        const res = await auditAccount({ id: doc.id, ...doc.data() }, true);
        if (res?.breached) { 
          results.breachesDetected++; 
          results.details.push({ login: doc.id, status: 'breached', reason: res.reason }); 
        } else if (res?.passed) { 
          results.passed++; 
          results.details.push({ login: doc.id, status: 'passed' }); 
        }
      } catch (err: any) {
        results.errors++;
        results.details.push({ login: doc.id, status: 'error', message: err.message });
      }
    }));
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

  // 1. Rule 1 - 1% Max Floating Loss (Individual Trade)
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

  // 2. Rule 2 - 3% Daily Drawdown (Realized Loss + Combined Floating)
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

  // 3. Rule 3 - 6% Max Drawdown (All-time Realized Loss + Combined Floating)
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

  // 4. Rule 4 - Profit Target (10% for 1-Step Pro Evaluation)
  if (!breachType && planKey === '1-step-pro' && phaseKey === 'evaluation') {
    let netClosedProfit = 0;
    closedTrades.forEach(t => {
      netClosedProfit += parseFloat(String(t.pnl ?? t.profit ?? 0));
    });
    if (netClosedProfit >= (initialBalance * 0.10)) {
       await db.collection('mt5_accounts').doc(String(login)).update({ 
         profitTargetReached: true 
       });
    }
  }

  // 5. Universal Rule - Min Trade Duration (2 Mins)
  if (!breachType) {
    for (const t of recentTrades) {
      if (t.closeTime && t.openTime) {
        const duration = Number(t.closeTime) - Number(t.openTime);
        if (duration < universal.minTradeDurationSeconds) { 
          breachType = 'hard'; 
          breachReason = 'Trade Duration Violation - Closed Before 2 Minutes'; 
          break; 
        }
      }
    }
  }

  // 6. Universal Rule - Execution Frequency (3 Mins)
  if (!breachType) {
    const sorted = [...recentTrades].sort((a, b) => Number(a.openTime) - Number(b.openTime));
    for (let i = 1; i < sorted.length; i++) {
      const diff = Number(sorted[i].openTime) - Number(sorted[i - 1].openTime);
      if (diff > 0 && diff < universal.maxExecutionFrequencySeconds) { 
        breachType = 'hard'; 
        breachReason = 'Execution Frequency Violation - Less Than 3 Minutes Between Trades'; 
        break; 
      }
    }
  }

  // ── Handle Breach ────────────────────────────────────────────
  if (breachType === 'hard') {
    const breachId = `hard_${login}_${Date.now()}`;
    const batch = db.batch();
    batch.update(db.collection('mt5_accounts').doc(String(login)), { 
      status: 'breached', 
      breachedAt: FieldValue.serverTimestamp(), 
      breachReason 
    });
    batch.update(userRef, { 
      accountStatus: 'breached', 
      breachReason 
    });
    batch.set(db.collection('breaches').doc(breachId), { 
      login, userId, reason: breachReason, type: 'hard', breachedAt: FieldValue.serverTimestamp(), phase: phaseKey, plan: planKey 
    });
    
    // Fixed: Writing to User Subcollection (UI Source of Truth)
    batch.set(userRef.collection('notifications').doc(`breach_${login}_${Date.now()}`), { 
      type: 'account_breached', 
      title: '❌ Account Breached', 
      message: `Your account has been breached: ${breachReason}`, 
      isRead: false, 
      createdAt: FieldValue.serverTimestamp() 
    });
    
    await batch.commit();
    return { breached: true, reason: breachReason };
  }

  // ── Auto-Pass Check ──────────────────────────────────────────
  if (rules.profitTarget) {
    let netClosedProfit = 0;
    const tradingDays = new Set<string>();
    closedTrades.forEach(t => {
      netClosedProfit += parseFloat(String(t.pnl ?? t.profit ?? 0));
      if (t.closeTime) {
        const d = new Date(typeof t.closeTime === 'number' ? t.closeTime * 1000 : t.closeTime as any);
        tradingDays.add(d.toISOString().split('T')[0]);
      }
    });

    const targetAmount = initialBalance * (rules.profitTarget / 100);
    const minDays = rules.minTradingDays || 1;
    const nextPhase = NEXT_PHASE[planKey]?.[phaseKey];
    const passed = netClosedProfit >= targetAmount && tradingDays.size >= minDays;

    if (passed && nextPhase) {
      const isFunded = nextPhase === 'funded';
      const batch = db.batch();
      batch.update(db.collection('mt5_accounts').doc(String(login)), {
        phase: nextPhase, status: isFunded ? 'funded' : 'active',
        passedAt: FieldValue.serverTimestamp(), profitTargetReached: true, previousPhase: phaseKey,
      });
      batch.update(userRef, { 
        accountStatus: isFunded ? 'funded' : 'active', 
        phase: nextPhase, 
        passedAt: FieldValue.serverTimestamp() 
      });
      batch.set(db.collection('passes').doc(`pass_${login}_${phaseKey}`), { 
        login, userId, planKey, phaseKey, nextPhase, isFunded, netClosedProfit, tradingDays: tradingDays.size, passedAt: FieldValue.serverTimestamp() 
      });
      
      // Fixed: Writing to User Subcollection (UI Source of Truth)
      batch.set(userRef.collection('notifications').doc(`pass_${phaseKey}_${Date.now()}`), {
        type: isFunded ? 'account_funded' : 'phase_passed',
        title: isFunded ? '🎉 Account Funded!' : `✅ ${phaseKey} Passed!`,
        message: isFunded ? `Congratulations! Your account is now funded. Profit: $${netClosedProfit.toFixed(2)}` : `You passed ${phaseKey}! Moving to ${nextPhase}.`,
        isRead: false, 
        createdAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      
      await batch.commit();
      return { breached: false, reason: null, passed: true, nextPhase };
    }
  }

  return { breached: false, reason: null, passed: false };
}
