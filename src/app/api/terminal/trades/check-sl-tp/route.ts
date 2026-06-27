import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * @fileOverview SL/TP Risk Engine
 * Periodically checks all open demo trades against live market prices.
 * Triggered via GitHub Actions Cron.
 */

export async function GET(req: NextRequest) {
  // 1. Authenticate Request
  const key = req.headers.get('x-api-key');
  if (!process.env.TERMINAL_CRON_KEY || key !== process.env.TERMINAL_CRON_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getAdminDb();
  
  // 2. Fetch Open Positions
  const tradesSnap = await db.collection('demoTrades')
    .where('status', '==', 'open')
    .get();
  
  if (tradesSnap.empty) return NextResponse.json({ closed: 0 });

  // 3. Aggregate Symbol Prices
  const symbols = [...new Set(tradesSnap.docs.map(d => d.data().symbol))];
  const prices: Record<string, number> = {};
  
  await Promise.all(symbols.map(async (sym) => {
    const doc = await db.collection('livePrices').doc(sym).get();
    if (doc.exists) {
      prices[sym] = doc.data()!.price;
    }
  }));

  let closedCount = 0;
  
  // 4. Evaluate Every Trade
  for (const tradeDoc of tradesSnap.docs) {
    const trade = tradeDoc.data();
    const currentPrice = prices[trade.symbol];
    if (!currentPrice) continue;

    let shouldClose = false;
    let closeReason = '';

    // Check Trigger Levels
    if (trade.type === 'buy') {
      if (trade.sl && currentPrice <= trade.sl) { shouldClose = true; closeReason = 'sl'; }
      if (trade.tp && currentPrice >= trade.tp) { shouldClose = true; closeReason = 'tp'; }
    } else if (trade.type === 'sell') {
      if (trade.sl && currentPrice >= trade.sl) { shouldClose = true; closeReason = 'sl'; }
      if (trade.tp && currentPrice <= trade.tp) { shouldClose = true; closeReason = 'tp'; }
    }

    if (!shouldClose) continue;

    // 5. Execute Closure in Atomic Transaction
    try {
      await db.runTransaction(async (tx) => {
        const accountRef = db.collection('demoAccounts').doc(trade.accountId);
        const accountDoc = await tx.get(accountRef);
        if (!accountDoc.exists) return;

        const account = accountDoc.data()!;
        
        // Institutional Calculation
        const isForex = !['XAUUSD', 'BTCUSD', 'ETHUSD'].includes(trade.symbol);
        const contractSize = isForex ? 100000 : (trade.symbol === 'XAUUSD' ? 100 : 1);
        
        let pnl = 0;
        if (trade.type === 'buy') {
          pnl = (currentPrice - trade.openPrice) * trade.lots * contractSize;
        } else {
          pnl = (trade.openPrice - currentPrice) * trade.lots * contractSize;
        }
        pnl = parseFloat(pnl.toFixed(2));

        const newBalance = parseFloat((account.balance + pnl).toFixed(2));
        
        // Status Logic
        let newStatus = account.status;
        if (account.startBalance - newBalance >= account.maxLoss) {
          newStatus = 'blown';
        } else if (newBalance - account.startBalance >= account.profitTarget) {
          newStatus = 'passed';
        }

        // Apply Updates
        tx.update(tradeDoc.ref, {
          status: 'closed',
          closePrice: currentPrice,
          closedAt: FieldValue.serverTimestamp(),
          pnl,
          closeReason,
        });

        tx.update(accountRef, {
          balance: newBalance,
          equity: newBalance,
          status: newStatus,
        });
      });
      closedCount++;
    } catch (err) {
      console.error(`[SL-TP] Transaction failed for trade ${tradeDoc.id}:`, err);
    }
  }

  return NextResponse.json({ 
    success: true, 
    closed: closedCount, 
    checked: tradesSnap.size 
  });
}
