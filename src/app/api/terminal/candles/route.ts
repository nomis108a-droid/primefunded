import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from '@/lib/firebase-admin';
import { Timestamp } from "firebase-admin/firestore";

/**
 * @fileOverview Free Multi-Source Candle Server
 * Fetches Crypto from Binance and Forex/Metals from Stooq (CSV).
 */

const CRYPTO_MAP: Record<string, string> = {
  "BTCUSD": "BTCUSDT",
  "ETHUSD": "ETHUSDT",
  "XRPUSD": "XRPUSDT",
  "SOLUSD": "SOLUSDT",
  "DOGEUSD": "DOGEUSDT",
  "ADAUSD": "ADAUSDT",
  "BNBUSD": "BNBUSDT"
};

const STOOQ_MAP: Record<string, string> = {
  "XAUUSD": "xauusd",
  "EURUSD": "eurusd",
  "GBPUSD": "gbpusd",
  "USDJPY": "usdjpy",
  "AUDUSD": "audusd",
  "USDCHF": "usdchf",
  "XAGUSD": "xagusd"
};

const INTERVAL_MAP: Record<string, { binance: string, stooq: string }> = {
  "1m": { binance: "1m", stooq: "m" },
  "5m": { binance: "5m", stooq: "5m" },
  "15m": { binance: "15m", stooq: "15m" },
  "1h": { binance: "1h", stooq: "h" },
  "4h": { binance: "4h", stooq: "h" },
  "1d": { binance: "1d", stooq: "d" },
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get("symbol") || "EURUSD";
    const interval = (searchParams.get("interval") || "1m").toLowerCase();

    const db = getAdminDb();
    const cacheKey = `${symbol}_${interval}`;
    const cacheRef = db.collection("candles").doc(cacheKey);

    // 1. Check Firestore Cache (5 Minute TTL)
    const cacheSnap = await cacheRef.get();
    if (cacheSnap.exists) {
      const cached = cacheSnap.data();
      const ageMs = Date.now() - (cached?.updatedAt?.toMillis() || 0);
      if (ageMs < 300000) {
        return NextResponse.json(cached?.candles || []);
      }
    }

    let candles: any[] = [];
    let url = "";

    // 2. CRYPTO: Fetch from Binance (FREE)
    if (CRYPTO_MAP[symbol]) {
      const binanceSymbol = CRYPTO_MAP[symbol];
      const bInterval = INTERVAL_MAP[interval]?.binance || "1m";
      url = `https://api.binance.com/api/v3/klines?symbol=${binanceSymbol}&interval=${bInterval}&limit=200`;
      
      console.log(`[Candle-API] Fetching Crypto: ${url}`);
      const res = await fetch(url);
      const data = await res.json();
      
      if (Array.isArray(data)) {
        candles = data.map((v: any) => ({
          time: Math.floor(v[0] / 1000),
          open: parseFloat(v[1]),
          high: parseFloat(v[2]),
          low: parseFloat(v[3]),
          close: parseFloat(v[4]),
        }));
      }
    } 
    // 3. FOREX/METALS: Fetch from Stooq CSV (FREE)
    else if (STOOQ_MAP[symbol]) {
      const stooqSymbol = STOOQ_MAP[symbol];
      const sInterval = INTERVAL_MAP[interval]?.stooq || "m";
      url = `https://stooq.com/q/d/l/?s=${stooqSymbol}&i=${sInterval}`;
      
      console.log(`[Candle-API] Fetching Forex/Metals: ${url}`);
      const res = await fetch(url);
      const csvText = await res.text();
      
      const lines = csvText.trim().split('\n');
      for (let i = 1; i < lines.length; i++) {
        const [date, time, open, high, low, close] = lines[i].split(',');
        if (!date || !time || isNaN(parseFloat(open))) continue;
        const timestamp = Math.floor(new Date(`${date}T${time}Z`).getTime() / 1000);
        
        candles.push({
          time: timestamp,
          open: parseFloat(open),
          high: parseFloat(high),
          low: parseFloat(low),
          close: parseFloat(close),
        });
      }
      
      candles.sort((a, b) => a.time - b.time);
      if (candles.length > 200) candles = candles.slice(-200);
    }

    if (candles.length > 0) {
      await cacheRef.set({
        symbol,
        interval,
        candles,
        updatedAt: Timestamp.now()
      }, { merge: true }).catch(() => {});
    }

    return NextResponse.json(candles);

  } catch (error: any) {
    console.error('[Candle-API] Fatal Error:', error.message);
    return NextResponse.json({ error: "Provider unavailable", details: error.message }, { status: 500 });
  }
}
