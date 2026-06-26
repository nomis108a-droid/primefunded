import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from '@/lib/firebase-admin';
import { Timestamp } from "firebase-admin/firestore";

/**
 * @fileOverview Institutional Candle Server
 * Hardened to ensure JSON responses and detailed error reporting.
 */

const SYMBOL_MAP: Record<string, string> = {
  XAUUSD: "XAU/USD",
  BTCUSD: "BTC/USD",
  EURUSD: "EUR/USD",
  GBPUSD: "GBP/USD",
  USDJPY: "USD/JPY",
};

const INTERVAL_MAP: Record<string, string> = {
  "1m": "1min",
  "5m": "5min",
  "15m": "15min",
  "1h": "1h",
  "4h": "4h",
  "1d": "1day",
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get("symbol");
    const interval = searchParams.get("interval") || "1m";

    if (!symbol || !SYMBOL_MAP[symbol]) {
      return NextResponse.json({ error: "Invalid symbol" }, { status: 400 });
    }

    let db;
    try {
      db = getAdminDb();
    } catch (adminError: any) {
      console.error('[Candle-API] Firebase Admin Initialization Failed:', adminError);
      return NextResponse.json({ 
        error: "Database connection failed", 
        details: adminError.message 
      }, { status: 500 });
    }

    const cacheKey = `${symbol}_${interval}`;
    const cacheRef = db.collection("candles").doc(cacheKey);
    
    // 1. Check Firestore Cache
    try {
      const cacheSnap = await cacheRef.get();
      if (cacheSnap.exists) {
        const data = cacheSnap.data();
        const updatedAt = data?.updatedAt?.toMillis() || 0;
        const ageSeconds = (Date.now() - updatedAt) / 1000;

        // Return cached if younger than 60 seconds
        if (ageSeconds < 60) {
          return NextResponse.json(data?.candles || []);
        }
      }
    } catch (e) {
      console.warn('[Candle-API] Cache read failed (skipping to live fetch):', e);
    }

    // 2. Fetch from Twelve Data
    const tdSymbol = SYMBOL_MAP[symbol];
    const tdInterval = INTERVAL_MAP[interval] || "1min";
    const apiKey = process.env.TWELVE_DATA_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: "Twelve Data API key missing" }, { status: 500 });
    }

    const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(tdSymbol)}&interval=${tdInterval}&outputsize=200&apikey=${apiKey}`;
    const res = await fetch(url);
    
    if (!res.ok) {
       return NextResponse.json({ error: `Provider returned HTTP ${res.status}` }, { status: 502 });
    }

    const data = await res.json();

    if (data.status === 'error') {
      console.error('[Candle-API] Provider Error:', data.message);
      return NextResponse.json({ error: data.message }, { status: 400 });
    }

    if (!data.values || !Array.isArray(data.values)) {
      return NextResponse.json([]);
    }

    // 3. Transform format
    const candles = data.values.map((v: any) => ({
      time: Math.floor(new Date(v.datetime).getTime() / 1000),
      open: parseFloat(v.open),
      high: parseFloat(v.high),
      low: parseFloat(v.low),
      close: parseFloat(v.close),
    })).sort((a: any, b: any) => a.time - b.time);

    // 4. Cache asynchronously
    cacheRef.set({
      symbol,
      interval,
      candles,
      updatedAt: Timestamp.now()
    }).catch(e => console.error('[Candle-API] Cache write failed:', e));

    return NextResponse.json(candles);

  } catch (error: any) {
    console.error('[Candle-API] Fatal Route Error:', error);
    return NextResponse.json({ 
      error: "Internal server error", 
      message: error.message
    }, { status: 500 });
  }
}
