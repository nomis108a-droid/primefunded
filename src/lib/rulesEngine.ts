import { RULES_CONFIG, getPlanKey, CONTRACT_SIZE } from '@/lib/rulesConfig';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import { sendBreachEmail, sendChallengePassEmail } from '@/lib/email';
import { getAuthoritativePrice } from './priceSync';

/**
 * @fileOverview Institutional Demo Audit Engine (V5)
 * Hardened Risk Protocols for real-time challenge enforcement.
 * Enforces Drawdown and Breach logic across all active nodes.
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
 */
async function enforceSymbolFloatingLossLimits(
  db: any,
  accountId: string,
  userId: string,
  startBalance: number,
  openTrades: TradeRecord[],
  maxFloatingLossPct: number
) {
  const limitUsd = startBalance * (maxFloatingLossPct / 100);
  const closedIds = new Set<string>();
  let totalRealizedLoss = 0;

  const bySymbol: Record<string, { trades: TradeRecord[]; pnl: number; priceData: any }> = {};
  
  for (const t of openTrades) {
    const sym = (t.symbol || '').toUpperCase().trim();
    if (!bySymbol[sym]) {
      const price = await getAuthoritativePrice(sym);
      bySymbol[sym] = { trades: [], pnl: 0, priceData: price };
    }
    
    const priceData = bySymbol[sym].priceData;
    if (!priceData) continue;
    
    const exitPrice = t.type === 'buy' ? (priceData.bid || priceData.price) : (priceData.ask || priceData.price);
    const contractSize = CONTRACT_SIZE[sym] || 100000;
    const pnl = (t.type === 'buy' ? exitPrice - t.openPrice! : t.openPrice! - exitPrice) * t.lots! * contractSize;
    
    bySymbol[sym].trades.push(t);
    bySymbol[sym].pnl += pnl;
  }

  for (const sym of Object.keys(bySymbol)) {
    const group = bySymbol[sym];
    if (group.pnl < 0 && Math.abs(group.pnl) >= limitUsd) {
      for (const t of group.trades) {
        const priceData = group.priceData;
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
            dailyGrossLossUsd: tradePnl < 0 ? FieldValue.increment(Math.abs(tradePnl)) : FieldValue.increment(0),
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
  startBalance: number,
  openTrades: TradeRecord[]
) {
  for (const t of openTrades) {
    const sym = (t.symbol || '').toUpperCase().trim();
    const priceData = await getAuthoritativePrice(sym);
    if (!priceData) continue;
    
    const exitPrice = t.type === 'buy' ? (priceData.bid || priceData.price) : (priceData.ask || priceData.price);
    const contractSize = CONTRACT_SIZE[sym] || 100000;
    const pnl = (t.type === 'buy' ? exitPrice - t.openPrice! : t.openPrice! - exitPrice) * t.lots! * contractSize;

    const limitUsd = startBalance * 0.03; // Hardcoded 3% limit for protection
    if (pnl < 0 && Math.abs(pnl) >= limitUsd) {
      return `Single trade loss violation: Trade on ${sym} lost $${Math.abs(pnl).toFixed(2)} which exceeded 3% limit.`;
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

  const { userId, startBalance, balance, planType, phase, email, name, createdAt, dailyGrossLossUsd } = account;
  const initialBalance = parseFloat(String(startBalance || 100000));
  const currBalance = parseFloat(String(balance || initialBalance));

  const pKey = getPlanKey(planType || '1-step-pro');
  const phKey = phase || (pKey.startsWith('instant') ? 'funded' : 'evaluation');
  const rules = RULES_CONFIG.plans[pKey]?.[phKey] || RULES_CONFIG.plans['1-step-pro']['evaluation'];
  const universal = RULES_CONFIG.universal;

  const tradesSnap = await db.collection('demoTrades').where('accountId', '==', accountId).get();
  const trades: TradeRecord[] = tradesSnap.docs.map(d => ({ id: d.id, ref: d.ref, ...d.data() } as TradeRecord));
  
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

  // 3. Soft Breach: Symbol Floating Loss (Uses strict Bid/Ask)
  let realizedLossFromForceClose = 0;
  if (!breachReason && rules.maxFloatingLoss && openTrades.length > 0) {
    const floatingResult = await enforceSymbolFloatingLossLimits(
      db, accountId, userId, initialBalance, openTrades, rules.maxFloatingLoss
    );
    realizedLossFromForceClose += floatingResult.realizedLossFromForceClose;
    openTrades = openTrades.filter(t => !floatingResult.closedIds.has(t.id));
  }

  // 4. Hard Breach: Single Trade Loss (Uses strict Bid/Ask)
  if (!breachReason && openTrades.length > 0) {
    const singleBreach = await enforceSingleTradeLossLimit(initialBalance, openTrades);
    if (singleBreach) breachReason = singleBreach;
  }

  // 5. Calculate Current Total Floating PnL
  let totalFloatingPnl = 0;
  for (const t of openTrades) {
    const sym = (t.symbol?.toUpperCase() || '').trim();
    const priceData = await getAuthoritativePrice(sym);
    if (!priceData) continue;
    const exitPrice = t.type === 'buy' ? (priceData.bid || priceData.price) : (priceData.ask || priceData.price);
    const contractSize = CONTRACT_SIZE[sym] || 100000;
    totalFloatingPnl += (t.type === 'buy' ? exitPrice - t.openPrice! : t.openPrice! - exitPrice) * t.lots! * contractSize;
  }

  const currentEquity = currBalance + totalFloatingPnl;
  
  // 6. Drawdown Logic
  let realizedLossToday = realizedLossFromForceClose + (typeof dailyGrossLossUsd === 'number' ? dailyGrossLossUsd : 0);
  const dailyLimit = initialBalance * (rules.dailyDrawdown / 100);
  const totalDailyRisk = realizedLossToday + (totalFloatingPnl < 0 ? Math.abs(totalFloatingPnl) : 0);

  if (!breachReason && totalDailyRisk >= dailyLimit) {
    breachReason = `Daily drawdown violation: Total risk (Realized Loss + Floating Loss) exceeded ${rules.dailyDrawdown}% limit.`;
  }

  const maxLimit = initialBalance * (rules.maxDrawdown / 100);
  if (!breachReason && (initialBalance - currentEquity) >= maxLimit) {
    breachReason = `Maximum drawdown violation: Total equity loss exceeded ${rules.maxDrawdown}% limit.`;
  }

  // 7. Passage Audit
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

  if (breachReason) {
    const batch = db.batch();
    batch.update(accRef, { status: 'blown', breachReason, equity: currentEquity, blownAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    for (const t of openTrades) {
      const sym = (t.symbol?.toUpperCase() || '').trim();
      const p = await getAuthoritativePrice(sym);
      const exitPrice = p ? (t.type === 'buy' ? p.bid : p.ask) : t.openPrice;
      const contractSize = CONTRACT_SIZE[sym] || 100000;
      const finalPnl = p ? (t.type === 'buy' ? exitPrice - t.openPrice! : t.openPrice! - exitPrice) * t.lots! * contractSize : 0;
      batch.update(t.ref, { status: 'closed', closedAt: FieldValue.serverTimestamp(), closeReason: 'account_blown', closePrice: exitPrice, pnl: finalPnl });
    }
    batch.update(db.collection('users').doc(userId), { accountStatus: 'breached' });
    batch.set(db.collection('breaches').doc(), { accountId, userId, email: email || null, reason: breachReason, type: 'hard', breachedAt: FieldValue.serverTimestamp() });
    batch.set(db.collection('users').doc(userId).collection('notifications').doc(), { userId, type: 'account_breached', title: '❌ Account Breached', message: `Liquidated: ${breachReason}`, isRead: false, createdAt: FieldValue.serverTimestamp() });
    await batch.commit();
    sendBreachEmail(email || userId, breachReason);
    return { breached: true, reason: breachReason };
  }

  if (isPassed) {
    await accRef.update({ status: 'passed', passedAt: FieldValue.serverTimestamp() });
    sendChallengePassEmail(email || userId, name || "Trader", pKey, String(initialBalance));
    return { passed: true };
  }

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
  openTradesSnap.docs.forEach(doc => { if (doc.data().accountId) accountIds.add(doc.data().accountId); });
  
  const idArray = Array.from(accountIds);
  const results = { totalOpenPositionAccounts: idArray.length, breachesDetected: 0, passed: 0, errors: 0 };

  for (const accountId of idArray) {
    try {
      const res = await auditDemoAccount(accountId);
      if (res?.breached) results.breachesDetected++;
      else if (res?.passed) results.passed++;
    } catch (err) {
      results.errors++;
    }
  }
  return results;
}
