import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';

/**
 * @fileOverview Institutional Live Price API
 * Synchronizes liquidity from OANDA (Forex/Metals) and Binance (Crypto).
 * Hardened with timeouts and parallel fetch execution.
 */

const CRYPTO_LIST = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "BNBUSDT", "DOGEUSDT", "ADAUSDT"];

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

    // 2. Binance - Crypto
    const binanceUrl = `https://api.binance.com/api/v3/ticker/price?symbols=${encodeURIComponent(JSON.stringify(CRYPTO_LIST))}`;
    fetchPromises.push(
      fetch(binanceUrl, { 
        cache: 'no-store',
        signal: controller.signal
      }).then(async (r) => {
        if (r.ok) {
          const data = await r.json();
          if (Array.isArray(data)) {
            data.forEach(item => {
              const sym = item.symbol.replace('USDT', 'USD');
              const price = parseFloat(item.price);
              if (isNaN(price)) return;

              // Institutional spread simulation (Crypto: 0.05%)
              const spread = price * 0.00025;
              const dec = (sym === 'BTCUSD' || sym === 'ETHUSD' || sym === 'BNBUSD') ? 2 : (sym === 'DOGEUSD' || sym === 'ADAUSD') ? 4 : 2;
              
              prices[sym] = {
                bid: +(price - spread).toFixed(dec),
                ask: +(price + spread).toFixed(dec),
                price: +price.toFixed(dec),
                source: 'binance'
              };
            });
          }
        }
      }).catch(e => console.warn('[LivePrices] Binance sync network error'))
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
