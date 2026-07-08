
import { getAdminDb } from '@/lib/firebase-admin';
import { broadcastToRtdb } from './rtdbBroadcast';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * @fileOverview Crypto Price Feed via Kraken REST API
 * Optimized for Quota Safety: Firestore writes are throttled to 10-minute intervals.
 */

const KRAKEN_PAIRS_MAP: Record<string, string> = {
  'XXBTZUSD': 'BTCUSD', 'XBTUSD': 'BTCUSD',
  'XETHZUSD': 'ETHUSD', 'ETHUSD': 'ETHUSD',
  'SOLUSD': 'SOLUSD', 'XXRPZUSD': 'XRPUSD',
  'XRPUSD': 'XRPUSD', 'ADAUSD': 'ADAUSD',
  'XDGUSD': 'DOGEUSD', 'DOGEUSD': 'DOGEUSD'
};

let cryptoPrices: Record<string, { price: number; bid: number; ask: number; updatedAt?: number }> = {};
let isWriting = false;
let krakenInterval: NodeJS.Timeout | null = null;
let bnbInterval: NodeJS.Timeout | null = null;
let firestoreSyncInterval: NodeJS.Timeout | null = null;
let tickCount = 0;

export function getLatestCoinbaseTicks() {
  return cryptoPrices;
}

export function setLatestCoinbaseTick(symbol: string, data: { price: number; bid: number; ask: number; updatedAt?: number }) {
  cryptoPrices[symbol] = { ...data, updatedAt: data.updatedAt || Date.now() };
}

async function fetchKrakenPrices() {
  try {
    const res = await fetch(
      'https://api.kraken.com/0/public/Ticker?pair=XBTUSD,ETHUSD,SOLUSD,XRPUSD,ADAUSD,XDGUSD',
      { signal: AbortSignal.timeout(5000), cache: 'no-store' }
    );
    if (!res.ok) return;
    const data = await res.json();
    
    if (data.result) {
      Object.entries(data.result).forEach(([krakenPair, ticker]: [string, any]) => {
        const symbol = KRAKEN_PAIRS_MAP[krakenPair];
        if (!symbol) return;
        const price = parseFloat(ticker.c[0]);
        const bid = parseFloat(ticker.b[0]);
        const ask = parseFloat(ticker.a[0]);
        if (!isNaN(price) && price > 0) {
          tickCount++;
          cryptoPrices[symbol] = { 
            price: +price.toFixed(5), bid: +bid.toFixed(5), ask: +ask.toFixed(5),
            updatedAt: Date.now()
          };
        }
      });
      broadcastToRtdb(cryptoPrices as any);
    }
  } catch (e) {}
}

async function fetchBnbPrice() {
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=binancecoin&vs_currencies=usd');
    if (!res.ok) return;
    const data = await res.json();
    const price = data?.binancecoin?.usd;
    if (price && !isNaN(price)) {
      const spread = price * 0.0005;
      cryptoPrices['BNBUSD'] = { price: +price.toFixed(2), bid: +(price - spread).toFixed(2), ask: +(price + spread).toFixed(2), updatedAt: Date.now() };
      broadcastToRtdb({ BNBUSD: cryptoPrices['BNBUSD'] } as any);
    }
  } catch (e) {}
}

async function syncToFirestore() {
  if (isWriting || Object.keys(cryptoPrices).length === 0) return;
  const db = getAdminDb();
  if (!db) return;
  
  isWriting = true;
  try {
    const batch = db.batch();
    const now = FieldValue.serverTimestamp();
    Object.entries(cryptoPrices).forEach(([symbol, data]) => {
      batch.set(db.collection('livePrices').doc(symbol), { ...data, symbol, updatedAt: now }, { merge: true });
    });
    await batch.commit();
    console.log('[Firestore-Sync] Crypto fallback updated');
  } catch (e) {
  } finally {
    isWriting = false;
  }
}

export function startCoinbaseStream() {
  if (krakenInterval) return;
  krakenInterval = setInterval(fetchKrakenPrices, 2000);
  
  // Throttled Firestore sync (10 minutes)
  if (!firestoreSyncInterval) {
    firestoreSyncInterval = setInterval(syncToFirestore, 600000);
  }
}

export function startBnbPolling() {
  if (bnbInterval) return;
  setInterval(fetchBnbPrice, 10000);
}
