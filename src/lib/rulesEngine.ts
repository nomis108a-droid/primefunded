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
    const serviceAccount = JSON.parse(serviceAccountKey);
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

  // Calculate session window: 2:00 AM UTC to next 2:00 AM UTC
  const now = new Date();
  const sessionStart = new Date(now);
  sessionStart.setUTCHours(2, 0, 0, 0);
  if (now.getUTCHours() < 2) {
    sessionStart.setUTCDate(sessionStart.getUTCDate() - 1);
  }
  const sessionEnd = new Date(sessionStart);
  sessionEnd.setUTCDate(sessionEnd.getUTCDate() + 1);

  // 1. DAILY DRAWDOWN CHECK (Gross Loss Method)
  const tradesRef = db.collection('users').doc(userId).collection('trades');
  const dailyTradesSnap = await tradesRef
    .where('closeTime', '>=', sessionStart.getTime() / 1000)
    .where('closeTime', '<', sessionEnd.getTime() / 1000)
    .get();

  let dailyGrossLoss = 0;
  dailyTradesSnap.docs.forEach(d => {
    const t = d.data();
    const pnl = parseFloat(String(t.pnl || t.profit || 0));
    if (pnl < 0) dailyGrossLoss += Math.abs(pnl);
  });

  // Add current floating loss
  if (currEquity < currBalance) {
    dailyGrossLoss += (currBalance - currEquity);
  }

  const dailyLimit = initialBalance * (rules.dailyDrawdown / 100);
  if (dailyGrossLoss >= dailyLimit) {
    breachType = 'hard';
    breachReason = `Daily Drawdown: Gross loss $${dailyGrossLoss.toFixed(2)} exceeded limit $${dailyLimit.toFixed(2)}`;
  }

  // 2. MAX DRAWDOWN CHECK
  if (!breachType) {
    const maxDrawdownFloor = initialBalance - (initialBalance * (rules.maxDrawdown / 100));
    if (currEquity <= maxDrawdownFloor) {
      breachType = 'hard';
      breachReason = `Max Drawdown: Equity $${currEquity.toLocaleString()} fell below floor $${maxDrawdownFloor.toLocaleString()}`;
    }
  }

  // Fetch last 50 closed trades for granular analysis
  const recentTradesSnap = await tradesRef.orderBy('closeTime', 'desc').limit(50).get();
  const recentTrades = recentTradesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // 3. MAX SINGLE TRADE LOSS CHECK
  if (!breachType) {
    const singleLossLimit = initialBalance * (universal.maxSingleTradeLossPct / 100);
    for (const trade of recentTrades) {
      const pnl = parseFloat(String(trade.pnl || trade.profit || 0));
      if (pnl < 0 && Math.abs(pnl) > singleLossLimit) {
        breachType = 'hard';
        breachReason = `Max Single Trade Loss: Trade #${trade.ticket || trade.id} lost $${Math.abs(pnl).toFixed(2)} exceeded $${singleLossLimit.toFixed(2)} limit`;
        break;
      }
    }
  }

  // 4. MIN TRADE DURATION CHECK
  if (!breachType) {
    for (const trade of recentTrades) {
      if (trade.closeTime && trade.openTime) {
        const duration = trade.closeTime - trade.openTime;
        if (duration < universal.minTradeDurationSeconds) {
          breachType = 'hard';
          breachReason = `Min Trade Duration: Trade #${trade.ticket || trade.id} closed in ${duration}s, minimum ${universal.minTradeDurationSeconds}s`;
          break;
        }
      }
    }
  }

  // 5. MAX EXECUTION FREQUENCY CHECK
  if (!breachType) {
    const sortedOpen = [...recentTrades].sort((a: any, b: any) => a.openTime - b.openTime);
    for (let i = 1; i < sortedOpen.length; i++) {
      const diff = sortedOpen[i].openTime - sortedOpen[i - 1].openTime;
      if (diff > 0 && diff < universal.maxExecutionFrequencySeconds) {
        breachType = 'hard';
        breachReason = `Max Execution Frequency: Trade opened ${diff}s after previous trade, minimum ${universal.maxExecutionFrequencySeconds}s gap required`;
        break;
      }
    }
  }

  // 6. MARTINGALE DETECTION CHECK
  if (!breachType) {
    const sortedByTime = [...recentTrades].sort((a: any, b: any) => a.openTime - b.openTime);
    for (let i = 1; i < sortedByTime.length; i++) {
      const prev = sortedByTime[i - 1];
      const next = sortedByTime[i];
      if (prev.symbol === next.symbol) {
        const prevPnl = parseFloat(String(prev.pnl || prev.profit || 0));
        const prevLots = parseFloat(String(prev.lots || prev.volume || 0));
        const nextLots = parseFloat(String(next.lots || next.volume || 0));
        const timeDiff = next.openTime - prev.openTime;

        if (prevPnl < 0 && nextLots > prevLots && timeDiff < 3600) {
          breachType = 'hard';
          breachReason = `Martingale Detected: Lot size increased after loss on symbol ${next.symbol}`;
          break;
        }
      }
    }
  }

  // 7. MAX FLOATING LOSS CHECK (funded only)
  if (!breachType && phaseKey === 'funded') {
    const floatingLoss = currBalance > currEquity ? currBalance - currEquity : 0;
    const floatingLossLimit = initialBalance * (rules.maxFloatingLoss || 1) / 100;
    if (floatingLoss >= floatingLossLimit) {
      breachType = 'hard';
      breachReason = `Max Floating Loss: Floating loss $${floatingLoss.toFixed(2)} exceeded $${floatingLossLimit.toFixed(2)} limit`;
    }
  }

  // 8. PROFIT TARGET + MIN TRADING DAYS (evaluation)
  if (!breachType && rules.profitTarget) {
    const profitGained = currBalance - initialBalance;
    const targetAmount = initialBalance * (rules.profitTarget / 100);
    
    if (profitGained >= targetAmount) {
      const distinctDays = new Set();
      recentTrades.forEach((t: any) => {
        if (t.closeTime) {
          const date = new Date(t.closeTime * 1000).toISOString().split('T')[0];
          distinctDays.add(date);
        }
      });

      if (distinctDays.size >= (rules.minTradingDays || 1)) {
        await db.collection('mt5_accounts').doc(String(login)).update({ readyForNextPhase: true });
      }
    }
  }

  // 9. INSTANT FUNDING SPECIAL
  if (!breachType && planKey === 'instant-funding') {
    const symbolCounts: Record<string, number> = {};
    recentTrades.forEach((t: any) => {
      if (t.symbol) {
        symbolCounts[t.symbol] = (symbolCounts[t.symbol] || 0) + 1;
      }
    });

    for (const [symbol, count] of Object.entries(symbolCounts)) {
      if (count < 5) {
        const reason = `Minimum 5 trades required per instrument. Symbol ${symbol} has only ${count} trades.`;
        const breachId = `soft_${login}_min_trades_${symbol}`;
        const existing = await db.collection('softBreaches').doc(breachId).get();
        if (!existing.exists) {
          await db.collection('softBreaches').doc(breachId).set({
            login, userId, reason, type: 'soft', createdAt: FieldValue.serverTimestamp()
          });
          await db.collection('mt5_accounts').doc(String(login)).update({ readyForPhaseReset: true });
        }
      }
    }
  }

  if (breachType === 'hard') {
    const breachId = `hard_${login}_${breachReason.substring(0, 20).replace(/[^a-z0-9]/gi, '_')}`;
    const existing = await db.collection('breaches').doc(breachId).get();
    
    if (!existing.exists) {
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
    }
    return { breached: true, reason: breachReason };
  }

  return { breached: false, reason: null };
}
