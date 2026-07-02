import WebSocket from 'ws';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * @fileOverview Institutional Binance WebSocket Stream
 * Provides real-time crypto liquidity for the trading terminal with throttled Firestore updates.
 */

const BINANCE_WS_URL = 'wss://stream.binance.com:9443';
const STREAMS = [
  'btcusdt@ticker',
  'ethusdt@ticker',
  'solusdt@ticker',
  'xrpusdt@ticker',
  'bnbusdt@ticker',
  'dogeusdt@ticker',
  'adausdt@ticker'
];

interface Tick {
  price: number;
  bid: number;
  ask: number;
}

let latestTicks: Record<string, Tick> = {};
let lastWrittenTicks: Record<string, string> = {};

/**
 * Returns the latest captured ticks from the Binance stream.
 */
export function getLatestBinanceTicks() {
  return latestTicks;
}

/**
 * Resolves per-symbol decimal precision matching institutional terminal standards.
 */
function getPrecision(symbol: string): number {
  const s = symbol.toUpperCase();
  if (s === 'BTCUSD' || s === 'ETHUSD') return 2;
  if (s === 'BNBUSD' || s === 'SOLUSD') return 2;
  if (s === 'XRPUSD' || s === 'ADAUSD') return 4;
  if (s === 'DOGEUSD') return 5;
  return 2;
}

/**
 * Initializes the WebSocket connection and handles live price updates.
 */
export function startBinanceStream() {
  const url = `${BINANCE_WS_URL}/stream?streams=${STREAMS.join('/')}`;
  console.log(`[BinanceStream] Establishing WebSocket connection: ${url}`);

  const ws = new WebSocket(url);

  ws.on('open', () => {
    console.log('[BinanceStream] WebSocket connection established.');
  });

  ws.on('message', (data: string) => {
    try {
      const msg = JSON.parse(data.toString());
      if (!msg.data || msg.data.e !== '24hrTicker') return;

      const ticker = msg.data;
      const rawSymbol = ticker.s; // e.g. BTCUSDT
      const symbol = rawSymbol.replace('USDT', 'USD');
      const price = parseFloat(ticker.c);

      if (isNaN(price)) return;

      // Institutional spread simulation (0.025%)
      const spread = price * 0.00025;
      const dec = getPrecision(symbol);

      latestTicks[symbol] = {
        price: +price.toFixed(dec),
        bid: +(price - spread).toFixed(dec),
        ask: +(price + spread).toFixed(dec)
      };
    } catch (e) {
      // Silently fail to avoid console noise during high volatility
    }
  });

  ws.on('error', (e) => {
    console.error('[BinanceStream] WebSocket synchronization fault:', e.message);
  });

  ws.on('close', () => {
    console.log('[BinanceStream] WebSocket connection closed. Attempting institutional reconnection in 3s...');
    setTimeout(startBinanceStream, 3000);
  });

  return ws;
}

/**
 * Periodically flushes changed ticks to Firestore to maintain terminal liquidity.
 * Throttled to 400ms to balance performance and database costs.
 */
export function startThrottledFirestoreWrite() {
  const db = getAdminDb();
  console.log('[BinanceStream] Initializing 400ms throttled Firestore sync...');

  setInterval(async () => {
    const symbols = Object.keys(latestTicks);
    if (symbols.length === 0) return;

    const batch = db.batch();
    let hasChanges = false;

    for (const symbol of symbols) {
      const tick = latestTicks[symbol];
      const tickStr = JSON.stringify(tick);

      // Only write if the tick data actually changed
      if (lastWrittenTicks[symbol] !== tickStr) {
        const docRef = db.collection('livePrices').doc(symbol);
        batch.set(docRef, {
          ...tick,
          pair: symbol,
          updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });

        lastWrittenTicks[symbol] = tickStr;
        hasChanges = true;
      }
    }

    if (hasChanges) {
      try {
        await batch.commit();
      } catch (err: any) {
        console.warn('[BinanceStream] Batch commit failed:', err.message);
      }
    }
  }, 400);
}
