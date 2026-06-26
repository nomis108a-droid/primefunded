import { NextRequest, NextResponse } from "next/server";
import { adminDb } from '@/lib/firebase-admin';
import { Timestamp } from "firebase-admin/firestore";

/**
 * @fileOverview Institutional Candle Server
 * Fetches and caches historical candlestick data from Twelve Data.
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
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol");
  const interval = searchParams.get("interval") || "1m";

  if (!symbol || !SYMBOL_MAP[symbol]) {
    return NextResponse.json({ error: "Invalid symbol" }, { status: 400 });
  }

  const cacheKey = `${symbol}_${interval}`;
  const cacheRef = adminDb.collection("candles").doc(cacheKey);

  try {
    // 1. Check Firestore Cache
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

    // 2. Fetch from Twelve Data if stale or missing
    const tdSymbol = SYMBOL_MAP[symbol];
    const tdInterval = INTERVAL_MAP[interval] || "1min";
    const apiKey = process.env.TWELVE_DATA_API_KEY;

    if (!apiKey) {
      throw new Error("Missing TWELVE_DATA_API_KEY");
    }

    const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(tdSymbol)}&interval=${tdInterval}&outputsize=200&apikey=${apiKey}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.status === 'error') {
      console.error('[Candle-API] Twelve Data Error:', data.message);
      return NextResponse.json({ error: data.message }, { status: 400 });
    }

    if (!data.values || !Array.isArray(data.values)) {
      return NextResponse.json([]);
    }

    // 3. Transform to Lightweight Charts format
    // Twelve Data returns newest first, we need oldest first
    const candles = data.values.map((v: any) => ({
      time: Math.floor(new Date(v.datetime).getTime() / 1000),
      open: parseFloat(v.open),
      high: parseFloat(v.high),
      low: parseFloat(v.low),
      close: parseFloat(v.close),
    })).sort((a: any, b: any) => a.time - b.time);

    // 4. Cache to Firestore
    await cacheRef.set({
      symbol,
      interval,
      candles,
      updatedAt: Timestamp.now()
    });

    return NextResponse.json(candles);

  } catch (error: any) {
    console.error('[Candle-API] Fatal Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
