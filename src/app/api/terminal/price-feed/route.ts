import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

/**
 * @fileOverview Institutional Price Server
 * One fetch, shared across all traders to synchronize demo environment pricing.
 * Intended to be triggered via Cron.
 */

const SYMBOLS = [
  { pair: "XAUUSD", td: "XAU/USD" },
  { pair: "BTCUSD", td: "BTC/USD" },
  { pair: "EURUSD", td: "EUR/USD" },
  { pair: "GBPUSD", td: "GBP/USD" },
  { pair: "USDJPY", td: "USD/JPY" },
];

const SPREADS: Record<string, number> = {
  EURUSD: 0.00012, 
  GBPUSD: 0.00015, 
  USDJPY: 0.015, 
  XAUUSD: 0.30, 
  BTCUSD: 8,
};

export async function GET(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");
  
  if (!process.env.TERMINAL_CRON_KEY || apiKey !== process.env.TERMINAL_CRON_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.TWELVE_DATA_API_KEY) {
    return NextResponse.json({ error: "Configuration Error: Missing API Key" }, { status: 500 });
  }

  try {
    const db = getAdminDb();
    const symbolsParam = SYMBOLS.map(s => s.td).join(",");
    const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbolsParam)}&apikey=${process.env.TWELVE_DATA_API_KEY}`;

    const res = await fetch(url);
    const data = await res.json();

    // Check for Twelve Data errors
    if (data.status === 'error') {
      return NextResponse.json({ error: data.message }, { status: 400 });
    }

    const batch = db.batch();
    const results: Record<string, number> = {};

    for (const s of SYMBOLS) {
      // Twelve Data returns a single object if 1 symbol, keyed object if multiple
      const entry = SYMBOLS.length > 1 ? data[s.td] : data;
      
      if (!entry || !entry.close) {
        console.warn(`[Price-Feed] No data for ${s.pair}`);
        continue;
      }

      const price = parseFloat(entry.close);
      const spread = SPREADS[s.pair] || 0.0001;

      batch.set(db.collection("livePrices").doc(s.pair), {
        pair: s.pair,
        price,
        bid: price,
        ask: price + spread,
        updatedAt: Timestamp.now(),
      }, { merge: true });

      results[s.pair] = price;
    }

    await batch.commit();
    
    return NextResponse.json({ 
      ok: true, 
      timestamp: new Date().toISOString(),
      prices: results 
    });

  } catch (error: any) {
    console.error('[Price-Feed] Fatal Error:', error);
    return NextResponse.json({ 
      error: "Internal Server Error", 
      details: error.message 
    }, { status: 500 });
  }
}
