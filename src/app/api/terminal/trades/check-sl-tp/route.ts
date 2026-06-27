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
  // 1. Authenticate Request
  const key = req.headers.get('x-api-key');
  if (!process.env.TERMINAL_CRON_KEY || key !== process.env.TERMINAL_CRON_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getAdminDb();
  
  try {
    // 2. Fetch Open Positions
    const tradesSnap = await db.collection('demoTrades')
      .where('status', '==', 'open')
      .get();
    
    if (tradesSnap.empty) return NextResponse.json({ closed: 0 });

    // 3. Aggregate Symbol Prices
    const symbols = [...new Set(tradesSnap.docs.map(d => d.data().symbol))];
    const prices: Record<string, any> = {};
    
    await Promise.all(symbols.map(async (sym) => {
      const doc = await db.collection('livePrices').doc(sym).get();
      if (doc.exists) {
        prices[sym] = doc.data();
      }
    }));

    let closedCount = 0;
    
    // 4. Evaluate Every Trade
    for (const tradeDoc of tradesSnap.docs) {
      const trade = tradeDoc.data();
      const priceData = prices[trade.symbol];
      if (!priceData || !priceData.price) continue;

      const currentPrice = priceData.price;
      const bid = priceData.bid || currentPrice;
      const ask = priceData.ask || currentPrice;

      let shouldClose = false;
      let closeReason = '';
      let executionPrice = 0;

      // BUY logic: Trigger SL if bid hits floor, Trigger TP if bid hits ceiling
      if (trade.type === 'buy') {
        if (trade.sl && bid <= trade.sl) { shouldClose = true; closeReason = 'sl'; executionPrice = bid; }
        else if (trade.tp && bid >= trade.tp) { shouldClose = true; closeReason = 'tp'; executionPrice = bid; }
      } 
      // SELL logic: Trigger SL if ask hits ceiling, Trigger TP if ask hits floor
      else if (trade.type === 'sell') {
        if (trade.sl && ask >= trade.sl) { shouldClose = true; closeReason = 'sl'; executionPrice = ask; }
        else if (trade.tp && ask <= trade.tp) { shouldClose = true; closeReason = 'tp'; executionPrice = ask; }
      }

      if (!shouldClose) continue;

      // 5. Execute Closure in Atomic Transaction
      try {
        await db.runTransaction(async (tx) => {
          const accountRef = db.collection('demoAccounts').doc(trade.accountId);
          const accountDoc = await tx.get(accountRef);
          
          if (!accountDoc.exists) return;
          const account = accountDoc.data()!;

          const contractSize = getContractSize(trade.symbol);
          
          let pnl = 0;
          if (trade.type === 'buy') {
            pnl = (executionPrice - trade.openPrice) * trade.lots * contractSize;
          } else {
            pnl = (trade.openPrice - executionPrice) * trade.lots * contractSize;
          }
          pnl = parseFloat(pnl.toFixed(2));

          const newBalance = parseFloat((account.balance + pnl).toFixed(2));
          
          // Breach Logic
          let newStatus = account.status;
          if (account.startBalance - newBalance >= account.maxLoss) {
            newStatus = 'blown';
          } else if (newBalance - account.startBalance >= account.profitTarget) {
            newStatus = 'passed';
          }

          // Update Trade
          tx.update(tradeDoc.ref, {
            status: 'closed',
            closePrice: executionPrice,
            closedAt: FieldValue.serverTimestamp(),
            pnl,
            closeReason,
          });

          // Update Account
          tx.update(accountRef, {
            balance: newBalance,
            equity: newBalance,
            status: newStatus,
            updatedAt: FieldValue.serverTimestamp()
          });
        });
        closedCount++;
      } catch (err) {
        console.error(`[RiskEngine] Closure failed for ${tradeDoc.id}:`, err);
      }
    }

    return NextResponse.json({ 
      success: true, 
      closed: closedCount, 
      checked: tradesSnap.size 
    });

  } catch (error: any) {
    console.error('[RiskEngine] Critical Failure:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
