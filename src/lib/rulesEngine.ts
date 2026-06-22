import { RULES_CONFIG, getPlanKey } from '@/lib/rulesConfig';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

/**
 * @fileOverview Institutional Risk Rules Engine
 * Evaluates MT5 accounts against plan-specific and universal risk protocols.
 */

function getAdminDb() {
  if (!getApps().length) {
    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (!serviceAccountKey) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_KEY');
    const serviceAccount = JSON.parse(serviceAccountKey.startsWith("'") ? serviceAccountKey.slice(1, -1) : serviceAccountKey);
    initializeApp({ credential: cert(serviceAccount) });
  }
  return getFirestore();
}

/**
 * Executes an audit on all active MT5 accounts in the system.
 */
export async function runGlobalAudit() {
  const db = getAdminDb();
  const snapshot = await db.collection('mt5_accounts').where('status', '==', 'active').get();
  
  const results = {
    totalChecked: snapshot.size,
    breachesDetected: 0,
    errors: 0,
    details: [] as any[]
  };

  for (const doc of snapshot.docs) {
    try {
      const res = await auditAccount({ id: doc.id, ...doc.data() });
      if (res?.breached) {
        results.breachesDetected++;
        results.details.push({ login: doc.id, status: 'breached', reason: res.reason });
      }
    } catch (err: any) {
      results.errors++;
      results.details.push({ login: doc.id, status: 'error', message: err.message });
    }
  }

  return results;
}

