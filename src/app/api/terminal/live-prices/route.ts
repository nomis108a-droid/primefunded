
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * @fileOverview Institutional Price Proxy (OANDA + Binance)
 * Fetches Crypto from Binance and Forex/Metals from OANDA.
 * Includes explicit configuration logging.
 */

export async function GET() {
  const oandaKey = process.env.OANDA_API_KEY;
  const oandaAccount = process.env.OANDA_ACCOUNT_ID;

  // Debug missing config in server logs
  if (!oandaKey || !oandaAccount) {
    console.warn(`[OANDA-DEBUG] Live pricing config missing. Key=${!!oandaKey}, Account=${!!oandaAccount}`);
  }

  try {
    const [cryptoRes, oandaRes] = await Promise.allSettled([
      fetch('https://api.binance.com/api/v3/ticker/price?symbols=["BTCUSDT","ETHUSDT","XRPUSDT","SOLUSDT","DOGEUSDT","ADAUSDT","BNBUSDT"]', { next: { revalidate: 0 } }),
      oandaKey && oandaAccount 
        ? fetch(`https://api-fxpractice.oanda.com/v3/accounts/${oandaAccount}/pricing?instruments=XAU_USD,EUR_USD,GBP_USD,USD_JPY,AUD_USD,USD_CHF`, {
            headers: { 'Authorization': `Bearer ${oandaKey}` },
            next: { revalidate: 0 }
          })
        : Promise.reject('OANDA Config Missing')
    ]);

    const results: Record<string, any> = {};
    const now = new Date().toISOString();

    // 1. Process Crypto (Binance)
    if (cryptoRes.status === 'fulfilled' && cryptoRes.value.ok) {
      const data = await cryptoRes.value.json();
      data.forEach((item: any) => {
        const symbol = item.symbol.replace('USDT', 'USD');
        const price = parseFloat(item.price);
        if (isNaN(price) || price <= 0) return;
        const spread = price * 0.0005; 
        results[symbol] = { price, bid: price - spread, ask: price + spread, updatedAt: now };
      });
    }

    // 2. Process Forex & Metals (OANDA)
    if (oandaRes.status === 'fulfilled' && oandaRes.value.ok) {
      const data = await oandaRes.value.json();
      if (data.prices) {
        data.prices.forEach((p: any) => {
          const symbol = p.instrument.replace('_', '');
          const bid = parseFloat(p.bids[0].price);
          const ask = parseFloat(p.asks[0].price);
          const price = (bid + ask) / 2;
          results[symbol] = { price, bid, ask, updatedAt: now };
        });
      }
    } else {
      const reason = oandaRes.status === 'rejected' ? oandaRes.reason : `HTTP ${oandaRes.value.status}`;
      console.warn('[OANDA-Fetch-Failed]', reason);
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
