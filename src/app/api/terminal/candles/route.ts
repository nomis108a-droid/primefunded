import { NextRequest, NextResponse } from "next/server";

const CRYPTO_MAP: Record<string, string> = {
  "BTCUSD": "BTCUSDT", "ETHUSD": "ETHUSDT", "XRPUSD": "XRPUSDT",
  "SOLUSD": "SOLUSDT", "DOGEUSD": "DOGEUSDT", "ADAUSD": "ADAUSDT", "BNBUSD": "BNBUSDT"
};

const OANDA_MAP: Record<string, string> = {
  "XAUUSD": "XAU_USD", "EURUSD": "EUR_USD", "GBPUSD": "GBP_USD",
  "USDJPY": "USD_JPY", "AUDUSD": "AUD_USD", "USDCHF": "USD_CHF"
};

const BINANCE_INTERVALS: Record<string, string> = {
  "1min": "1m", "5min": "5m", "15min": "15m", "30min": "30m",
  "1h": "1h", "4h": "4h", "1day": "1d", "1week": "1w", "1month": "1M"
};

const OANDA_GRANULARITY: Record<string, string> = {
  "1min": "M1", "5min": "M5", "15min": "M15", "30min": "M30",
  "1h": "H1", "4h": "H4", "1day": "D", "1week": "W", "1month": "M"
};

function generateSyntheticCandles(symbol: string, count: number) {
  const candles = [];
  const secs = 60;
  let lastPrice = symbol.includes("BTC") ? 60000 : symbol.includes("ETH") ? 3000 : symbol.includes("XAU") ? 2300 : 1.1;
  const now = Math.floor(Date.now() / 1000);
  for (let i = 0; i < count; i++) {
    const time = now - (count - i) * secs;
    const open = lastPrice;
    const volatility = lastPrice * 0.0005;
    const close = open + (Math.random() - 0.5) * volatility;
    candles.push({
      time, open,
      high: Math.max(open, close) + (volatility * 0.2),
      low: Math.min(open, close) - (volatility * 0.2),
      close,
    });
    lastPrice = close;
  }
  return candles;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol   = searchParams.get("symbol") || "EURUSD";
  const interval = (searchParams.get("interval") || "1min").toLowerCase();
  const limit    = parseInt(searchParams.get("limit") || "500");
  const before   = searchParams.get("before") ? parseInt(searchParams.get("before")!) : null;

  let candles: any[] = [];

  // ── OANDA: Forex + Gold ──────────────────────────────────────
  if (OANDA_MAP[symbol]) {
    try {
      const oandaKey     = process.env.OANDA_API_KEY;
      const oandaAccount = process.env.OANDA_ACCOUNT_ID;

      if (!oandaKey || !oandaAccount) throw new Error("OANDA env missing");

      const instrument  = OANDA_MAP[symbol];
      const granularity = OANDA_GRANULARITY[interval] || "M1";
      let url = `https://api-fxpractice.oanda.com/v3/instruments/${instrument}/candles?price=M&granularity=${granularity}&count=${limit}`;
      if (before) url += `&to=${encodeURIComponent(new Date(before * 1000).toISOString())}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${oandaKey}` },
        signal: AbortSignal.timeout(8000)
      });

      if (!res.ok) throw new Error(`OANDA ${res.status}: ${await res.text()}`);

      const data = await res.json();
      candles = (data.candles || [])
        .filter((c: any) => c.complete !== false || true)
        .map((c: any) => ({
          time:   Math.floor(new Date(c.time).getTime() / 1000),
          open:   parseFloat(c.mid.o),
          high:   parseFloat(c.mid.h),
          low:    parseFloat(c.mid.l),
          close:  parseFloat(c.mid.c),
          volume: parseFloat(c.volume || 0)
        }));

      console.log(`[Candles] OANDA OK: ${symbol} ${candles.length} candles`);
    } catch (e) {
      console.error(`[Candles] OANDA failed for ${symbol}:`, e);
    }
  }

  // ── Binance: Crypto — with CoinGecko chart fallback ──────────
  else if (CRYPTO_MAP[symbol]) {
    // Try Binance first
    try {
      const bInterval = BINANCE_INTERVALS[interval] || "1m";
      let url = `https://api.binance.com/api/v3/klines?symbol=${CRYPTO_MAP[symbol]}&interval=${bInterval}&limit=${limit}`;
      if (before) url += `&endTime=${before * 1000}`;

      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) throw new Error(`Binance ${res.status}`);

      const data = await res.json();
      if (!Array.isArray(data)) throw new Error("Binance bad response");

      candles = data.map((v: any) => ({
        time:   Math.floor(v[0] / 1000),
        open:   parseFloat(v[1]),
        high:   parseFloat(v[2]),
        low:    parseFloat(v[3]),
        close:  parseFloat(v[4]),
        volume: parseFloat(v[5])
      }));
      console.log(`[Candles] Binance OK: ${symbol} ${candles.length} candles`);
    } catch (e) {
      console.error(`[Candles] Binance failed, trying CoinGecko:`, e);

      // CoinGecko fallback for crypto candles
      try {
        const cgMap: Record<string, string> = {
          BTCUSD: "bitcoin", ETHUSD: "ethereum", XRPUSD: "ripple",
          SOLUSD: "solana", DOGEUSD: "dogecoin", BNBUSD: "binancecoin"
        };
        const coinId = cgMap[symbol];
        if (!coinId) throw new Error("No CoinGecko mapping");

        const days = interval === "1day" ? 365 : interval === "4h" ? 90 : interval === "1h" ? 30 : 7;
        const res  = await fetch(
          `https://api.coingecko.com/api/v3/coins/${coinId}/ohlc?vs_currency=usd&days=${days}`,
          { signal: AbortSignal.timeout(8000) }
        );
        if (!res.ok) throw new Error(`CoinGecko ${res.status}`);

        const data = await res.json();
        candles = data.map((v: any) => ({
          time:  Math.floor(v[0] / 1000),
          open:  v[1], high: v[2], low: v[3], close: v[4]
        }));
        console.log(`[Candles] CoinGecko OK: ${symbol} ${candles.length} candles`);
      } catch (e2) {
        console.error(`[Candles] CoinGecko also failed:`, e2);
      }
    }
  }

  // ── Return real data or synthetic fallback ────────────────────
  if (candles.length > 0) {
    candles.sort((a, b) => a.time - b.time);
    // Remove duplicate timestamps
    const unique = candles.filter((c, i, arr) => i === 0 || c.time !== arr[i-1].time);
    return NextResponse.json({ candles: unique, isFallback: false });
  }

  console.warn(`[Candles] No data for ${symbol}, serving synthetic`);
  return NextResponse.json({
    candles: generateSyntheticCandles(symbol, limit),
    isFallback: true
  });
}
