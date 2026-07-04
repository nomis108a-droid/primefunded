import { getAdminDb } from '@/lib/firebase-admin';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { auditActiveOpenPositions, auditDemoAccount } from '@/lib/rulesEngine';

/**
 * @fileOverview Institutional Risk Auditor & Execution Engine
 * Monitors nodes with active exposure and processes automated exit orders (TP/SL).
 */

const CONTRACT_SIZE: Record<string, number> = {
  XAUUSD: 100, XAGUSD: 5000, XPTUSD: 50,
  EURUSD: 100000, GBPUSD: 100000, USDJPY: 100000,
  AUDUSD: 100000, USDCHF: 100000, USDCAD: 100000, NZDUSD: 100000,
  BTCUSD: 1, ETHUSD: 1, SOLUSD: 1, XRPUSD: 1000,
  BNBUSD: 1, DOGEUSD: 1000, ADAUSD: 1000
};

/**
 * Monitors and executes Take Profit and Stop Loss orders.
 * PERMANENT: Core terminal liquidation logic.
 */
async function checkTpSlHits(db: any) {
  try {
    const openTradesSnap = await db.collection('demoTrades').where('status', '==', 'open').get();
    if (openTradesSnap.empty) return;

    const symbols = [...new Set(openTradesSnap.docs.map((d: any) => d.data().symbol?.toUpperCase()).filter(Boolean))];
    const priceSnaps = await Promise.all(symbols.map((s: string) => db.collection('livePrices').doc(s).get()));
    
    const prices: Record<string, any> = {};
    priceSnaps.forEach((snap: any) => { 
      if (snap.exists) prices[snap.id] = snap.data(); 
    });

    for (const tradeDoc of openTradesSnap.docs) {
      const trade = tradeDoc.data();
      const symbol = trade.symbol?.toUpperCase();
      const priceData = prices[symbol];
      if (!priceData) continue;

      const bid = parseFloat(priceData.bid || priceData.price || 0);
      const ask = parseFloat(priceData.ask || priceData.price || 0);
      const openPrice = parseFloat(trade.openPrice || 0);
      const lots = parseFloat(trade.lots || 0);
      const contractSize = CONTRACT_SIZE[symbol] || 100000;

      let hit: 'tp' | 'sl' | null = null;
      let closePrice = 0;

      if (trade.type === 'buy') {
        const currentPrice = bid;
        if (trade.tp && trade.tp > 0 && currentPrice >= trade.tp) { 
          hit = 'tp'; 
          closePrice = trade.tp; 
        } else if (trade.sl && trade.sl > 0 && currentPrice <= trade.sl) { 
          hit = 'sl'; 
          closePrice = trade.sl; 
        }
      } else if (trade.type === 'sell') {
        const currentPrice = ask;
        if (trade.tp && trade.tp > 0 && currentPrice <= trade.tp) { 
          hit = 'tp'; 
          closePrice = trade.tp; 
        } else if (trade.sl && trade.sl > 0 && currentPrice >= trade.sl) { 
          hit = 'sl'; 
          closePrice = trade.sl; 
        }
      }

      if (!hit) continue;

      const priceDiff = trade.type === 'buy' ? (closePrice - openPrice) : (openPrice - closePrice);
      const pnl = Math.round(priceDiff * lots * contractSize * 100) / 100;

      const accountRef = db.collection('demoAccounts').doc(trade.accountId);
      const accountSnap = await accountRef.get();
      if (!accountSnap.exists) continue;

      const account = accountSnap.data();
      if (account.status === 'blown') continue;

      const newBalance = Math.round((parseFloat(account.balance || 0) + pnl) * 100) / 100;

      await db.runTransaction(async (tx: any) => {
        tx.update(tradeDoc.ref, {
          status: 'closed', 
          closedAt: FieldValue.serverTimestamp(),
          closePrice, 
          pnl, 
          closeReason: hit === 'tp' ? 'take_profit' : 'stop_loss'
        });
        tx.update(accountRef, { 
          balance: newBalance, 
          equity: newBalance, 
          updatedAt: FieldValue.serverTimestamp() 
        });
      });

      console.log(`[TP/SL] ${hit?.toUpperCase()} hit on ${symbol} trade ${tradeDoc.id} PnL: ${pnl}`);
      
      // Immediate audit after close to check for PASS or BREACH
      await auditDemoAccount(trade.accountId);
    }
  } catch (err: any) {
    console.error('[TP/SL] Engine error:', err.message);
  }
}

export async function syncPricesAndAudit() {
  const db = getAdminDb();

  // Concurrency Lock: Prevents overlapping cycles in multi-instance environments
  try {
    const lockRef = db.collection('_system').doc('priceSyncLock');
    const lockSnap = await lockRef.get();
    
    if (lockSnap.exists) {
      const data = lockSnap.data();
      if (data?.lockedAt) {
        const lockedAt = (data.lockedAt as Timestamp).toDate();
        const diff = Date.now() - lockedAt.getTime();
        if (diff < 2000) {
          return { success: true, skipped: true };
        }
      }
    }

    await lockRef.set({
      lockedAt: Timestamp.now(),
      instanceId: process.env.K_REVISION || 'unknown'
    });
  } catch (err: any) {
    console.warn('[RiskAudit] Lock acquisition failed, proceeding with caution.');
  }

  try {
    // 1. Process automated exits (TP/SL) - PERMANENT ENGINE
    await checkTpSlHits(db);

    // 2. Process risk audits for remaining open exposure
    const result = await auditActiveOpenPositions();
    
    return { 
      success: true, 
      ...result
    };

  } catch (error: any) {
    console.error('[RiskAudit] Fatal Audit Cycle Fault:', error.message);
    throw error;
  }
}
