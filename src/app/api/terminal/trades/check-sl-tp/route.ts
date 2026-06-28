import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * @fileOverview SL/TP Risk Engine
 * Periodically checks all open demo trades against live market prices.
 * Triggered via GitHub Actions Cron every 30 seconds.
 */

const CONTRACT_SIZE: Record<string, number> = {
  XAUUSD: 100, BTCUSD: 1, ETHUSD: 1, EURUSD: 100000, GBPUSD: 100000, USDJPY: 100000,
};

function getContractSize(symbol: string): number {
  if (CONTRACT_SIZE[symbol]) return CONTRACT_SIZE[symbol];
  return 100000; // Default to forex standard
}

export async function GET(req: NextRequest) {
  const key = req.headers.get('x-api-key');
  if (!process.env.TERMINAL_CRON_KEY || key !== process.env.TERMINAL_CRON_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getAdminDb();
  
  try {
    // 1. Audit Daily Drawdown for all Active Accounts
    const activeAccountsSnap = await db.collection('demoAccounts')
      .where('status', '==', 'active')
      .get();
    
    const accountBatches = [];
    for (const accDoc of activeAccountsSnap.docs) {
      const acc = accDoc.data();
      const dailyStart = acc.dailyStartBalance || acc.startBalance;
      const currentEquity = acc.equity || acc.balance;
      const dailyLimit = acc.dailyLoss;

      if (dailyStart - currentEquity >= dailyLimit) {
        accountBatches.push(db.collection('demoAccounts').doc(accDoc.id).update({
          status: 'blown',
          breachReason: `Daily Drawdown Limit Hit ($${dailyLimit})`,
          updatedAt: FieldValue.serverTimestamp()
        }));
      }
    }
    if (accountBatches.length > 0) await Promise.all(accountBatches);

    // 2. Fetch Open Positions for SL/TP evaluation
    const tradesSnap = await db.collection('demoTrades')
      .where('status', '==', 'open')
      .get();
    
    if (tradesSnap.empty) return NextResponse.json({ closed: 0, checked: 0 });

    const symbols = [...new Set(tradesSnap.docs.map(d => d.data().symbol))];
    const prices: Record<string, any> = {};
    
    await Promise.all(symbols.map(async (sym) => {
      const doc = await db.collection('livePrices').doc(sym).get();
      if (doc.exists) prices[sym] = doc.data();
    }));

    let closedCount = 0;
    
    for (const tradeDoc of tradesSnap.docs) {
      const trade = tradeDoc.data();
      const priceData = prices[trade.symbol];
      if (!priceData || !priceData.price) continue;

      const currentPrice = priceData.price;
      const bid = priceData.bid || currentPrice;
      const ask = priceData.ask || currentPrice;

      let shouldClose = false;
      let executionPrice = 0;

      if (trade.type === 'buy') {
        if (trade.sl && bid <= trade.sl) { shouldClose = true; executionPrice = bid; }
        else if (trade.tp && bid >= trade.tp) { shouldClose = true; executionPrice = bid; }
      } 
      else if (trade.type === 'sell') {
        if (trade.sl && ask >= trade.sl) { shouldClose = true; executionPrice = ask; }
        else if (trade.tp && ask <= trade.tp) { shouldClose = true; executionPrice = ask; }
      }

      if (!shouldClose) continue;

      try {
        await db.runTransaction(async (tx) => {
          const accountRef = db.collection('demoAccounts').doc(trade.accountId);
          const accountDoc = await tx.get(accountRef);
          if (!accountDoc.exists) return;
          
          const account = accountDoc.data()!;
          const contractSize = getContractSize(trade.symbol);
          
          const pnl = trade.type === 'buy' 
            ? (executionPrice - trade.openPrice) * trade.lots * contractSize
            : (trade.openPrice - executionPrice) * trade.lots * contractSize;

          const newBalance = parseFloat((account.balance + pnl).toFixed(2));
          let newStatus = account.status;
          let breachReason = account.breachReason || null;

          // Rule 1: Max Total Loss
          if (account.startBalance - newBalance >= account.maxLoss) {
            newStatus = 'blown';
            breachReason = `Maximum Drawdown Limit Hit ($${account.maxLoss})`;
          } 
          // Rule 2: Single Trade Loss Breach (3%)
          else if (pnl < 0 && Math.abs(pnl) >= (account.balance * 0.03)) {
            newStatus = 'blown';
            breachReason = 'Single Trade Loss Limit Hit (3% Max)';
          }
          // Rule 3: Profit Target
          else if (newBalance - account.startBalance >= account.profitTarget) {
            newStatus = 'passed';
          }

          tx.update(tradeDoc.ref, {
            status: 'closed',
            closePrice: executionPrice,
            closedAt: FieldValue.serverTimestamp(),
            pnl: parseFloat(pnl.toFixed(2))
          });

          tx.update(accountRef, {
            balance: newBalance,
            equity: newBalance,
            status: newStatus,
            breachReason,
            updatedAt: FieldValue.serverTimestamp()
          });
        });
        closedCount++;
      } catch (err) {
        console.error(`[RiskEngine] Closure failed for ${tradeDoc.id}:`, err);
      }
    }

    return NextResponse.json({ success: true, closed: closedCount, checked: tradesSnap.size });
  } catch (error: any) {
    console.error('[RiskEngine] Critical Failure:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
