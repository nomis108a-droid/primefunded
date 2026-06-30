import { NextRequest, NextResponse } from "next/server";

const CRYPTO_MAP: Record<string, string> = {
  "BTCUSD": "BTCUSDT", "ETHUSD": "ETHUSDT", "SOLUSD": "SOLUSD"
};

const OANDA_MAP: Record<string, string> = {
  "XAUUSD": "XAU_USD", "XAGUSD": "XAG_USD", "XPTUSD": "XPT_USD",
  "EURUSD": "EUR_USD", "GBPUSD": "GBP_USD", "USDJPY": "USD_JPY",
  "AUDUSD": "AUD_USD", "USDCHF": "USD_CHF"
};

const OANDA_GRANULARITY: Record<string, string> = {
  "1min": "M1", "5min": "M5", "15min": "M15", "30min": "M30",
  "1h": "H1", "4h": "H4", "1day": "D", "1week": "W", "1month": "M"
};

const BINANCE_INTERVALS: Record<string, string> = {
  "1min": "1m", "5min": "5m", "15min": "15m", "30min": "30m",
  "1h": "1h", "4h": "4h", "1day": "1d", "1week": "1w", "1month": "1M"
};

function generateSyntheticCandles(symbol: string, count: number) {
  const candles = [];
  const secs = 60;
  let lastPrice = symbol.includes("BTC") ? 60000
    : symbol.includes("ETH") ? 3000
    : symbol.includes("XAU") ? 2500
    : symbol.includes("EUR") ? 1.08 : 1.1;
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
  const symbol = searchParams.get("symbol") || "EURUSD";
  const interval = (searchParams.get("interval") || "1min").toLowerCase();
  const limit = Math.min(parseInt(searchParams.get("limit") || "300"), 1000);

  let candles: any[] = [];
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 7000);

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
            signal: controller.signal
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
          } else {
            const errText = await res.text();
            console.warn(`[OANDA-DEBUG] API error for ${symbol}: ${res.status} - ${errText}`);
          }
        } catch (e) {
          console.warn(`[Candles] OANDA fetch failed for ${symbol}`);
        }
      } else {
        console.warn(`[OANDA-DEBUG] Missing credentials for ${symbol}. KEY: ${!!oandaKey}, ACC: ${!!oandaAcc}`);
      }
    }

    // 2. Binance: Crypto
    else if (CRYPTO_MAP[symbol]) {
      try {
        const bInt = BINANCE_INTERVALS[interval] || "1m";
        const url = `https://api.binance.com/api/v3/klines?symbol=${CRYPTO_MAP[symbol]}&interval=${bInt}&limit=${limit}`;

        const res = await fetch(url, { signal: controller.signal });
        if (res.ok) {
          const data = await res.json();
          candles = data.map((v: any) => ({
            time: Math.floor(v[0] / 1000),
            open: parseFloat(v[1]),
            high: parseFloat(v[2]),
            low: parseFloat(v[3]),
            close: parseFloat(v[4]),
          }));
        }
      } catch (e) {
        console.warn(`[Candles] Binance fetch failed for ${symbol}`);
      }
    }

    if (candles.length > 0) {
      return NextResponse.json({ candles, isFallback: false });
    }

    // 3. Fallback: Synthetic
    return NextResponse.json({
      candles: generateSyntheticCandles(symbol, limit),
      isFallback: true
    });

  } catch (error) {
    return NextResponse.json({ 
      candles: generateSyntheticCandles(symbol, 100), 
      isFallback: true,
      error: "Timeout or route error"
    });
  } finally {
    clearTimeout(timeoutId);
  }
}
