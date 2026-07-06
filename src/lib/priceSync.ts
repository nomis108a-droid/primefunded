import { getAdminDb, getAdminRtdb } from '@/lib/firebase-admin';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { auditActiveOpenPositions, auditDemoAccount } from '@/lib/rulesEngine';
import { setLatestOandaTick } from './oandaStream';
import { setLatestCoinbaseTick } from './coinbaseStream';
import { CONTRACT_SIZE } from './rulesConfig';

/**
 * @fileOverview Institutional Risk Auditor & Execution Engine
 * Monitors nodes with active exposure and processes automated exit orders (TP/SL).
 * Enforces strict Bid/Ask exit logic for all internal trading nodes.
 */

let isSyncing = false;

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

        const symUpper = symbol.toUpperCase().trim();
        if (['BTCUSD', 'ETHUSD', 'SOLUSD', 'XRPUSD', 'ADAUSD', 'DOGEUSD', 'BNBUSD'].includes(symUpper)) {
          setLatestCoinbaseTick(symUpper, payload);
        } else {
          setLatestOandaTick(symUpper, payload);
        }
      });
    });
  } catch (err) {
    console.error('[PriceSync] Memory Listener Failed:', err);
  }
}

/**
 * Institutional SL/TP Watcher
 * Evaluates all open positions against authoritative Bid/Ask ticks.
 */
async function checkTpSlHits(db: any) {
  try {
    // 1. Fetch all open positions across the network
    const openTradesSnap = await db.collection('demoTrades').where('status', '==', 'open').get();
    if (openTradesSnap.empty) return;

    // 2. Fetch authoritative prices for involved symbols
    const symbols = [...new Set(openTradesSnap.docs.map((d: any) => d.data().symbol?.toUpperCase().trim()).filter(Boolean))];
    const priceSnaps = await Promise.all(symbols.map((s: string) => db.collection('livePrices').doc(s).get()));
    
    const prices: Record<string, any> = {};
    priceSnaps.forEach((snap: any) => { 
      if (snap.exists) prices[snap.id.toUpperCase().trim()] = snap.data(); 
    });

    for (const tradeDoc of openTradesSnap.docs) {
      const trade = tradeDoc.data();
      const symbol = (trade.symbol || "").toUpperCase().trim();
      const priceData = prices[symbol];
      
      // ADMIN CLEANUP: Precision-hardened logic to close bugged demo positions
      const openPrice = parseFloat(trade.openPrice || 0);
      if (Math.abs(openPrice - 4185.658) < 0.01 && trade.status === 'open') {
        console.log(`[Cleanup] Terminating stale trade ${tradeDoc.id} (Price: ${openPrice})`);
        await tradeDoc.ref.update({ 
          status: 'closed', 
          closeReason: 'admin_cleanup', 
          pnl: 0, 
          closedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        });
        continue;
      }

      if (!priceData || !priceData.bid || !priceData.ask) continue;

      const bid = parseFloat(priceData.bid);
      const ask = parseFloat(priceData.ask);
      const lots = parseFloat(trade.lots || 0);
      const contractSize = CONTRACT_SIZE[symbol] || 100000;

      let triggerReason: 'take_profit' | 'stop_loss' | null = null;
      let executionPrice = 0;

      // 3. INSTITUTIONAL BID/ASK EXIT LOGIC
      if (trade.type === 'buy') {
        if (trade.tp && trade.tp > 0 && bid >= trade.tp) { 
          triggerReason = 'take_profit'; 
          executionPrice = trade.tp; 
        }
        else if (trade.sl && trade.sl > 0 && bid <= trade.sl) { 
          triggerReason = 'stop_loss'; 
          executionPrice = trade.sl; 
        }
      } 
      else if (trade.type === 'sell') {
        if (trade.tp && trade.tp > 0 && ask <= trade.tp) { 
          triggerReason = 'take_profit'; 
          executionPrice = trade.tp; 
        }
        else if (trade.sl && trade.sl > 0 && ask >= trade.sl) { 
          triggerReason = 'stop_loss'; 
          executionPrice = trade.sl; 
        }
      }

      if (triggerReason) {
        const priceDiff = trade.type === 'buy' ? (executionPrice - openPrice) : (openPrice - executionPrice);
        const finalPnL = priceDiff * lots * contractSize;

        await db.runTransaction(async (tx: any) => {
          const tSnap = await tx.get(tradeDoc.ref);
          if (!tSnap.exists || tSnap.data().status !== 'open') return;

          tx.update(tradeDoc.ref, {
            status: 'closed',
            closedAt: FieldValue.serverTimestamp(),
            closePrice: executionPrice,
            closeBid: bid,
            closeAsk: ask,
            pnl: finalPnL,
            closeReason: triggerReason,
            isAutoClosed: true,
            updatedAt: FieldValue.serverTimestamp()
          });

          const accUpdates: any = {
            balance: FieldValue.increment(finalPnL),
            updatedAt: FieldValue.serverTimestamp()
          };

          if (finalPnL < 0) {
            accUpdates.dailyGrossLossUsd = FieldValue.increment(Math.abs(finalPnL));
          }

          tx.update(db.collection('demoAccounts').doc(trade.accountId), accUpdates);
          
          tx.set(db.collection('system_logs').doc(), {
            type: 'auto_exit',
            tradeId: tradeDoc.id,
            accountId: trade.accountId,
            userId: trade.userId,
            reason: triggerReason,
            price: executionPrice,
            timestamp: FieldValue.serverTimestamp()
          });
        });

        await auditDemoAccount(trade.accountId);
      }
    }
  } catch (err: any) {
    console.error('[RiskEngine] TP/SL monitor error:', err.message);
  }
}

/**
 * Main Synchronization Cycle
 */
export async function syncPricesAndAudit() {
  if (isSyncing) return { skipped: true };
  isSyncing = true;

  try {
    const db = getAdminDb();
    await checkTpSlHits(db);
    const result = await auditActiveOpenPositions();
    return { success: true, ...result };
  } catch (error: any) {
    console.error('[PriceSync] Cycle fault:', error.message);
    throw error;
  } finally {
    isSyncing = false;
  }
}
