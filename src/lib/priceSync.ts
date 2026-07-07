import { getAdminDb, getAdminRtdb } from '@/lib/firebase-admin';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { auditActiveOpenPositions, auditDemoAccount } from '@/lib/rulesEngine';
import { setLatestOandaTick, getLatestOandaTicks } from './oandaStream';
import { setLatestCoinbaseTick, getLatestCoinbaseTicks } from './coinbaseStream';
import { CONTRACT_SIZE } from './rulesConfig';
import { broadcastToRtdb } from './rtdbBroadcast';

/**
 * @fileOverview Institutional Risk Auditor & Execution Engine
 * 
 * ARCHITECTURE OVERVIEW:
 * 1. Master Fetcher (Leader): Acquires lock in Firestore and runs long-running fetchers in OandaStream/CoinbaseStream.
 * 2. Shared State (RTDB): Master fetcher writes prices to Realtime Database (/livePrices).
 * 3. Global Sync: Every instance (Leader or Standby) subscribes to RTDB via startGlobalPriceSync() to keep local memory buffers hot.
 * 4. Self-Healing: If local memory is empty/stale, API routes (Trade/SSE) perform manual recovery REST polls and bridge data to RTDB.
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
          ask: Number(tick.ask),
          updatedAt: tick.updatedAt || Date.now()
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
 * Institutional GOLDEN SOURCE Utility: Fetches a fresh price with multi-layered fallback.
 * Priority: Local Memory -> Shared RTDB -> Forced REST Poll -> Firestore.
 * Updates shared state automatically on forced recovery.
 */
export async function getAuthoritativePrice(symbol: string) {
  const sym = symbol.toUpperCase().trim();
  const isCrypto = ['BTCUSD', 'ETHUSD', 'SOLUSD', 'XRPUSD', 'ADAUSD', 'DOGEUSD', 'BNBUSD'].includes(sym);
  const now = Date.now();
  
  // 1. Check Local Memory Buffer (Ultra-fast, synced via GlobalPriceSync)
  const memTick = getLatestOandaTicks()[sym] || getLatestCoinbaseTicks()[sym];
  if (memTick && (now - (memTick.updatedAt || 0) < 5000)) {
    return { ...memTick, source: 'memory' };
  }

  // 2. Check RTDB Direct (Shared high-frequency buffer between all instances)
  try {
    const rtdb = getAdminRtdb();
    const snap = await rtdb.ref(`livePrices/${sym}`).get();
    if (snap.exists()) {
      const tick = snap.val();
      const tickAge = now - (tick.updatedAt || 0);
      if (tickAge < 5000) {
        // Hydrate local memory for subsequent calls
        const payload = { ...tick, updatedAt: tick.updatedAt };
        if (isCrypto) setLatestCoinbaseTick(sym, payload);
        else setLatestOandaTick(sym, payload);
        return { ...tick, source: 'rtdb' };
      }
    }
  } catch (e) {
    console.warn(`[Price-Sync] RTDB check failed for ${sym}`);
  }

  // 3. Forced REST Recovery (Last resort for execution, matches Chart's poller)
  console.log(`[Price-Sync] SELF-HEALING: Triggering forced poll for ${sym}...`);
  let freshTick: any = null;

  try {
    if (isCrypto) {
      if (sym === 'BNBUSD') {
        const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=binancecoin&vs_currencies=usd');
        const data = await res.json();
        const p = data?.binancecoin?.usd;
        if (p) freshTick = { price: p, bid: +(p * 0.9995).toFixed(2), ask: +(p * 1.0005).toFixed(2) };
      } else {
        const kPair = sym === 'BTCUSD' ? 'XBTUSD' : sym === 'DOGEUSD' ? 'XDGUSD' : sym;
        const res = await fetch(`https://api.kraken.com/0/public/Ticker?pair=${kPair}`, { signal: AbortSignal.timeout(3000) });
        const d = await res.json();
        if (d.result) {
          const resKey = Object.keys(d.result)[0];
          const item = d.result[resKey];
          freshTick = { price: parseFloat(item.c[0]), bid: parseFloat(item.b[0]), ask: parseFloat(item.a[0]) };
        }
      }
    } else if (process.env.OANDA_API_KEY && process.env.OANDA_ACCOUNT_ID) {
      const oMap: Record<string, string> = { 'XAUUSD': 'XAU_USD', 'EURUSD': 'EUR_USD', 'GBPUSD': 'GBP_USD', 'USDJPY': 'USD_JPY' };
      const instr = oMap[sym] || sym;
      const res = await fetch(`https://api-fxpractice.oanda.com/v3/instruments/${instr}/candles?price=M&granularity=M1&count=1`, { 
        headers: { 'Authorization': `Bearer ${process.env.OANDA_API_KEY}` },
        signal: AbortSignal.timeout(3000)
      });
      if (res.ok) {
        const d = await res.json();
        const p = d.candles?.[0]?.mid;
        if (p) {
          const o = parseFloat(p.o);
          const spread = sym.includes('JPY') ? 0.015 : sym.includes('XAU') ? 0.25 : 0.00015;
          freshTick = { bid: +(o - spread/2).toFixed(5), ask: +(o + spread/2).toFixed(5), price: o };
        }
      }
    }
  } catch (e: any) {
    console.warn(`[Price-Sync] Forced REST poll failed for ${sym}:`, e.message);
  }

  if (freshTick) {
    const payload = { ...freshTick, updatedAt: Date.now() };
    // Update memory
    if (isCrypto) setLatestCoinbaseTick(sym, payload);
    else setLatestOandaTick(sym, payload);
    // Bridge to RTDB for other instances
    broadcastToRtdb({ [sym]: payload });
    // Throttled Firestore update
    const db = getAdminDb();
    db.collection('livePrices').doc(sym).set({ ...payload, updatedAt: FieldValue.serverTimestamp() }, { merge: true }).catch(() => {});
    
    return { ...payload, source: 'forced-rest' };
  }

  // 4. Final Fallback: Firestore (Likely stale, but prevents null return)
  try {
    const db = getAdminDb();
    const snap = await db.collection('livePrices').doc(sym).get();
    if (snap.exists) {
      const data = snap.data()!;
      const ts = data.updatedAt?.toMillis ? data.updatedAt.toMillis() : (data.updatedAt || 0);
      return { ...data, updatedAt: ts, source: 'firestore' };
    }
  } catch (e) {}

  return null;
}

