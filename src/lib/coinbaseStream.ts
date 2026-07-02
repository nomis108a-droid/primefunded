import WebSocket from 'ws';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * @fileOverview Institutional Coinbase WebSocket Stream & BNB Polling
 * Provides real-time crypto liquidity for the trading terminal with throttled Firestore updates.
 * BTC, ETH, SOL, XRP, ADA, DOGE are streamed via Coinbase.
 * BNB is polled via CoinGecko.
 */

let latestCoinbaseTicks: Record<string, { price: number; bid: number; ask: number }> = {};
let lastWrittenTicks: Record<string, string> = {};
let isThrottledWriteStarted = false;
let isWriting = false;

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
 * Returns the current captured ticks from the Coinbase stream.
 */
export function getLatestCoinbaseTicks() {
  return latestCoinbaseTicks;
}

/**
 * Initializes the Coinbase WebSocket connection and handles live price updates.
 */
export function startCoinbaseStream() {
  console.log("[CoinbaseStream] Starting connection attempt...");
  
  const ws = new WebSocket('wss://ws-feed.exchange.coinbase.com');

  ws.on('open', () => {
    console.log("[CoinbaseStream] Connection established.");
    // Subscribe to the ticker channel for institutional pairs
    ws.send(JSON.stringify({
      "type": "subscribe",
      "product_ids": ["BTC-USD", "ETH-USD", "SOL-USD", "XRP-USD", "ADA-USD", "DOGE-USD"],
      "channels": ["ticker"]
    }));
  });

  ws.on('message', (data: string) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type !== 'ticker' || !msg.product_id) return;

      const symbol = msg.product_id.replace('-', ''); // e.g. BTC-USD -> BTCUSD
      const price = parseFloat(msg.price);
      if (isNaN(price)) return;

      // Institutional spread simulation (0.025%)
      const spread = price * 0.00025;
      const dec = getPrecision(symbol);

      latestCoinbaseTicks[symbol] = {
        price: +price.toFixed(dec),
        bid: +(price - spread).toFixed(dec),
        ask: +(price + spread).toFixed(dec)
      };
    } catch (e) {
      // Silently skip malformed messages
    }
  });

  ws.on('error', (err) => {
    console.error("[CoinbaseStream] WebSocket error:", err.message);
  });

  ws.on('close', () => {
    console.log("[CoinbaseStream] WebSocket connection closed. Attempting institutional reconnection in 3s...");
    setTimeout(startCoinbaseStream, 3000);
  });

  // Start the throttled writer only once
  if (!isThrottledWriteStarted) {
    startThrottledFirestoreWrite();
    isThrottledWriteStarted = true;
  }

  return ws;
}

/**
 * Periodically flushes changed ticks to Firestore.
 * Throttled to 400ms to balance performance and database costs.
 */
export function startThrottledFirestoreWrite() {
  const db = getAdminDb();
  console.log("[CoinbaseStream] Initializing 400ms throttled Firestore sync...");

  setInterval(async () => {
    if (isWriting) {
      console.log('[CoinbaseStream] Skipped write cycle: previous write still in flight');
      return;
    }

    const symbols = Object.keys(latestCoinbaseTicks);
    if (symbols.length === 0) return;

    const batch = db.batch();
    let hasChanges = false;

    for (const symbol of symbols) {
      const tick = latestCoinbaseTicks[symbol];
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
      isWriting = true;
      const startTime = Date.now();
      try {
        console.log('[CoinbaseStream] Commit starting');
        await batch.commit();
        console.log(`[CoinbaseStream] Commit finished in ${Date.now() - startTime}ms`);
      } catch (err: any) {
        console.warn("[CoinbaseStream] Batch commit failed:", err.message);
      } finally {
        isWriting = false;
      }
    }
  }, 400);
}

/**
 * Autonomous Polling for BNBUSD (via CoinGecko)
 * Executed every 3 seconds to maintain BNB node liquidity.
 */
export function startBnbPolling() {
  console.log("[BnbPolling] Starting 3s poll for BNBUSD via CoinGecko.");
  const db = getAdminDb();
  
  setInterval(async () => {
    try {
      const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=binancecoin&vs_currencies=usd', {
        headers: {
          'User-Agent': 'PrimeFunded-Terminal/1.0',
          'Accept': 'application/json'
        }
      });
      if (!res.ok) return;
      
      const data = await res.json();
      const price = data?.binancecoin?.usd;
      if (!price) return;

      // Institutional spread simulation (0.025%)
      const spread = price * 0.00025;
      const dec = 2; // BNBUSD precision

      const tick = {
        price: +price.toFixed(dec),
        bid: +(price - spread).toFixed(dec),
        ask: +(price + spread).toFixed(dec)
      };

      const tickStr = JSON.stringify(tick);
      if (lastWrittenTicks['BNBUSD'] !== tickStr) {
        const docRef = db.collection('livePrices').doc('BNBUSD');
        await docRef.set({
          ...tick,
          pair: 'BNBUSD',
          updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
        lastWrittenTicks['BNBUSD'] = tickStr;
      }
    } catch (error: any) {
      console.error('[BnbPolling] Polling error:', error.message, error.cause ? JSON.stringify(error.cause) : '');
    }
  }, 3000);
}
