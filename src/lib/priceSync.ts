import { getAdminDb, getAdminRtdb } from '@/lib/firebase-admin';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { auditActiveOpenPositions, auditDemoAccount } from '@/lib/rulesEngine';
import { setLatestOandaTick } from './oandaStream';
import { setLatestCoinbaseTick } from './coinbaseStream';

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
 * Synchronizes local memory ticks across all server nodes by listening to RTDB.
 * This ensures SSE streams work correctly even on non-leader nodes.
 */
export function startGlobalPriceSync() {
  try {
    const rtdb = getAdminRtdb();
    const pricesRef = rtdb.ref('livePrices');

    console.log('[PriceSync] Initializing Global Memory Listener...');

    pricesRef.on('value', (snapshot) => {
      const data = snapshot.val();
      if (!data) return;

      Object.entries(data).forEach(([symbol, tick]: [string, any]) => {
        const payload = {
          price: Number(tick.price),
          bid: Number(tick.bid),
          ask: Number(tick.ask)
        };

        if (['BTCUSD', 'ETHUSD', 'SOLUSD', 'XRPUSD', 'ADAUSD', 'DOGEUSD', 'BNBUSD'].includes(symbol)) {
          setLatestCoinbaseTick(symbol, payload);
        } else {
          setLatestOandaTick(symbol, payload);
        }
      });
    });
  } catch (err) {
    console.error('[PriceSync] Memory Listener Failed:', err);
  }
}

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
        if (trade.tp && trade.tp > 0 && bid >= trade.tp) { hit = 'tp'; closePrice = trade.tp; }
        else if (trade.sl && trade.sl > 0 && bid <= trade.sl) { hit = 'sl'; closePrice = trade.sl; }
      } else {
        if (trade.tp && trade.tp > 0 && ask <= trade.tp) { hit = 'tp'; closePrice = trade.tp; }
        else if (trade.sl && trade.sl > 0 && ask >= trade.sl) { hit = 'sl'; closePrice = trade.sl; }
      }

      if (!hit) continue;

      const priceDiff = trade.type === 'buy' ? (closePrice - openPrice) : (openPrice - closePrice);
      const pnl = priceDiff * lots * contractSize;

      await db.runTransaction(async (tx: any) => {
        tx.update(tradeDoc.ref, {
          status: 'closed', 
          closedAt: FieldValue.serverTimestamp(),
          closePrice, pnl, 
          closeReason: hit === 'tp' ? 'take_profit' : 'stop_loss'
        });
        tx.update(db.collection('demoAccounts').doc(trade.accountId), { 
          balance: FieldValue.increment(pnl), 
          updatedAt: FieldValue.serverTimestamp() 
        });
      });
      
      await auditDemoAccount(trade.accountId);
    }
  } catch (err) {}
}

export async function syncPricesAndAudit() {
  const db = getAdminDb();

  try {
    const lockRef = db.collection('_system').doc('priceSyncLock');
    await lockRef.set({ lockedAt: Timestamp.now(), instanceId: process.env.K_REVISION || 'unknown' });
    
    await checkTpSlHits(db);
    const result = await auditActiveOpenPositions();
    
    return { success: true, ...result };
  } catch (error: any) {
    throw error;
  }
}
