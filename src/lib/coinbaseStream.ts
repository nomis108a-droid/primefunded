/**
 * @fileOverview Crypto Price Feed via Kraken REST API
 */
import { getAdminDb } from '@/lib/firebase-admin';
import { broadcastToRtdb } from './rtdbBroadcast';

const KRAKEN_PAIRS_MAP: Record<string, string> = {
  'XXBTZUSD': 'BTCUSD',
  'XBTUSD':   'BTCUSD',
  'XETHZUSD': 'ETHUSD',
  'ETHUSD':   'ETHUSD',
  'SOLUSD':   'SOLUSD',
  'XXRPZUSD': 'XRPUSD',
  'XRPUSD':   'XRPUSD',
  'ADAUSD':   'ADAUSD',
  'XDGUSD':   'DOGEUSD',
  'DOGEUSD':  'DOGEUSD'
};

let cryptoPrices: Record<string, { price: number; bid: number; ask: number }> = {};
let isWriting = false;
let krakenInterval: NodeJS.Timeout | null = null;
let bnbInterval: NodeJS.Timeout | null = null;

export function getLatestCoinbaseTicks() {
  return cryptoPrices;
}

/**
 * Updates the local memory buffer from external sources
 */
export function setLatestCoinbaseTick(symbol: string, data: { price: number; bid: number; ask: number }) {
  cryptoPrices[symbol] = data;
}

async function fetchKrakenPrices() {
  try {
    const res = await fetch(
      'https://api.kraken.com/0/public/Ticker?pair=XBTUSD,ETHUSD,SOLUSD,XRPUSD,ADAUSD,XDGUSD',
      { 
        signal: AbortSignal.timeout(5000),
        cache: 'no-store'
      }
    );
    if (!res.ok) return;
    const data = await res.json();
    
    if (data.error?.length > 0) {
      console.warn('[KrakenFeed] API returned errors:', data.error);
      return;
    }

    if (data.result) {
      Object.entries(data.result).forEach(([krakenPair, ticker]: [string, any]) => {
        const symbol = KRAKEN_PAIRS_MAP[krakenPair];
        if (!symbol) return;
        
        const price = parseFloat(ticker.c[0]);
        const bid = parseFloat(ticker.b[0]);
        const ask = parseFloat(ticker.a[0]);
        
        if (!isNaN(price) && price > 0) {
          cryptoPrices[symbol] = { price: +price.toFixed(5), bid: +bid.toFixed(5), ask: +ask.toFixed(5) };
        }
      });
      
      await writeCryptoPricesToStorage();
    }
  } catch (e: any) {
    console.warn('[KrakenFeed] Polling exception:', e.message);
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
    
    if (price && !isNaN(price)) {
      const spread = price * 0.0005;
      cryptoPrices['BNBUSD'] = { price: +price.toFixed(2), bid: +(price - spread).toFixed(2), ask: +(price + spread).toFixed(2) };
    }
  } catch (e) {}
}

async function writeCryptoPricesToStorage() {
  if (isWriting || Object.keys(cryptoPrices).length === 0) return;
  isWriting = true;
  
  try {
    // 1. Write to RTDB (Instant broadcast)
    broadcastToRtdb(cryptoPrices);

    // 2. Write to Firestore (Audit/persistence)
    const db = getAdminDb();
    const batch = db.batch();
    const now = new Date().toISOString();
    
    Object.entries(cryptoPrices).forEach(([symbol, data]) => {
      batch.set(db.collection('livePrices').doc(symbol), { 
        ...data, 
        updatedAt: now 
      }, { merge: true });
    });
    
    await batch.commit();
  } catch (e: any) {
    console.error('[KrakenFeed] Sync Fault:', e.message);
  } finally {
    isWriting = false;
  }
}

export function startCoinbaseStream() {
  if (krakenInterval) return;
  console.log('[KrakenFeed] Starting 3s Crypto Polling Cycle...');
  fetchKrakenPrices();
  krakenInterval = setInterval(fetchKrakenPrices, 3000);
}

export function startBnbPolling() {
  if (bnbInterval) return;
  console.log('[BnbPolling] Starting 10s BNB Polling Cycle...');
  fetchBnbPrice();
  bnbInterval = setInterval(fetchBnbPrice, 10000);
}
