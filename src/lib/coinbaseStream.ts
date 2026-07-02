/**
 * Crypto Price Feed via Kraken REST API
 * Replaces Coinbase WebSocket (blocked on Google Cloud IPs)
 */
import { getAdminDb } from '@/lib/firebase-admin';

const KRAKEN_PAIRS: Record<string, string> = {
  'XXBTZUSD': 'BTCUSD',
  'XETHZUSD': 'ETHUSD',
  'SOLUSD':   'SOLUSD',
  'XXRPZUSD': 'XRPUSD',
  'ADAUSD':   'ADAUSD',
  'XDGUSD':   'DOGEUSD',
};

let cryptoPrices: Record<string, { price: number; bid: number; ask: number }> = {};
let isWriting = false;
let krakenInterval: NodeJS.Timeout | null = null;
let bnbInterval: NodeJS.Timeout | null = null;

/**
 * Returns the current captured ticks from the crypto feed.
 */
export function getLatestCoinbaseTicks() {
  return cryptoPrices;
}

async function fetchKrakenPrices() {
  try {
    const res = await fetch(
      'https://api.kraken.com/0/public/Ticker?pair=XBTUSD,ETHUSD,SOLUSD,XRPUSD,ADAUSD,XDGUSD',
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return;
    const data = await res.json();
    if (data.error?.length > 0) { console.error('[KrakenFeed] API error:', data.error); return; }
    const now = new Date().toISOString();
    Object.entries(data.result || {}).forEach(([krakenPair, ticker]: [string, any]) => {
      const symbol = KRAKEN_PAIRS[krakenPair];
      if (!symbol) return;
      const price = parseFloat(ticker.c[0]);
      const bid = parseFloat(ticker.b[0]);
      const ask = parseFloat(ticker.a[0]);
      if (!price || isNaN(price)) return;
      cryptoPrices[symbol] = { price, bid, ask };
      console.log(`[KrakenFeed] ${symbol} = ${price}`);
    });
    await writeCryptoPricesToFirestore();
  } catch (e: any) {
    console.error('[KrakenFeed] Fetch error:', e.message);
  }
}

async function fetchBnbPrice() {
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=binancecoin&vs_currencies=usd',
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return;
    const data = await res.json();
    const price = data?.binancecoin?.usd;
    if (!price || isNaN(price)) return;
    const spread = price * 0.0005;
    cryptoPrices['BNBUSD'] = { price, bid: price - spread, ask: price + spread };
    console.log(`[BnbPolling] BNBUSD = ${price}`);
  } catch (e: any) {
    console.error('[BnbPolling] Fetch error:', e.message);
  }
}

async function writeCryptoPricesToFirestore() {
  if (isWriting || Object.keys(cryptoPrices).length === 0) return;
  isWriting = true;
  const start = Date.now();
  try {
    const db = getAdminDb();
    const batch = db.batch();
    const now = new Date().toISOString();
    Object.entries(cryptoPrices).forEach(([symbol, data]) => {
      batch.set(db.collection('livePrices').doc(symbol), { ...data, updatedAt: now }, { merge: true });
    });
    await batch.commit();
    console.log(`[KrakenFeed] Commit finished in ${Date.now() - start}ms`);
  } catch (e: any) {
    console.error('[KrakenFeed] Firestore write error:', e.message);
  } finally {
    isWriting = false;
  }
}

export function startCoinbaseStream() {
  if (krakenInterval) return;
  console.log('[KrakenFeed] Starting Kraken crypto feed (3s interval)...');
  fetchKrakenPrices();
  krakenInterval = setInterval(fetchKrakenPrices, 3000);
}

export function startBnbPolling() {
  if (bnbInterval) return;
  console.log('[BnbPolling] Starting BNB polling via CoinGecko (10s interval)...');
  fetchBnbPrice();
  bnbInterval = setInterval(fetchBnbPrice, 10000);
}
