
import { getAdminDb, getAdminRtdb } from '@/lib/firebase-admin';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { auditActiveOpenPositions, auditDemoAccount } from '@/lib/rulesEngine';
import { setLatestOandaTick, getLatestOandaTicks } from './oandaStream';
import { setLatestCoinbaseTick, getLatestCoinbaseTicks } from './coinbaseStream';
import { CONTRACT_SIZE } from './rulesConfig';
import { broadcastToRtdb } from './rtdbBroadcast';

/**
 * @fileOverview Institutional Risk Auditor & Execution Engine
 * Optimized for Quota Safety: Uses memory and RTDB for low-latency pricing.
 */

let isSyncing = false;
const flightRequests = new Map<string, Promise<any>>();

export function startGlobalPriceSync() {
  try {
    const rtdb = getAdminRtdb();
    if (!rtdb) return;
    const pricesRef = rtdb.ref('livePrices');

    const updateLocalBuffer = (snapshot: any) => {
      const tick = snapshot.val();
      const symbol = snapshot.key;
      if (!tick || !symbol) return;

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
    };

    pricesRef.on('child_added', updateLocalBuffer);
    pricesRef.on('child_changed', updateLocalBuffer);
  } catch (err) {
  }
}

export async function getAuthoritativePrice(symbol: string) {
  const sym = symbol.toUpperCase().trim();
  const isCrypto = ['BTCUSD', 'ETHUSD', 'SOLUSD', 'XRPUSD', 'ADAUSD', 'DOGEUSD', 'BNBUSD'].includes(sym);
  const now = Date.now();
  
  const memTick = getLatestOandaTicks()[sym] || getLatestCoinbaseTicks()[sym];
  if (memTick && (now - (memTick.updatedAt || 0) < 5000)) {
    return { ...memTick, source: 'memory' };
  }

  try {
    const rtdb = getAdminRtdb();
    if (rtdb) {
      const snap = await rtdb.ref(`livePrices/${sym}`).get();
      if (snap.exists()) {
        const tick = snap.val();
        if (now - (tick.updatedAt || 0) < 5000) {
          const payload = { ...tick, updatedAt: tick.updatedAt };
          if (isCrypto) setLatestCoinbaseTick(sym, payload);
          else setLatestOandaTick(sym, payload);
          return { ...tick, source: 'rtdb' };
        }
      }
    }
  } catch (e) {}

  if (flightRequests.has(sym)) return flightRequests.get(sym);

  const flight = (async () => {
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
        const res = await fetch(`https://api-fxpractice.oanda.com/v3/instruments/${sym.replace('USD', '_USD')}/candles?count=1&price=M`, { 
          headers: { 'Authorization': `Bearer ${process.env.OANDA_API_KEY}` },
          signal: AbortSignal.timeout(3000)
        });
        if (res.ok) {
          const d = await res.json();
          const c = d.candles?.[0]?.mid;
          if (c) freshTick = { price: parseFloat(c.c), bid: parseFloat(c.c) * 0.9999, ask: parseFloat(c.c) * 1.0001 };
        }
      }
    } catch (e) {}

    if (freshTick) {
      const payload = { ...freshTick, updatedAt: Date.now() };
      if (isCrypto) setLatestCoinbaseTick(sym, payload);
      else setLatestOandaTick(sym, payload);
      broadcastToRtdb({ [sym]: payload });
      // REMOVED: High-frequency Firestore write here to save quota
      return { ...payload, source: 'forced-rest' };
    }

    try {
      const db = getAdminDb();
      if (db) {
        const snap = await db.collection('livePrices').doc(sym).get();
        if (snap.exists) {
          const data = snap.data()!;
          return { ...data, updatedAt: data.updatedAt?.toMillis() || 0, source: 'firestore' };
        }
      }
    } catch (e) {}

    return null;
  })();

  flightRequests.set(sym, flight);
  setTimeout(() => flightRequests.delete(sym), 2000);
  return flight;
}

async function checkTpSlHits(db: any) {
  if (!db) return;
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
      const contractSize = CONTRACT_SIZE[symbol] || 100000;

      let triggerReason: 'take_profit' | 'stop_loss' | null = null;
      let executionPrice = 0;

      if (trade.type === 'buy') {
        if (trade.tp && trade.tp > 0 && bid >= trade.tp) { triggerReason = 'take_profit'; executionPrice = trade.tp; }
        else if (trade.sl && trade.sl > 0 && bid <= trade.sl) { triggerReason = 'stop_loss'; executionPrice = trade.sl; }
      } else {
        if (trade.tp && trade.tp > 0 && ask <= trade.tp) { triggerReason = 'take_profit'; executionPrice = trade.tp; }
        else if (trade.sl && trade.sl > 0 && ask >= trade.sl) { triggerReason = 'stop_loss'; executionPrice = trade.sl; }
      }

      if (triggerReason) {
        const priceDiff = trade.type === 'buy' ? (executionPrice - trade.openPrice) : (trade.openPrice - executionPrice);
        const finalPnL = priceDiff * trade.lots * contractSize;

        await db.runTransaction(async (tx: any) => {
          tx.update(tradeDoc.ref, { status: 'closed', closedAt: FieldValue.serverTimestamp(), closePrice: executionPrice, pnl: finalPnL, closeReason: triggerReason, isAutoClosed: true });
          tx.update(db.collection('demoAccounts').doc(trade.accountId), { balance: FieldValue.increment(finalPnL), dailyGrossLossUsd: finalPnL < 0 ? FieldValue.increment(Math.abs(finalPnL)) : FieldValue.increment(0), updatedAt: FieldValue.serverTimestamp() });
        });
        await auditDemoAccount(trade.accountId);
      }
    }
  } catch (err) {}
}

export async function syncPricesAndAudit() {
  if (isSyncing) return { skipped: true };
  isSyncing = true;
  try {
    const db = getAdminDb();
    if (!db) return { error: 'Database unavailable' };
    await checkTpSlHits(db);
    return await auditActiveOpenPositions();
  } catch (error) {
    throw error;
  } finally {
    isSyncing = false;
  }
}