/**
 * Institutional SL/TP Watcher
 */
async function checkTpSlHits(db: any) {
  try {
    const openTradesSnap = await db.collection('demoTrades').where('status', '==', 'open').get();
    if (openTradesSnap.empty) return;

    for (const tradeDoc of openTradesSnap.docs) {
      const trade = tradeDoc.data();
      const symbol = (trade.symbol || "").toUpperCase().trim();
      
      const priceData = await getAuthoritativePrice(symbol);
      if (!priceData || (Date.now() - priceData.updatedAt > 15000)) continue;

      const bid = parseFloat(priceData.bid);
      const ask = parseFloat(priceData.ask);
      const lots = parseFloat(trade.lots || 0);
      const contractSize = CONTRACT_SIZE[symbol] || 100000;

      let triggerReason: 'take_profit' | 'stop_loss' | null = null;
      let executionPrice = 0;

      if (trade.type === 'buy') {
        if (trade.tp && trade.tp > 0 && bid >= trade.tp) { triggerReason = 'take_profit'; executionPrice = trade.tp; }
        else if (trade.sl && trade.sl > 0 && bid <= trade.sl) { triggerReason = 'stop_loss'; executionPrice = trade.sl; }
      } 
      else if (trade.type === 'sell') {
        if (trade.tp && trade.tp > 0 && ask <= trade.tp) { triggerReason = 'take_profit'; executionPrice = trade.tp; }
        else if (trade.sl && trade.sl > 0 && ask >= trade.sl) { triggerReason = 'stop_loss'; executionPrice = trade.sl; }
      }

      if (triggerReason) {
        const priceDiff = trade.type === 'buy' ? (executionPrice - trade.openPrice) : (trade.openPrice - executionPrice);
        const finalPnL = priceDiff * lots * contractSize;

        await db.runTransaction(async (tx: any) => {
          tx.update(tradeDoc.ref, {
            status: 'closed',
            closedAt: FieldValue.serverTimestamp(),
            closePrice: executionPrice,
            pnl: finalPnL,
            closeReason: triggerReason,
            isAutoClosed: true,
            updatedAt: FieldValue.serverTimestamp()
          });
          tx.update(db.collection('demoAccounts').doc(trade.accountId), {
            balance: FieldValue.increment(finalPnL),
            dailyGrossLossUsd: finalPnL < 0 ? FieldValue.increment(Math.abs(finalPnL)) : FieldValue.increment(0),
            updatedAt: FieldValue.serverTimestamp()
          });
        });
        await auditDemoAccount(trade.accountId);
      }
    }
  } catch (err: any) {
    console.error('[RiskEngine] TP/SL monitor error:', err.message);
  }
}

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
