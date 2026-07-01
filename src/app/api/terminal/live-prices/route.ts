import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';

/**
 * @fileOverview Institutional Live Price API
 * Expanded to support full asset list for OANDA (FX/Metals) and Kraken (Crypto).
 * Hardened with timeouts and shared AbortSignal.
 */

export async function GET() {
  const prices: Record<string, any> = {};
  const key = process.env.OANDA_API_KEY;
  const acc = process.env.OANDA_ACCOUNT_ID;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 7000);

  try {
    // 1. OANDA - Forex + Metals
    if (key && acc) {
      try {
        const instruments = 'XAU_USD,XAG_USD,XPT_USD,EUR_USD,GBP_USD,USD_JPY,USD_CHF,AUD_USD,USD_CAD,NZD_USD';
        const r = await fetch(
          `https://api-fxpractice.oanda.com/v3/accounts/${acc}/pricing?instruments=${instruments}`,
          { 
            cache: 'no-store', 
            headers: { 'Authorization': `Bearer ${key}` },
            signal: controller.signal
          }
        );
        
        if (r.ok) {
          const d = await r.json();
          const map: Record<string, string> = {
            'XAU_USD': 'XAUUSD', 'XAG_USD': 'XAGUSD', 'XPT_USD': 'XPTUSD',
            'EUR_USD': 'EURUSD', 'GBP_USD': 'GBPUSD', 'USD_JPY': 'USDJPY',
            'USD_CHF': 'USDCHF', 'AUD_USD': 'AUDUSD', 'USD_CAD': 'USDCAD', 'NZD_USD': 'NZDUSD'
          };
          for (const p of (d.prices || [])) {
            const sym = map[p.instrument];
            if (!sym) continue;
            const bid = parseFloat(p.bids?.[0]?.price || 0);
            const ask = parseFloat(p.asks?.[0]?.price || 0);
            prices[sym] = { 
              bid: +bid.toFixed(5), 
              ask: +ask.toFixed(5), 
              price: +((bid + ask) / 2).toFixed(5), 
              updatedAt: new Date().toISOString() 
            };
          }
        }
      } catch (e) {
        console.warn('[LivePrices] OANDA fetch failed or timed out');
      }
    }

    // 2. Kraken - Crypto (Full Asset Coverage)
    try {
      const pairs = 'XBTUSD,ETHUSD,SOLUSD,XRPUSD,ADAUSD,DOGEUSD,BNBUSD';
      const r = await fetch(`https://api.kraken.com/0/public/Ticker?pair=${pairs}`, { 
        cache: 'no-store',
        signal: controller.signal
      });
      
      if (r.ok) {
        const d = await r.json();
        const result = d.result || {};
        const map: Record<string, string> = {
          'XXBTZUSD': 'BTCUSD', 'XETHZUSD': 'ETHUSD', 'SOLUSD': 'SOLUSD',
          'XXRPZUSD': 'XRPUSD', 'ADAUSD': 'ADAUSD', 'XDGUSD': 'DOGEUSD', 'BNBUSD': 'BNBUSD'
        };
        for (const [krakenPair, data] of Object.entries(result)) {
          const sym = map[krakenPair];
          if (!sym) continue;
          const p = parseFloat((data as any).c?.[0]);
          if (!p || isNaN(p)) continue;
          
          const dec = (sym === 'BTCUSD' || sym === 'ETHUSD' || sym === 'BNBUSD') ? 2 : 4;
          prices[sym] = {
            bid: +(p * 0.9999).toFixed(dec),
            ask: +(p * 1.0001).toFixed(dec),
            price: +p.toFixed(dec),
            updatedAt: new Date().toISOString()
          };
        }
      }
    } catch (e) {
      console.warn('[LivePrices] Kraken fetch failed or timed out');
    }

    return NextResponse.json(prices, { 
      headers: { 'Cache-Control': 'no-store' } 
    });
  } catch (error) {
    return NextResponse.json(prices, { status: 200 }); 
  } finally {
    clearTimeout(timeoutId);
  }
}