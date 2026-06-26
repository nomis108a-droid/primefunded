import { NextResponse } from 'next/server';

/**
 * @fileOverview Institutional Live Price Proxy
 * Fetches market data server-side from Yahoo Finance to bypass CORS 
 * and applies institutional spreads.
 */

const SYMBOL_MAP: Record<string, string> = {
  'GC=F': 'XAUUSD',
  'BTC-USD': 'BTCUSD',
  'ETH-USD': 'ETHUSD',
  'EURUSD=X': 'EURUSD',
  'GBPUSD=X': 'GBPUSD',
  'JPY=X': 'USDJPY',
};

export async function GET() {
  try {
    const symbols = Object.keys(SYMBOL_MAP).join(',');
    const url = `https://query1.finance.yahoo.com/v8/finance/spark?symbols=${encodeURIComponent(symbols)}&range=1d&interval=1m`;

    const res = await fetch(url, {
      next: { revalidate: 0 },
      headers: { 'Cache-Control': 'no-store' }
    });

    if (!res.ok) throw new Error(`Yahoo API error: ${res.status}`);

    const data = await res.json();
    const results = data.spark?.result || [];
    const prices: Record<string, any> = {};

    results.forEach((item: any) => {
      const yahooSym = item.symbol;
      const internalSym = SYMBOL_MAP[yahooSym];
      const meta = item.response?.[0]?.meta;

      if (internalSym && meta?.regularMarketPrice) {
        const price = meta.regularMarketPrice;
        
        // Define spreads
        let spread = 0.0002; // Default Forex
        if (internalSym === 'XAUUSD') spread = 0.0005;
        if (internalSym.includes('BTC') || internalSym.includes('ETH')) spread = 0.001;

        prices[internalSym] = {
          price,
          bid: price * (1 - spread),
          ask: price * (1 + spread),
          updatedAt: new Date().toISOString()
        };
      }
    });

    return NextResponse.json(prices, {
      headers: { 'Cache-Control': 'no-store, max-age=0' }
    });

  } catch (error: any) {
    console.error('[Live-Prices-Proxy] Error:', error.message);
    return NextResponse.json({ error: 'Failed to fetch prices' }, { status: 500 });
  }
}
