import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';

/**
 * @fileOverview Institutional Live Price API
 * Synchronizes liquidity from OANDA (Forex/Metals) and Kraken (Crypto).
 * Corrected Kraken ticker mapping for XRP and DOGE.
 */

// Added XXRPZUSD and XDGUSD explicitly
const KRAKEN_PAIRS = "XBTUSD,ETHUSD,SOLUSD,XXRPZUSD,ADAUSD,XDGUSD";

export async function GET() {
  const prices: Record<string, any> = {};
  const oandaKey = process.env.OANDA_API_KEY;
  const oandaAcc = process.env.OANDA_ACCOUNT_ID;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const fetchPromises = [];

    // 1. OANDA - Forex + Metals
    if (oandaKey && oandaAcc) {
      const oandaInstruments = 'XAU_USD,XAG_USD,XPT_USD,EUR_USD,GBP_USD,USD_JPY,USD_CHF,AUD_USD,USD_CAD,NZD_USD';
      fetchPromises.push(
        fetch(
          `https://api-fxpractice.oanda.com/v3/accounts/${oandaAcc}/pricing?instruments=${oandaInstruments}`,
          { 
            cache: 'no-store', 
            headers: { 'Authorization': `Bearer ${oandaKey}` },
            signal: controller.signal
          }
        ).then(async (r) => {
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
                source: 'oanda'
              };
            }
          }
        }).catch(e => console.warn('[LivePrices] OANDA sync failed'))
      );
    }

    // 2. Kraken - Crypto (Hardened Mapping for XRP/DOGE)
    fetchPromises.push(
      fetch(`https://api.kraken.com/0/public/Ticker?pair=${KRAKEN_PAIRS}`, { 
        cache: 'no-store',
        signal: controller.signal
      }).then(async (r) => {
        if (r.ok) {
          const data = await r.json();
          const results = data.result;
          if (results) {
            // Expanded mapping to catch regional variants XXBTZUSD, XXRPZUSD, etc.
            const kToPF: Record<string, string> = {
              'XXBTZUSD': 'BTCUSD', 'XBTUSD': 'BTCUSD',
              'XETHZUSD': 'ETHUSD', 'ETHUSD': 'ETHUSD',
              'SOLUSD': 'SOLUSD', 
              'XXRPZUSD': 'XRPUSD', 'XRPUSD': 'XRPUSD', 'XRPZUSD': 'XRPUSD',
              'ADAUSD': 'ADAUSD', 
              'XDGUSD': 'DOGEUSD', 'DOGEUSD': 'DOGEUSD', 'XXDGZUSD': 'DOGEUSD'
            };

            Object.entries(results).forEach(([kSym, item]: [string, any]) => {
              const sym = kToPF[kSym];
              if (!sym) return;

              const price = parseFloat(item.c[0]);
              const bid = parseFloat(item.b[0]);
              const ask = parseFloat(item.a[0]);
              
              if (isNaN(price)) return;

              const dec = (sym === 'BTCUSD' || sym === 'ETHUSD' || sym === 'SOLUSD') ? 2 : (sym === 'DOGEUSD' ? 5 : 4);

              prices[sym] = {
                bid: +bid.toFixed(dec),
                ask: +ask.toFixed(dec),
                price: +price.toFixed(dec),
                source: 'kraken'
              };
            });
          }
        }
      }).catch(e => console.warn('[LivePrices] Kraken sync failed'))
    );

    await Promise.allSettled(fetchPromises);

    return NextResponse.json(prices, { 
      headers: { 'Cache-Control': 'no-store' } 
    });
  } catch (error) {
    return NextResponse.json(prices, { status: 200 }); 
  } finally {
    clearTimeout(timeoutId);
  }
}
