import { RULES_CONFIG, getPlanKey, CONTRACT_SIZE } from '@/lib/rulesConfig';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import { sendBreachEmail, sendChallengePassEmail } from '@/lib/email';

/**
 * @fileOverview Institutional Demo Audit Engine (V4)
 * Evaluates internal demo accounts and trades against prop firm hard-breach risk protocols.
 * Strictly uses BID for BUY close and ASK for SELL close conditions for all PnL and risk math.
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

function getTradeDate(time: any) {
  if (!time) return null;
  if (time.toDate) return time.toDate();
  return new Date(time);
}

/**
 * Enforces per-trade floating loss limits (Soft Breach Policy).
 * Standardized: BUY uses current BID, SELL uses current ASK.
 */
async function enforceSymbolFloatingLossLimits(
  db: any,
  accountId: string,
  userId: string,
  startBalance: number,
  openTrades: TradeRecord[],
  prices: Record<string, any>,
  maxFloatingLossPct: number
) {
  const limitUsd = startBalance * (maxFloatingLossPct / 100);
  const closedIds = new Set<string>();
  let totalRealizedLoss = 0;

  const bySymbol: Record<string, { trades: TradeRecord[]; pnl: number }> = {};
  for (const t of openTrades) {
    const sym = (t.symbol || '').toUpperCase().trim();
    const priceData = prices[sym];
    if (!priceData) continue;
    
    // BUY positions close at BID, SELL positions close at ASK
    const exitPrice = t.type === 'buy' ? (priceData.bid || priceData.price) : (priceData.ask || priceData.price);
    const contractSize = CONTRACT_SIZE[sym] || 100000;
    const pnl = (t.type === 'buy' ? exitPrice - t.openPrice! : t.openPrice! - exitPrice) * t.lots! * contractSize;
    
    if (!bySymbol[sym]) bySymbol[sym] = { trades: [], pnl: 0 };
    bySymbol[sym].trades.push(t);
    bySymbol[sym].pnl += pnl;
  }

  for (const sym of Object.keys(bySymbol)) {
    const group = bySymbol[sym];
    if (group.pnl < 0 && Math.abs(group.pnl) >= limitUsd) {
      for (const t of group.trades) {
        const priceData = prices[sym];
        const exitPrice = t.type === 'buy' ? (priceData.bid || priceData.price) : (priceData.ask || priceData.price);
        const contractSize = CONTRACT_SIZE[sym] || 100000;
        const tradePnl = (t.type === 'buy' ? exitPrice - t.openPrice! : t.openPrice! - exitPrice) * t.lots! * contractSize;

        await db.runTransaction(async (tx: any) => {
          tx.update(t.ref, {
            status: 'closed',
            closedAt: FieldValue.serverTimestamp(),
            closeReason: 'liquidation',
            closePrice: exitPrice,
            closeBid: priceData.bid,
            closeAsk: priceData.ask,
            pnl: tradePnl,
            liquidated: true
          });
          tx.update(db.collection('demoAccounts').doc(accountId), {
            balance: FieldValue.increment(tradePnl),
            updatedAt: FieldValue.serverTimestamp()
          });
          tx.set(db.collection('users').doc(userId).collection('notifications').doc(), {
            title: '🛡️ Trade Auto-Closed',
            message: `${sym} trades force-closed: combined floating loss on this symbol exceeded ${maxFloatingLossPct}% of your starting balance.`,
            type: 'risk_warning',
            isRead: false,
            createdAt: FieldValue.serverTimestamp()
          });
        });
        closedIds.add(t.id);
      }
      totalRealizedLoss += Math.abs(group.pnl);
    }
  }

  return { closedIds, realizedLossFromForceClose: totalRealizedLoss };
}

/**
 * Enforces single trade loss limit as a HARD BREACH.
 */
