import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from '@/lib/firebase-admin';
import { Timestamp } from "firebase-admin/firestore";

/**
 * @fileOverview Institutional Candle Server
 * Fetches Crypto from Binance and Forex/Metals from Stooq.
 * Includes a synthetic generator for weekend gaps to ensure visual continuity.
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
  "1min": { binance: "1m", stooq: "5" },
  "5min": { binance: "5m", stooq: "5" },
  "15min": { binance: "15m", stooq: "15" },
  "30min": { binance: "15m", stooq: "15" },
  "1h": { binance: "1h", stooq: "60" },
  "4h": { binance: "4h", stooq: "240" },
  "1day": { binance: "1d", stooq: "d" },
};

function generateFallbackCandles(basePrice: number, count: number, intervalSecs: number) {
  const candles = [];
  const now = Math.floor(Date.now() / 1000);
  let currentPrice = Number(basePrice) || 1.0;
  
  for (let i = count; i >= 0; i--) {
    const time = Math.floor((now - i * intervalSecs) / intervalSecs) * intervalSecs;
    const volatility = 0.0005;
    const change = (Math.random() - 0.49) * currentPrice * volatility;
    
    const open = currentPrice;
    const close = parseFloat((currentPrice + change).toFixed(5));
    const high = parseFloat((Math.max(open, close) + Math.random() * currentPrice * 0.0002).toFixed(5));
    const low = parseFloat((Math.min(open, close) - Math.random() * currentPrice * 0.0002).toFixed(5));
    
    candles.push({ time, open: parseFloat(open.toFixed(5)), high, low, close });
    currentPrice = close;
  }
  return candles;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get("symbol") || "EURUSD";
    const interval = (searchParams.get("interval") || "1min").toLowerCase();

    const db = getAdminDb();
    
    const intervalSecondsMap: Record<string, number> = {
      '1min': 60, '5min': 300, '15min': 900, '30min': 1800, '1h': 3600, '4h': 14400, '1day': 86400
    };
    const intervalSeconds = intervalSecondsMap[interval] || 300;

    let candles: any[] = [];
    let isFallback = false;

    // 1. Check Binance for Crypto
    if (CRYPTO_MAP[symbol]) {
      try {
        const bInterval = INTERVAL_MAP[interval]?.binance || "1m";
        const url = `https://api.binance.com/api/v3/klines?symbol=${CRYPTO_MAP[symbol]}&interval=${bInterval}&limit=200`;
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (res.ok) {
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
      } catch (err) {
        console.warn(`[Binance] Fetch failed for ${symbol}`);
      }
    } 
    // 2. Check Stooq for Forex/Metals
    else if (STOOQ_MAP[symbol]) {
      try {
        const sInterval = INTERVAL_MAP[interval]?.stooq || "5";
        const url = `https://stooq.com/q/d/l/?s=${STOOQ_MAP[symbol]}&i=${sInterval}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (res.ok) {
          const csv = await res.text();
          const lines = csv.trim().split('\n');
          // Skip header, check for data
          if (lines.length > 1 && !csv.includes('html')) {
            for (let i = 1; i < lines.length; i++) {
              const parts = lines[i].split(',');
              if (parts.length < 6) continue;
              const [date, time, open, high, low, close] = parts;
              const ts = Math.floor(new Date(`${date}T${time}`).getTime() / 1000);
              if (!isNaN(ts)) {
                candles.push({ time: ts, open: parseFloat(open), high: parseFloat(high), low: parseFloat(low), close: parseFloat(close) });
              }
            }
          }
        }
      } catch (err) {
        console.warn(`[Stooq] Fetch failed for ${symbol}`);
      }
    }

    // 3. Fallback: If no candles (weekend or API fail), generate synthetic data
    if (candles.length === 0) {
      isFallback = true;
      try {
        const priceDoc = await db.collection('livePrices').doc(symbol).get();
        const basePrice = Number(priceDoc.data()?.price) || (symbol.includes('USD') ? 1.0 : 100.0);
        candles = generateFallbackCandles(basePrice, 200, intervalSeconds);
      } catch (err) {
        candles = generateFallbackCandles(1.0, 200, intervalSeconds);
      }
    }

    candles.sort((a, b) => a.time - b.time);
    if (candles.length > 200) candles = candles.slice(-200);

    return NextResponse.json({ candles, isFallback });

  } catch (error: any) {
    console.error('[Candle-API] Fatal Error:', error.message);
    // Never return 500 if we can return a valid fallback
    return NextResponse.json({ candles: generateFallbackCandles(1.0, 50, 60), isFallback: true });
  }
}