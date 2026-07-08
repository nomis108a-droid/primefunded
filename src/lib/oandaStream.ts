
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { broadcastToRtdb } from './rtdbBroadcast';

/**
 * @fileOverview OANDA Institutional Pricing Stream
 * Optimized for Quota Safety: Uses RTDB for high-frequency UI updates.
 * Firestore writes are throttled to 10-minute intervals for fallback only.
 */

let latestOandaTicks: Record<string, { price: number; bid: number; ask: number; updatedAt?: number }> = {};
let lastWrittenOandaTicks: Record<string, string> = {};
let isWriting = false;
let lastRtdbBroadcast = 0;
let firestoreWriteInterval: NodeJS.Timeout | null = null;
let heartbeatInterval: NodeJS.Timeout | null = null;
let tickCount = 0;

export function getLatestOandaTicks() {
  return latestOandaTicks;
}

export function setLatestOandaTick(symbol: string, data: { price: number; bid: number; ask: number; updatedAt?: number }) {
  latestOandaTicks[symbol] = {
    ...data,
    updatedAt: data.updatedAt || Date.now()
  };
}

export async function startOandaStream() {
  const accountId = process.env.OANDA_ACCOUNT_ID;
  const apiKey = process.env.OANDA_API_KEY;

  if (!accountId || !apiKey) {
    console.warn('[OandaStream] Credentials missing. Feed suspended.');
    return;
  }

  if (!heartbeatInterval) {
    heartbeatInterval = setInterval(() => {
      console.log(`[Master-Fetcher] OANDA STATUS: Healthy | Ticks (3s): ${tickCount}`);
      tickCount = 0;
    }, 3000);
  }

  const instruments = 'XAU_USD,XAG_USD,XPT_USD,EUR_USD,GBP_USD,USD_JPY,USD_CHF,AUD_USD,USD_CAD,NZD_USD';
  const url = `https://stream-fxpractice.oanda.com/v3/accounts/${accountId}/pricing/stream?instruments=${instruments}`;

  try {
    const response = await fetch(url, {
      headers: { 
        'Authorization': `Bearer ${apiKey}`,
        'Connection': 'keep-alive'
      },
    });

    if (!response.ok) throw new Error(`OANDA HTTP ${response.status}`);
    const reader = response.body?.getReader();
    if (!reader) throw new Error('OANDA Stream Unreadable');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.type === 'PRICE') {
            const symbol = msg.instrument.replace('_', '').toUpperCase();
            const bid = parseFloat(msg.bids[0].price);
            const ask = parseFloat(msg.asks[0].price);
            const price = (bid + ask) / 2;

            if (!isNaN(price)) {
              tickCount++;
              const tick = {
                price: +price.toFixed(5),
                bid: +bid.toFixed(5),
                ask: +ask.toFixed(5),
                updatedAt: Date.now()
              };
              latestOandaTicks[symbol] = tick;
              
              // HIGH FREQUENCY RTDB SYNC (150ms throttle)
              // This is free in the Spark plan up to certain limits and doesn't hit Firestore quota
              const now = Date.now();
              if (now - lastRtdbBroadcast > 150) {
                broadcastToRtdb(latestOandaTicks as any);
                lastRtdbBroadcast = now;
              }
            }
          }
        } catch (e) {}
      }
    }
  } catch (err: any) {
    console.warn('[OandaStream] Connection reset:', err.message);
  }

  setTimeout(startOandaStream, 5000);
}

export function startOandaThrottledFirestoreWrite() {
  if (firestoreWriteInterval) return;

  // QUOTA PROTECTION: Only write to Firestore once every 10 minutes
  // This is used for historical fallback and doesn't need high frequency.
  firestoreWriteInterval = setInterval(async () => {
    if (isWriting) return;

    const symbols = Object.keys(latestOandaTicks);
    if (symbols.length === 0) return;

    const db = getAdminDb();
    if (!db) return;

    const batch = db.batch();
    let hasChanges = false;
    const now = FieldValue.serverTimestamp();

    for (const symbol of symbols) {
      const tick = latestOandaTicks[symbol];
      const tickStr = `${tick.bid}-${tick.ask}`;

      if (lastWrittenOandaTicks[symbol] !== tickStr) {
        const liveRef = db.collection('livePrices').doc(symbol);
        batch.set(liveRef, { ...tick, symbol, updatedAt: now }, { merge: true });
        lastWrittenOandaTicks[symbol] = tickStr;
        hasChanges = true;
      }
    }

    if (hasChanges) {
      isWriting = true;
      try {
        await batch.commit();
        console.log('[Firestore-Sync] Fallback market prices updated (10m interval)');
      } catch (err) {
      } finally {
        isWriting = false;
      }
    }
  }, 600000); 
}
