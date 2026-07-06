import { NextRequest, NextResponse } from "next/server";

const CRYPTO_MAP: Record<string, string> = {
  "BTCUSD": "XBTUSD", 
  "ETHUSD": "ETHUSD", 
  "SOLUSD": "SOLUSD",
  "XRPUSD": "XRPUSD",
  "DOGEUSD": "XDGUSD",
  "ADAUSD": "ADAUSD"
};

const OANDA_MAP: Record<string, string> = {
  "XAUUSD": "XAU_USD", "XAGUSD": "XAG_USD", "XPTUSD": "XPT_USD",
  "EURUSD": "EUR_USD", "GBPUSD": "GBP_USD", "USDJPY": "USD_JPY",
  "AUDUSD": "AUD_USD", "USDCHF": "USD_CHF", "USDCAD": "USD_CAD", "NZDUSD": "NZD_USD"
};

const OANDA_GRANULARITY: Record<string, string> = {
  "1min": "M1", "5min": "M5", "15min": "M15", "30min": "M30",
  "1h": "H1", "4h": "H4", "1day": "D", "1week": "W", "1month": "M"
};

/**
 * Institutional Cache Layer
 */
const realCandleCache = new Map<string, { candles: any[], timestamp: number }>();

function generateSyntheticCandles(symbol: string, count: number) {
  const candles = [];
  const secs = 60;
  let lastPrice = symbol.includes("BTC") ? 96000
    : symbol.includes("ETH") ? 2700
    : symbol.includes("XAU") ? 2850
    : symbol.includes("EUR") ? 1.05 : 1.1;
  const now = Math.floor(Date.now() / 1000);
  for (let i = 0; i < count; i++) {
    const time = now - (count - i) * secs;
    const open = lastPrice;
    const volatility = lastPrice * 0.0005;
    const close = open + (Math.random() - 0.5) * volatility;
    candles.push({
      time, open,
      high: Math.max(open, close) + Math.abs(volatility * 0.2),
      low:  Math.min(open, close) - Math.abs(volatility * 0.2),
      close,
    });
    lastPrice = close;
  }
  return candles;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") || "EURUSD").toUpperCase();
  const interval = (searchParams.get("interval") || "1min").toLowerCase();
  const limit = Math.min(parseInt(searchParams.get("limit") || "300"), 1000);

  const cacheKey = `${symbol}-${interval}`;
  let candles: any[] = [];
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    // 1. OANDA: Forex + Metals
    if (OANDA_MAP[symbol]) {
      const oandaKey = process.env.OANDA_API_KEY;
      const oandaAcc = process.env.OANDA_ACCOUNT_ID;

      if (oandaKey && oandaAcc) {
        try {
          const gran = OANDA_GRANULARITY[interval] || "M1";
          const instr = OANDA_MAP[symbol];
          const url = `https://api-fxpractice.oanda.com/v3/instruments/${instr}/candles?price=M&granularity=${gran}&count=${limit}`;

          const res = await fetch(url, {
            headers: { Authorization: `Bearer ${oandaKey}` },
            signal: controller.signal,
            cache: 'no-store'
          });

          if (res.ok) {
            const data = await res.json();
            candles = (data.candles || []).map((c: any) => ({
              time: Math.floor(new Date(c.time).getTime() / 1000),
              open: parseFloat(c.mid.o),
              high: parseFloat(c.mid.h),
              low: parseFloat(c.mid.l),
              close: parseFloat(c.mid.c),
            }));
          }
        } catch (e) {
          console.warn(`[Candles] OANDA fetch failed for ${symbol}`);
        }
      }
    }

    // 2. Kraken: Crypto
    else if (CRYPTO_MAP[symbol]) {
      try {
        const pair = CRYPTO_MAP[symbol];
        const intervalMap: Record<string, number> = {
          "1min": 1, "5min": 5, "15min": 15, "30min": 30, "1h": 60, "4h": 240, "1day": 1440, "1week": 10080
        };
        const kInt = intervalMap[interval] || 1;
        const url = `https://api.kraken.com/0/public/OHLC?pair=${pair}&interval=${kInt}`;

        const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
        if (res.ok) {
          const json = await res.json();
          const pairKey = Object.keys(json.result || {}).find(k => k !== 'last');
          
          if (pairKey) {
            const data = json.result[pairKey];
            const processed: any[] = [];
            
            for (let i = 0; i < data.length; i++) {
              const v = data[i];
              processed.push({
                time: Math.floor(Number(v[0])),
                open: parseFloat(String(v[1])),
                high: parseFloat(String(v[2])),
                low: parseFloat(String(v[3])),
                close: parseFloat(String(v[4])),
              });
            }
            candles = processed.sort((a, b) => a.time - b.time);
            if (candles.length > limit) candles = candles.slice(-limit);
          }
        }
      } catch (e) {
        console.warn(`[Candles] Kraken fetch failed for ${symbol}`);
      }
    }

    // Sanity Filter
    candles = candles.filter(c => !isNaN(c.open) && c.open > 0 && !isNaN(c.close) && c.close > 0);

    if (candles.length > 0) {
      realCandleCache.set(cacheKey, { candles, timestamp: Date.now() });
      return NextResponse.json({ candles, isFallback: false });
    }

    const cached = realCandleCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 120000) {
      return NextResponse.json({ candles: cached.candles, isFallback: false });
    }

    return NextResponse.json({
      candles: generateSyntheticCandles(symbol, limit),
      isFallback: true
    });

  } catch (error) {
    return NextResponse.json({ 
      candles: generateSyntheticCandles(symbol, 100), 
      isFallback: true
    });
  } finally {
    clearTimeout(timeoutId);
  }
}
