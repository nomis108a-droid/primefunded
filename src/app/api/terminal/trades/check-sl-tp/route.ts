import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { RULES_CONFIG, getPlanKey, CONTRACT_SIZE } from '@/lib/rulesConfig';

/**
 * @fileOverview Institutional SL/TP & Gross Risk Engine
 * Continuous monitoring of open positions using strict Bid/Ask exit logic.
 * BUY positions close at BID, SELL positions close at ASK.
 */

export async function GET(req: NextRequest) {
  const key = req.headers.get('x-api-key');
  if (!process.env.TERMINAL_CRON_KEY || key !== process.env.TERMINAL_CRON_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getAdminDb();
  
  try {
    // 1. Fetch only active nodes and open trades
    const activeAccountsSnap = await db.collection('demoAccounts').where('status', '==', 'active').get();
    const openTradesSnap = await db.collection('demoTrades').where('status', '==', 'open').get();
    
    if (openTradesSnap.empty) return NextResponse.json({ success: true, checked: activeAccountsSnap.size, hits: 0 });

    // 2. Fetch authoritative market ticks
    const pricesSnap = await db.collection('market').get();
    const prices: Record<string, any> = {};
    pricesSnap.docs.forEach(d => prices[d.id.toUpperCase().trim()] = d.data());

    let sltpClosed = 0;

    for (const tradeDoc of openTradesSnap.docs) {
      const trade = tradeDoc.data() as any;
      const symbol = (trade.symbol || "").toUpperCase().trim();
      const priceData = prices[symbol];
      
      if (!priceData || !priceData.bid || !priceData.ask) continue;

      const bid = priceData.bid;
      const ask = priceData.ask;
      
      let triggerPrice = 0;
      let exitReason = "";
      
      // BUY exit at BID, SELL exit at ASK
      if (trade.type === 'buy') {
        if (trade.sl && bid <= trade.sl) { triggerPrice = trade.sl; exitReason = "stop_loss"; }
        else if (trade.tp && bid >= trade.tp) { triggerPrice = trade.tp; exitReason = "take_profit"; }
      } else {
        if (trade.sl && ask >= trade.sl) { triggerPrice = trade.sl; exitReason = "stop_loss"; }
        else if (trade.tp && ask <= trade.tp) { triggerPrice = trade.tp; exitReason = "take_profit"; }
      }

      if (triggerPrice > 0) {
        const contractSize = CONTRACT_SIZE[symbol] || 100000;
        const pnl = (trade.type === 'buy' ? triggerPrice - trade.openPrice : trade.openPrice - triggerPrice) * trade.lots * contractSize;
        
        await db.runTransaction(async (tx) => {
          const accRef = db.collection('demoAccounts').doc(trade.accountId);
          const accSnap = await tx.get(accRef);
          if (!accSnap.exists) return;

          tx.update(tradeDoc.ref, {
            status: 'closed',
            closeReason: exitReason,
            closePrice: triggerPrice,
            closeBid: bid,
            closeAsk: ask,
            pnl,
            closedAt: FieldValue.serverTimestamp()
          });

          tx.update(accRef, {
            balance: FieldValue.increment(pnl),
            updatedAt: FieldValue.serverTimestamp()
          });
        });
        sltpClosed++;
      }
    }

    return NextResponse.json({ success: true, checked: openTradesSnap.size, hits: sltpClosed });
  } catch (error: any) {
    console.error('[RiskEngine] Critical Failure:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
