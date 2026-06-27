import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * @fileOverview Zero-Dependency Institutional Price Proxy
 * Fetches directly from high-availability free public APIs server-side.
 * Replaces the Railway bridge and Twelve Data for terminal UI pricing.
 */

export async function GET() {
  try {
    const [cryptoRes, forexRes, metalRes] = await Promise.allSettled([
      fetch('https://api.binance.com/api/v3/ticker/price?symbols=["BTCUSDT","ETHUSDT","XRPUSDT","SOLUSDT"]', { next: { revalidate: 0 } }),
      fetch('https://api.frankfurter.app/latest?from=USD&to=EUR,GBP,JPY,AUD,CHF', { next: { revalidate: 0 } }),
      fetch('https://api.metals.live/v1/spot/gold', { next: { revalidate: 0 } })
    ]);

    const results: Record<string, any> = {};
    const now = new Date().toISOString();

    // 1. Process Crypto (Binance)
    if (cryptoRes.status === 'fulfilled' && cryptoRes.value.ok) {
      const data = await cryptoRes.value.json();
      data.forEach((item: any) => {
        const symbol = item.symbol.replace('USDT', 'USD');
        const price = parseFloat(item.price);
        // Crypto Spread: 0.1%
        const spread = price * 0.001;
        results[symbol] = { 
          price, 
          bid: price - spread, 
          ask: price + spread, 
          updatedAt: now 
        };
      });
    }

    // 2. Process Forex (Frankfurter)
    if (forexRes.status === 'fulfilled' && forexRes.value.ok) {
      const data = await forexRes.value.json();
      const r = data.rates;
      const pairs = [
        { id: 'EURUSD', price: 1 / r.EUR },
        { id: 'GBPUSD', price: 1 / r.GBP },
        { id: 'USDJPY', price: r.JPY },
        { id: 'AUDUSD', price: 1 / r.AUD },
        { id: 'USDCHF', price: r.CHF }
      ];
      pairs.forEach(p => {
        // Forex Spread: 0.02%
        const spread = p.price * 0.0002;
        results[p.id] = { 
          price: p.price, 
          bid: p.price - spread, 
          ask: p.price + spread, 
          updatedAt: now 
        };
      });
    }

    // 3. Process Gold (Metals.live)
    if (metalRes.status === 'fulfilled' && metalRes.value.ok) {
      const data = await metalRes.value.json();
      // Metals.live returns an array of objects
      if (Array.isArray(data) && data[0] && (data[0].gold || data[0].price)) {
        const price = parseFloat(data[0].gold || data[0].price);
        // Gold Spread: 0.05%
        const spread = price * 0.0005;
        results['XAUUSD'] = { 
          price, 
          bid: price - spread, 
          ask: price + spread, 
          updatedAt: now 
        };
      }
    }

    return NextResponse.json(results, { 
      headers: { 
        'Cache-Control': 'no-store, max-age=0, must-revalidate',
        'Pragma': 'no-cache'
      } 
    });
  } catch (error: any) {
    console.error('[Price-Proxy-Error]', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
