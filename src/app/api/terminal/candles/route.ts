import { NextRequest, NextResponse } from "next/server";

const CRYPTO_MAP: Record<string, string> = {
  "BTCUSD": "BTCUSDT", "ETHUSD": "ETHUSDT", "XRPUSD": "XRPUSDT",
  "SOLUSD": "SOLUSDT", "DOGEUSD": "DOGEUSDT", "ADAUSD": "ADAUSDT",
  "BNBUSD": "BNBUSDT"
};

const OANDA_MAP: Record<string, string> = {
  "XAUUSD": "XAU_USD", "XAGUSD": "XAG_USD", "XPTUSD": "XPT_USD",
  "EURUSD": "EUR_USD", "GBPUSD": "GBP_USD", "USDJPY": "USD_JPY",
  "AUDUSD": "AUD_USD", "USDCHF": "USD_CHF"
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
  let lastPrice = symbol.includes("BTC") ? 60000
    : symbol.includes("ETH") ? 3000
    : symbol.includes("XAU") ? 3200
    : symbol.includes("XAG") ? 30
    : symbol.includes("XPT") ? 950
    : symbol.includes("SOL") ? 150
    : symbol.includes("XRP") ? 0.5
    : symbol.includes("BNB") ? 400
    : symbol.includes("DOGE") ? 0.15
    : symbol.includes("ADA") ? 0.45 : 1.1;
  const now = Math.floor(Date.now() / 1000);
  for (let i = 0; i < count; i++) {
    const time = now - (count - i) * secs;
    const open = lastPrice;
    const volatility = lastPrice * 0.0008;
    const close = open + (Math.random() - 0.5) * volatility;
    candles.push({
      time, open,
      high: Math.max(open, close) + Math.abs(volatility * 0.3),
      low:  Math.min(open, close) - Math.abs(volatility * 0.3),
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
  const limit    = parseInt(searchParams.get("limit") || "300");
  const before   = searchParams.get("before") ? parseInt(searchParams.get("before")!) : null;

  let candles: any[] = [];

  // ── OANDA: Forex + Metals ─────────────────────────────────────
  if (OANDA_MAP[symbol]) {
    try {
      const oandaKey  = process.env.OANDA_API_KEY;
      const oandaAcc  = process.env.OANDA_ACCOUNT_ID;
      if (!oandaKey || !oandaAcc) throw new Error("OANDA env missing");

      const gran = OANDA_GRANULARITY[interval] || "M1";
      const instr = OANDA_MAP[symbol];
      let url = `https://api-fxpractice.oanda.com/v3/instruments/${instr}/candles?price=M&granularity=${gran}&count=${Math.min(limit, 500)}`;
      if (before) url += `&to=${encodeURIComponent(new Date(before * 1000).toISOString())}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${oandaKey}` },
        signal: AbortSignal.timeout(12000)
      });

      if (!res.ok) throw new Error(`OANDA ${res.status}`);
      const data = await res.json();
      candles = (data.candles || []).map((c: any) => ({
        time:   Math.floor(new Date(c.time).getTime() / 1000),
        open:   parseFloat(c.mid.o),
        high:   parseFloat(c.mid.h),
        low:    parseFloat(c.mid.l),
        close:  parseFloat(c.mid.c),
        volume: parseFloat(c.volume || 0)
      }));
      console.log(`[Candles] OANDA OK: ${symbol} ${candles.length}`);
    } catch (e) {
      console.error(`[Candles] OANDA failed ${symbol}:`, e);
    }
  }

  // ── Binance: Crypto ───────────────────────────────────────────
  else if (CRYPTO_MAP[symbol]) {
    try {
      const bInt = BINANCE_INTERVALS[interval] || "1m";
      let url = `https://api.binance.com/api/v3/klines?symbol=${CRYPTO_MAP[symbol]}&interval=${bInt}&limit=${Math.min(limit, 500)}`;
      if (before) url += `&endTime=${before * 1000}`;

      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`Binance ${res.status}`);
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error("bad response");

      candles = data.map((v: any) => ({
        time:   Math.floor(v[0] / 1000),
        open:   parseFloat(v[1]),
        high:   parseFloat(v[2]),
        low:    parseFloat(v[3]),
        close:  parseFloat(v[4]),
        volume: parseFloat(v[5])
      }));
      console.log(`[Candles] Binance OK: ${symbol} ${candles.length}`);
    } catch (e) {
      console.error(`[Candles] Binance failed ${symbol}, trying CoinGecko:`, e);
      try {
        const cgMap: Record<string,string> = {
          BTCUSD:"bitcoin", ETHUSD:"ethereum", XRPUSD:"ripple",
          SOLUSD:"solana", DOGEUSD:"dogecoin", BNBUSD:"binancecoin", ADAUSD:"cardano"
        };
        const coinId = cgMap[symbol];
        if (!coinId) throw new Error("no mapping");
        const days = interval==="1day"?365:interval==="4h"?90:interval==="1h"?30:7;
        const res = await fetch(
          `https://api.coingecko.com/api/v3/coins/${coinId}/ohlc?vs_currency=usd&days=${days}`,
          { signal: AbortSignal.timeout(8000) }
        );
        if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
        const data = await res.json();
        candles = data.map((v: any) => ({
          time: Math.floor(v[0]/1000), open:v[1], high:v[2], low:v[3], close:v[4]
        }));
        console.log(`[Candles] CoinGecko OK: ${symbol} ${candles.length}`);
      } catch(e2){ console.error(`[Candles] CoinGecko failed:`, e2); }
    }
  }

  // ── Return data or synthetic ──────────────────────────────────
  if (candles.length > 0) {
    candles.sort((a,b) => a.time - b.time);
    const unique = candles.filter((c,i,arr) => i===0 || c.time !== arr[i-1].time);
    return NextResponse.json({ candles: unique, isFallback: false });
  }

  console.warn(`[Candles] Serving synthetic for ${symbol}`);
  return NextResponse.json({
    candles: generateSyntheticCandles(symbol, limit),
    isFallback: true
  });
}
