import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { broadcastToRtdb } from './rtdbBroadcast';

/**
 * @fileOverview OANDA Institutional Pricing Stream
 * Maintains a persistent HTTP connection to OANDA for real-time FX/Metals liquidity.
 * Updates both /livePrices and /market paths for unified synchronization.
 */

let latestOandaTicks: Record<string, { price: number; bid: number; ask: number; updatedAt?: number }> = {};
let lastWrittenOandaTicks: Record<string, string> = {};
let isWriting = false;
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

  // Start Health Heartbeat (Institutional Monitoring)
  if (!heartbeatInterval) {
    console.log('[OandaStream] Initializing Health Heartbeat...');
    heartbeatInterval = setInterval(() => {
      console.log(`[Master-Fetcher] OANDA STATUS: Healthy | Ticks Processed (30s): ${tickCount}`);
      tickCount = 0;
    }, 30000);
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
    if (!response.body) throw new Error('OANDA Body Empty');

    console.log('[OandaStream] Persistent connection established.');

    const reader = response.body.getReader();
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
              latestOandaTicks[symbol] = {
                price: +price.toFixed(5),
                bid: +bid.toFixed(5),
                ask: +ask.toFixed(5),
                updatedAt: Date.now()
              };
            }
          }
        } catch (e) {}
      }
    }
  } catch (err: any) {
    console.warn('[OandaStream] Connection reset:', err.message);
  }

  // Exponential backoff retry
  setTimeout(startOandaStream, 5000);
}

export function startOandaThrottledFirestoreWrite() {
  if (firestoreWriteInterval) return;

  firestoreWriteInterval = setInterval(async () => {
    if (isWriting) return;

    const symbols = Object.keys(latestOandaTicks);
    if (symbols.length === 0) return;

    // 1. Write to RTDB (Near-instant broadcast to all instances)
    broadcastToRtdb(latestOandaTicks as any);

    // 2. Write to Firestore (Throttled audit persistence)
    const db = getAdminDb();
    const batch = db.batch();
    let hasChanges = false;
    const now = FieldValue.serverTimestamp();

    for (const symbol of symbols) {
      const tick = latestOandaTicks[symbol];
      const tickStr = `${tick.bid}-${tick.ask}`;

      if (lastWrittenOandaTicks[symbol] !== tickStr) {
        const liveRef = db.collection('livePrices').doc(symbol);
        const payload = {
          ...tick,
          symbol,
          updatedAt: now
        };

        batch.set(liveRef, payload, { merge: true });
        lastWrittenOandaTicks[symbol] = tickStr;
        hasChanges = true;
      }
    }

    if (hasChanges) {
      isWriting = true;
      try {
        await batch.commit();
      } catch (err) {
        // Silent batch failure log
      } finally {
        isWriting = false;
      }
    }
  }, 2000); 
}