async function enforceSingleTradeLossLimit(
  db: any,
  accountId: string,
  userId: string,
  startBalance: number,
  openTrades: TradeRecord[],
  prices: Record<string, any>,
  maxSingleTradeLossPct: number
) {
  const limitUsd = startBalance * (maxSingleTradeLossPct / 100);
  
  for (const t of openTrades) {
    const sym = (t.symbol || '').toUpperCase().trim();
    const priceData = prices[sym];
    if (!priceData) continue;
    
    const exitPrice = t.type === 'buy' ? (priceData.bid || priceData.price) : (priceData.ask || priceData.price);
    const contractSize = CONTRACT_SIZE[sym] || 100000;
    const pnl = (t.type === 'buy' ? exitPrice - t.openPrice! : t.openPrice! - exitPrice) * t.lots! * contractSize;

    if (pnl < 0 && Math.abs(pnl) >= limitUsd) {
      return `Single trade loss violation: Trade on ${sym} lost $${Math.abs(pnl).toFixed(2)} which exceeded ${maxSingleTradeLossPct}% limit.`;
    }
  }
  return null;
}

/**
 * Audits a single demo account for drawdown and challenge passage.
 */
export async function auditDemoAccount(accountId: string) {
  const db = getAdminDb();
  const accRef = db.collection('demoAccounts').doc(accountId);
  const accSnap = await accRef.get();
  
  if (!accSnap.exists) return null;
  const account = accSnap.data()!;
  if (account.status !== 'active') return { status: account.status };

  const { userId, startBalance, balance, planType, phase, email, name, createdAt } = account;
  const initialBalance = parseFloat(String(startBalance || 100000));
  const currBalance = parseFloat(String(balance || initialBalance));

  const pKey = getPlanKey(planType || '1-step-pro');
  const phKey = phase || (pKey.startsWith('instant') ? 'funded' : 'evaluation');
  const rules = RULES_CONFIG.plans[pKey]?.[phKey] || RULES_CONFIG.plans['1-step-pro']['evaluation'];
  const universal = RULES_CONFIG.universal;

  const [tradesSnap, pricesSnap] = await Promise.all([
    db.collection('demoTrades').where('accountId', '==', accountId).get(),
    db.collection('market').get()
  ]);

  const trades: TradeRecord[] = tradesSnap.docs.map(d => ({ id: d.id, ref: d.ref, ...d.data() } as TradeRecord));
  const prices: Record<string, any> = {};
  pricesSnap.docs.forEach(d => prices[d.id.toUpperCase().trim()] = d.data());

  // Fallback if unified market collection is empty
  if (Object.keys(prices).length === 0) {
    const backupPrices = await db.collection('livePrices').get();
    backupPrices.docs.forEach(d => prices[d.id.toUpperCase().trim()] = d.data());
  }

  let openTrades = trades.filter(t => t.status === 'open');
  const closedTrades = trades.filter(t => t.status === 'closed');

  let breachReason = '';

  // 1. Account Expiry Check
  if (rules.accountExpiryDays && createdAt) {
    const createdTime = (createdAt as Timestamp).toDate().getTime();
    const expiryMs = rules.accountExpiryDays * 24 * 60 * 60 * 1000;
    if (Date.now() > (createdTime + expiryMs)) {
      breachReason = `Account expired: Your ${rules.accountExpiryDays}-day trading window has ended.`;
    }
  }

  // 2. Execution Frequency Check
  if (!breachReason) {
    const sortedByOpen = [...trades].sort((a, b) => 
      getTradeDate(a.openedAt)!.getTime() - getTradeDate(b.openedAt)!.getTime()
    );
    for (let i = 1; i < sortedByOpen.length; i++) {
      const prevOpen = getTradeDate(sortedByOpen[i-1].openedAt)!.getTime();
      const currOpen = getTradeDate(sortedByOpen[i].openedAt)!.getTime();
      const diff = (currOpen - prevOpen) / 1000;
      if (diff < (universal.maxExecutionFrequencySeconds || 180)) {
        breachReason = `Execution frequency violation: Trade opened too fast (min 3 mins required between orders).`;
        break;
      }
    }
  }

  // 3. Martingale Audit
  if (!breachReason && universal.noMartingale) {
    const symGroups: Record<string, TradeRecord[]> = {};
    trades.forEach(t => {
      const s = (t.symbol || '').toUpperCase().trim();
      if (!symGroups[s]) symGroups[s] = [];
      symGroups[s].push(t);
    });

    for (const sym of Object.keys(symGroups)) {
      const group = symGroups[sym].sort((a, b) => getTradeDate(a.openedAt)!.getTime() - getTradeDate(b.openedAt)!.getTime());
      for (let i = 1; i < group.length; i++) {
        const prev = group[i-1];
        const curr = group[i];
        if (prev.status === 'closed' && (parseFloat(String(prev.pnl)) < 0)) {
           const prevCloseTime = getTradeDate(prev.closedAt)!.getTime();
           const currOpenTime = getTradeDate(curr.openedAt)!.getTime();
           if (currOpenTime > prevCloseTime && curr.lots! > prev.lots!) {
              breachReason = `Martingale violation: Lot size increased after a loss on ${sym}.`;
              break;
           }
        }
      }
      if (breachReason) break;
    }
  }

  // 4. Soft Breach: Symbol Floating Loss (Uses strict Bid/Ask)
  let realizedLossFromForceClose = 0;
  if (!breachReason && rules.maxFloatingLoss && openTrades.length > 0) {
    const floatingResult = await enforceSymbolFloatingLossLimits(
      db, accountId, userId, initialBalance, openTrades, prices, rules.maxFloatingLoss
    );
    realizedLossFromForceClose += floatingResult.realizedLossFromForceClose;
    openTrades = openTrades.filter(t => !floatingResult.closedIds.has(t.id));
  }

  // 5. Hard Breach: Single Trade Loss (Uses strict Bid/Ask)
  if (!breachReason && rules.maxSingleTradeLoss && openTrades.length > 0) {
    const singleBreach = await enforceSingleTradeLossLimit(db, accountId, userId, initialBalance, openTrades, prices, rules.maxSingleTradeLoss);
    if (singleBreach) breachReason = singleBreach;
  }

  // 6. Calculate Current Total Floating PnL
  let totalFloatingPnl = 0;
  for (const t of openTrades) {
    const sym = (t.symbol?.toUpperCase() || '').trim();
    const priceData = prices[sym];
    if (!priceData) continue;
    const exitPrice = t.type === 'buy' ? (priceData.bid || priceData.price) : (priceData.ask || priceData.price);
    const contractSize = CONTRACT_SIZE[sym] || 100000;
    totalFloatingPnl += (t.type === 'buy' ? exitPrice - t.openPrice! : t.openPrice! - exitPrice) * t.lots! * contractSize;
  }

  const currentEquity = currBalance + totalFloatingPnl;
  const now = new Date();
  const sessionStart = new Date(now);
  sessionStart.setUTCHours(2, 0, 0, 0); 
  if (now.getUTCHours() < 2) sessionStart.setUTCDate(sessionStart.getUTCDate() - 1); 

  // 7. Drawdown Logic (Hard Breach)
  let realizedLossToday = realizedLossFromForceClose;
  closedTrades.forEach(t => {
    const closedDate = getTradeDate(t.closedAt);
    if (closedDate && closedDate >= sessionStart && (parseFloat(String(t.pnl)) < 0)) {
      realizedLossToday += Math.abs(parseFloat(String(t.pnl)));
    }
  });

  const dailyLimit = initialBalance * (rules.dailyDrawdown / 100);
  const totalDailyRisk = realizedLossToday + (totalFloatingPnl < 0 ? Math.abs(totalFloatingPnl) : 0);

  if (!breachReason && totalDailyRisk >= dailyLimit) {
    breachReason = `Daily drawdown violation: Total risk (Realized Loss + Floating Loss) exceeded ${rules.dailyDrawdown}% limit.`;
  }

  const maxLimit = initialBalance * (rules.maxDrawdown / 100);
  if (!breachReason && (initialBalance - currentEquity) >= maxLimit) {
    breachReason = `Maximum drawdown violation: Total equity loss exceeded ${rules.maxDrawdown}% limit.`;
  }

  // 8. Challenge Passage Audit
  const tradingWindows = new Set<string>(); 
  closedTrades.forEach(t => {
    const closedDate = getTradeDate(t.closedAt);
    if (closedDate) {
      const windowStart = new Date(closedDate);
      windowStart.setUTCHours(2, 0, 0, 0);
      if (closedDate.getUTCHours() < 2) windowStart.setUTCDate(windowStart.getUTCDate() - 1);
      tradingWindows.add(windowStart.toISOString());
    }
  });

  const distinctTradingDays = tradingWindows.size;
  const minDaysRequired = rules.minTradingDays || rules.minTradingDaysBeforePayout || 0;
  const profitTargetAmount = initialBalance * (rules.profitTarget || 10) / 100;
  const targetMet = currBalance >= (initialBalance + profitTargetAmount);
  
  const isPassed = !breachReason && targetMet && distinctTradingDays >= minDaysRequired;

  // 9. Process Breach or Passage
  if (breachReason) {
    const batch = db.batch();
    batch.update(accRef, {
      status: 'blown',
      breachReason,
      equity: currentEquity,
      blownAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });

    for (const t of openTrades) {
      const sym = (t.symbol?.toUpperCase() || '').trim();
      const priceData = prices[sym];
      const exitPrice = priceData ? (t.type === 'buy' ? (priceData.bid || priceData.price) : (priceData.ask || priceData.price)) : t.openPrice;
      const contractSize = CONTRACT_SIZE[sym] || 100000;
      const finalPnl = priceData ? (t.type === 'buy' ? exitPrice - t.openPrice! : t.openPrice! - exitPrice) * t.lots! * contractSize : 0;

      batch.update(t.ref, {
        status: 'closed',
        closedAt: FieldValue.serverTimestamp(),
        closeReason: 'account_blown',
        closePrice: exitPrice,
        closeBid: priceData?.bid || null,
        closeAsk: priceData?.ask || null,
        pnl: finalPnl
      });
    }

    batch.update(db.collection('users').doc(userId), { accountStatus: 'breached' });
    batch.set(db.collection('breaches').doc(), {
      accountId, 
      userId, 
      email: email || null, 
      reason: breachReason, 
      type: 'hard', 
      breachedAt: FieldValue.serverTimestamp(), 
      planType: planType || null, 
      phase: phase || null
    });

    batch.set(db.collection('users').doc(userId).collection('notifications').doc(), {
      userId, type: 'account_breached', title: '❌ Account Breached', 
      message: `Your node terminal has been liquidated: ${breachReason}`, 
      isRead: false, createdAt: FieldValue.serverTimestamp()
    });

    await batch.commit();
    sendBreachEmail(email || userId, breachReason);
    return { breached: true, reason: breachReason };
  }

  if (isPassed) {
    const batch = db.batch();
    batch.update(accRef, { status: 'passed', passedAt: FieldValue.serverTimestamp(), readyForNextPhase: true });
    batch.update(db.collection('users').doc(userId), { accountStatus: 'passed' });
    batch.set(db.collection('users').doc(userId).collection('notifications').doc(), {
      userId, type: 'phase_passed', title: '✅ Challenge Passed!', 
      message: `Congratulations! You reached the profit target and met the minimum trading requirements. Your next node will be provisioned shortly.`, 
      isRead: false, createdAt: FieldValue.serverTimestamp()
    });
    await batch.commit();
    sendChallengePassEmail(email || userId, name || "Trader", pKey, String(initialBalance));
    return { passed: true };
  }

  // 10. Update real-time equity if no breach/passage occurred
  await accRef.update({ equity: currentEquity, updatedAt: FieldValue.serverTimestamp() });
  return { status: 'active', equity: currentEquity };
}

/**
 * Targeted audit for accounts with active exposure.
 */
export async function auditActiveOpenPositions() {
  const db = getAdminDb();
  const openTradesSnap = await db.collection('demoTrades').where('status', '==', 'open').get();
  
  const accountIds = new Set<string>();
  openTradesSnap.docs.forEach(doc => {
    const data = doc.data();
    if (data.accountId) accountIds.add(data.accountId);
  });
  
  const idArray = Array.from(accountIds);
  const results = { 
    totalOpenPositionAccounts: idArray.length, 
    breachesDetected: 0, 
    passed: 0, 
    errors: 0 
  };

  const BATCH_SIZE = 25;
  for (let i = 0; i < idArray.length; i += BATCH_SIZE) {
    const batchIds = idArray.slice(i, i + BATCH_SIZE);
    await Promise.all(batchIds.map(async (accountId) => {
      try {
        const res = await auditDemoAccount(accountId);
        if (res?.breached) results.breachesDetected++;
        else if (res?.passed) results.passed++;
      } catch (err) {
        console.error(`[RiskAudit] Failed for Node ${accountId}:`, err);
        results.errors++;
      }
    }));
  }

  return results;
}
