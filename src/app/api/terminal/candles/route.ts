
import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from '@/lib/firebase-admin';

/**
 * @fileOverview Institutional Candle Server (OANDA + Binance)
 * Fetches real market history for Crypto (Binance) and Forex/Metals (OANDA).
 * Equiped with fallback generator and verbose diagnostic logging.
 */

const CRYPTO_MAP: Record<string, string> = {
  "BTCUSD": "BTCUSDT", "ETHUSD": "ETHUSDT", "XRPUSD": "XRPUSDT",
  "SOLUSD": "SOLUSDT", "DOGEUSD": "DOGEUSDT", "ADAUSD": "ADAUSDT", "BNBUSD": "BNBUSDT"
};

const OANDA_MAP: Record<string, string> = {
  "XAUUSD": "XAU_USD", "EURUSD": "EUR_USD", "GBPUSD": "GBP_USD",
  "USDJPY": "USD_JPY", "AUDUSD": "AUD_USD", "USDCHF": "USD_CHF"
};

const BINANCE_INTERVALS: Record<string, string> = {
  "1min": "1m", "5min": "5m", "15min": "15m", "30min": "30m", "1h": "1h", "4h": "4h", "1day": "1d", "1week": "1w", "1month": "1M"
};

const OANDA_GRANULARITY: Record<string, string> = {
  "1min": "M1", "5min": "M5", "15min": "M15", "30min": "M30", "1h": "H1", "4h": "H4", "1day": "D", "1week": "W", "1month": "M"
};

function generateSyntheticCandles(symbol: string, interval: string, count: number) {
  const candles = [];
  const secs = 60; // default 1m
  let lastPrice = symbol.includes("BTC") ? 60000 : symbol.includes("ETH") ? 3000 : symbol.includes("XAU") ? 2300 : 1.1;
  const now = Math.floor(Date.now() / 1000);
  for (let i = 0; i < count; i++) {
    const time = now - (count - i) * secs;
    const open = lastPrice;
    const volatility = lastPrice * 0.0005;
    const close = open + (Math.random() - 0.5) * volatility;
    candles.push({
      time,
      open,
      high: Math.max(open, close) + (volatility * 0.2),
      low: Math.min(open, close) - (volatility * 0.2),
      close,
    });
    lastPrice = close;
  }
  return candles;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get("symbol") || "EURUSD";
    const interval = (searchParams.get("interval") || "1min").toLowerCase();
    const limit = parseInt(searchParams.get("limit") || "500");
    const before = searchParams.get("before") ? parseInt(searchParams.get("before")!) : null;

    let candles: any[] = [];

    // 1. OANDA for Forex & Metals
    if (OANDA_MAP[symbol]) {
      const oandaKey = process.env.OANDA_API_KEY;
      const oandaAccount = process.env.OANDA_ACCOUNT_ID;
      
      console.log(`[OANDA-DEBUG] Symbol: ${symbol}. Key present: ${!!oandaKey}, Account present: ${!!oandaAccount}`);

      if (!oandaKey || !oandaAccount) {
        console.warn(`[OANDA-DEBUG] Missing config for ${symbol}. Returning synthetic fallback.`);
      } else {
        const instrument = OANDA_MAP[symbol];
        const granularity = OANDA_GRANULARITY[interval] || "M1";
        let url = `https://api-fxpractice.oanda.com/v3/instruments/${instrument}/candles?price=M&granularity=${granularity}&count=${limit}`;
        if (before) {
          const dt = new Date(before * 1000).toISOString();
          url += `&to=${encodeURIComponent(dt)}`;
        }

        const res = await fetch(url, {
          headers: { 'Authorization': `Bearer ${oandaKey}` },
          signal: AbortSignal.timeout(8000)
        });

        if (!res.ok) {
          const errText = await res.text();
          console.error(`[OANDA-DEBUG] OANDA API Error (${res.status}):`, errText);
        } else {
          const data = await res.json();
          candles = (data.candles || []).map((c: any) => ({
            time: Math.floor(new Date(c.time).getTime() / 1000),
            open: parseFloat(c.mid.o),
            high: parseFloat(c.mid.h),
            low: parseFloat(c.mid.l),
            close: parseFloat(c.mid.c),
            volume: parseFloat(c.volume)
          }));
        }
      }
    }
    // 2. BINANCE for Crypto
    else if (CRYPTO_MAP[symbol]) {
      const bInterval = BINANCE_INTERVALS[interval] || "1m";
      let url = `https://api.binance.com/api/v3/klines?symbol=${CRYPTO_MAP[symbol]}&interval=${bInterval}&limit=${limit}`;
      if (before) url += `&endTime=${before * 1000}`;

      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (res.ok) {
        const data = await res.json();
        candles = data.map((v: any) => ({
          time: Math.floor(v[0] / 1000),
          open: parseFloat(v[1]),
          high: parseFloat(v[2]),
          low: parseFloat(v[3]),
          close: parseFloat(v[4]),
          volume: parseFloat(v[5])
        }));
      }
    }

    if (candles.length > 0) {
      candles.sort((a, b) => a.time - b.time);
      return NextResponse.json({ candles, isFallback: false });
    }

    console.warn(`[Candle-API] No data found for ${symbol}. Serving synthetic dataset.`);
    const synthetic = generateSyntheticCandles(symbol, interval, limit);
    return NextResponse.json({ candles: synthetic, isFallback: true });

  } catch (error: any) {
    console.error('[Candle-API] Fatal Error:', error.message);
    const fallback = generateSyntheticCandles(searchParams.get("symbol") || "EURUSD", "1min", 100);
    return NextResponse.json({ candles: fallback, isFallback: true, error: error.message }, { status: 200 });
  }
}