export async function auditAccount(accountDoc: any) {
  const db = getAdminDb();
  const {
    login,
    userId,
    accountPlan,
    accountBalance,
    balance,
    equity,
    phase,
    liveBalance,
    liveEquity
  } = accountDoc;

  const planKey = getPlanKey(accountPlan || '');
  const phaseKey = phase || 'evaluation';
  const rules = RULES_CONFIG.plans[planKey]?.[phaseKey];
  const universal = RULES_CONFIG.universal;

  if (!rules || !userId) return null;

  const initialBalance = parseFloat(String(accountBalance || 100000));
  const currBalance = parseFloat(String(balance || liveBalance || initialBalance));
  const currEquity = parseFloat(String(equity || liveEquity || currBalance));

  let breachType: 'hard' | 'soft' | null = null;
  let breachReason = '';

  // Calculate session window: 02:00 AM UTC (7:30 AM IST)
  const now = new Date();
  const sessionStart = new Date(now);
  sessionStart.setUTCHours(2, 0, 0, 0);
  if (now.getUTCHours() < 2) {
    sessionStart.setUTCDate(sessionStart.getUTCDate() - 1);
  }
  const sessionEnd = new Date(sessionStart);
  sessionEnd.setUTCDate(sessionEnd.getUTCDate() + 1);

  const tradesRef = db.collection('users').doc(userId).collection('trades');
  const allTradesSnap = await tradesRef.where('login', '==', String(login)).get();
  const trades = allTradesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // 0. SINGLE OPEN TRADE FLOATING LOSS CHECK (1% RULE)
  if (!breachType) {
    const floatingLossLimit = initialBalance * 0.01;
    const openTrades = trades.filter(t => !t.closeTime);
    for (const trade of openTrades) {
      const pnl = parseFloat(String(trade.pnl || trade.profit || 0));
      if (pnl < 0 && Math.abs(pnl) >= floatingLossLimit) {
        breachType = 'hard';
        breachReason = '1% Max Floating Loss Exceeded';
        break;
      }
    }
  }

  // 1. DAILY DRAWDOWN CHECK (3% - Realized Losses Today + Combined Floating Loss)
  const currentFloatingLoss = currBalance > currEquity ? (currBalance - currEquity) : 0;
  
  if (!breachType) {
    const dailyLimit = initialBalance * 0.03;
    let realizedLossesToday = 0;
    
    trades.forEach(t => {
      if (t.closeTime) {
        const cTime = typeof t.closeTime === 'number' ? t.closeTime * 1000 : new Date(t.closeTime).getTime();
        if (cTime >= sessionStart.getTime() && cTime < sessionEnd.getTime()) {
          const pnl = parseFloat(String(t.pnl || t.profit || 0));
          if (pnl < 0) realizedLossesToday += Math.abs(pnl);
        }
      }
    });

    const totalDailyLoss = realizedLossesToday + currentFloatingLoss;
    if (totalDailyLoss >= dailyLimit) {
      breachType = 'hard';
      breachReason = 'Daily Drawdown Limit Breached';
    }
  }

  // 3. MAXIMUM DRAWDOWN CHECK (6% - All-time Realized Losses + Combined Floating Loss)
  if (!breachType) {
    const maxLimit = initialBalance * 0.06;
    let realizedLossesAllTime = 0;

    trades.forEach(t => {
      if (t.closeTime) {
        const pnl = parseFloat(String(t.pnl || t.profit || 0));
        if (pnl < 0) realizedLossesAllTime += Math.abs(pnl);
      }
    });

    const totalMaxLoss = realizedLossesAllTime + currentFloatingLoss;
    if (totalMaxLoss >= maxLimit) {
      breachType = 'hard';
      breachReason = 'Maximum Drawdown Limit Breached';
    }
  }

  // 4. PROFIT TARGET (10% for 1-Step Pro - CLOSED TRADES ONLY)
  if (!breachType && planKey === '1-step-pro') {
    let netClosedProfit = 0;
    trades.forEach(t => {
      if (t.closeTime) {
        netClosedProfit += parseFloat(String(t.pnl || t.profit || 0));
      }
    });

    const targetAmount = initialBalance * 0.10;
    if (netClosedProfit >= targetAmount) {
      await db.collection('mt5_accounts').doc(String(login)).update({ profitTargetReached: true });
    }
  }

  // Fetch additional universal rules checks (Duration, Frequency, Martingale)
  const recentTrades = trades.filter(t => t.closeTime).sort((a: any, b: any) => b.closeTime - a.closeTime).slice(0, 50);

  // 5. MAX SINGLE TRADE LOSS CHECK (3%)
  if (!breachType) {
    const singleLossLimit = initialBalance * (universal.maxSingleTradeLossPct / 100);
    for (const trade of recentTrades) {
      const pnl = parseFloat(String(trade.pnl || trade.profit || 0));
      if (pnl < 0 && Math.abs(pnl) > singleLossLimit) {
        breachType = 'hard';
        breachReason = `Max Single Trade Loss: Trade #${trade.ticket || trade.id} exceeded 3% limit`;
        break;
      }
    }
  }

  // 6. MIN TRADE DURATION CHECK
  if (!breachType) {
    for (const trade of recentTrades) {
      if (trade.closeTime && trade.openTime) {
        const duration = trade.closeTime - trade.openTime;
        if (duration < universal.minTradeDurationSeconds) {
          breachType = 'hard';
          breachReason = `Min Trade Duration violation: Trade closed in ${duration}s`;
          break;
        }
      }
    }
  }

  // 7. MAX EXECUTION FREQUENCY CHECK
  if (!breachType) {
    const sortedOpen = [...recentTrades].sort((a: any, b: any) => a.openTime - b.openTime);
    for (let i = 1; i < sortedOpen.length; i++) {
      const diff = sortedOpen[i].openTime - sortedOpen[i - 1].openTime;
      if (diff > 0 && diff < universal.maxExecutionFrequencySeconds) {
        breachType = 'hard';
        breachReason = `Max Execution Frequency violation: ${diff}s gap between orders`;
        break;
      }
    }
  }

  // Handle Breach Persistence
  if (breachType === 'hard') {
    const breachId = `hard_${login}_${Date.now()}`;
    const batch = db.batch();
    
    batch.update(db.collection('mt5_accounts').doc(String(login)), {
      status: 'breached',
      breachedAt: FieldValue.serverTimestamp(),
      breachReason
    });
    
    batch.update(db.collection('users').doc(userId), {
      accountStatus: 'breached',
      breachReason
    });

    batch.set(db.collection('breaches').doc(breachId), {
      login, userId, reason: breachReason, type: 'hard', 
      breachedAt: FieldValue.serverTimestamp(), phase: phaseKey, plan: planKey
    });

    await batch.commit();
    return { breached: true, reason: breachReason };
  }

  return { breached: false, reason: null };
}
