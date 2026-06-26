import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from '@/lib/firebase-admin';
import { Timestamp } from "firebase-admin/firestore";

/**
 * @fileOverview Emergency Credit-Saving Candle Server
 * Switched to Binance for crypto (FREE) and Cache-Only for Forex/Metals.
 */

const CRYPTO_SYMBOLS = ["BTCUSD", "ETHUSD", "XRPUSD", "SOLUSD", "BNBUSD", "DOGEUSD", "ADAUSD"];

// Binance kline intervals: 1m, 5m, 15m, 1h, 4h, 1d
const INTERVAL_MAP: Record<string, string> = {
  "1m": "1m",
  "5m": "5m",
  "15m": "15m",
  "1h": "1h",
  "4h": "4h",
  "1d": "1d",
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get("symbol");
    const interval = searchParams.get("interval") || "1m";

    if (!symbol) {
      return NextResponse.json({ error: "Invalid symbol" }, { status: 400 });
    }

    const db = getAdminDb();
    const cacheKey = `${symbol}_${interval}`;
    const cacheRef = db.collection("candles").doc(cacheKey);

    // 1. Check Firestore Cache (Used for all symbols, but mandatory for Forex)
    try {
      const cacheSnap = await cacheRef.get();
      if (cacheSnap.exists) {
        const data = cacheSnap.data();
        const updatedAt = data?.updatedAt?.toMillis() || 0;
        const ageSeconds = (Date.now() - updatedAt) / 1000;

        // Emergency Protocol: Use 1-hour cache for everything to save credits
        if (ageSeconds < 3600) {
          return NextResponse.json(data?.candles || []);
        }
      }
    } catch (e) {
      console.warn('[Candle-API] Cache read failed:', e);
    }

    // 2. CRYPTO: Fetch from Binance (FREE)
    if (CRYPTO_SYMBOLS.includes(symbol)) {
      try {
        const binanceSymbol = symbol.replace("USD", "USDT");
        const bInterval = INTERVAL_MAP[interval] || "1m";
        const url = `https://api.binance.com/api/v3/klines?symbol=${binanceSymbol}&interval=${bInterval}&limit=100`;
        
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Binance returned ${res.status}`);
        
        const data = await res.json();
        const candles = data.map((v: any) => ({
          time: Math.floor(v[0] / 1000),
          open: parseFloat(v[1]),
          high: parseFloat(v[2]),
          low: parseFloat(v[3]),
          close: parseFloat(v[4]),
        }));

        // Cache crypto data
        cacheRef.set({
          symbol,
          interval,
          candles,
          updatedAt: Timestamp.now()
        }).catch(() => {});

        return NextResponse.json(candles);
      } catch (err: any) {
        console.error('[Candle-API] Binance fetch failed:', err.message);
        return NextResponse.json([]);
      }
    }

    // 3. FOREX/METALS: Return empty if no valid cache (Twelve Data is disabled)
    console.warn(`[Candle-API] Twelve Data disabled. No valid cache for ${symbol}. Returning empty.`);
    return NextResponse.json([]);

  } catch (error: any) {
    console.error('[Candle-API] Fatal Route Error:', error);
    return NextResponse.json({ 
      error: "Internal server error", 
      message: error.message
    }, { status: 500 });
  }
}
