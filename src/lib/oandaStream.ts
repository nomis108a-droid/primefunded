import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * @fileOverview OANDA Institutional Pricing Stream
 * Maintains a persistent HTTP connection to OANDA's v20 pricing stream
 * for real-time FX and Metals liquidity.
 */

let latestOandaTicks: Record<string, { price: number; bid: number; ask: number }> = {};
let lastWrittenOandaTicks: Record<string, string> = {};

/**
 * Returns the current captured ticks from the OANDA stream.
 */
export function getLatestOandaTicks() {
  return latestOandaTicks;
}

/**
 * Establishes a persistent streaming connection to OANDA.
 * Automatically reconnects on disconnection or failure.
 */
export async function startOandaStream() {
  console.log("[OandaStream] Starting connection attempt...");
  
  const accountId = process.env.OANDA_ACCOUNT_ID;
  const apiKey = process.env.OANDA_API_KEY;

  if (!accountId || !apiKey) {
    console.error('[OandaStream] CRITICAL: OANDA credentials missing. Streaming aborted.');
    return;
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

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'No error body');
      throw new Error(`OANDA Stream HTTP Error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    if (!response.body) {
      throw new Error('OANDA Stream response body is null');
    }

    console.log('[OandaStream] Connection established. Processing institutional feed...');

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
              latestOandaTicks[symbol] = {
                price: +price.toFixed(5),
                bid: +bid.toFixed(5),
                ask: +ask.toFixed(5),
              };
            }
          }
        } catch (e) {
          // Silently skip heartbeat or malformed chunks
        }
      }
    }
  } catch (err: any) {
    console.error('[OandaStream] Streaming connection fault:', err.message || err);
  }

  console.log('[OandaStream] Reconnecting to institutional node in 3s...');
  setTimeout(startOandaStream, 3000);
}

/**
 * Periodically flushes changed FX/Metal ticks to Firestore.
 * Throttled to 400ms to balance performance and database costs.
 */
export function startOandaThrottledFirestoreWrite() {
  const db = getAdminDb();
  console.log('[OandaStream] Initializing 400ms throttled Firestore sync...');

  setInterval(async () => {
    const symbols = Object.keys(latestOandaTicks);
    if (symbols.length === 0) return;

    const batch = db.batch();
    let hasChanges = false;

    for (const symbol of symbols) {
      const tick = latestOandaTicks[symbol];
      const tickStr = JSON.stringify(tick);

      if (lastWrittenOandaTicks[symbol] !== tickStr) {
        const docRef = db.collection('livePrices').doc(symbol);
        batch.set(docRef, {
          ...tick,
          pair: symbol,
          updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });

        lastWrittenOandaTicks[symbol] = tickStr;
        hasChanges = true;
      }
    }

    if (hasChanges) {
      try {
        await batch.commit();
      } catch (err: any) {
        console.warn('[OandaStream] Batch commit failed:', err.message);
      }
    }
  }, 400);
}
