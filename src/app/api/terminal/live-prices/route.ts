import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';

export async function GET() {
  const prices: Record<string,any> = {};
  const key = process.env.OANDA_API_KEY;
  const acc = process.env.OANDA_ACCOUNT_ID;

  // OANDA - real live forex + gold
  try {
    const instruments = 'XAU_USD,EUR_USD,GBP_USD,USD_JPY,USD_CHF,AUD_USD,USD_CAD,NZD_USD';
    const r = await fetch(
      `https://api-fxpractice.oanda.com/v3/accounts/${acc}/pricing?instruments=${instruments}`,
      { cache:'no-store', headers:{ 'Authorization':`Bearer ${key}` }}
    );
    const d = await r.json();
    const map: Record<string,string> = {
      'XAU_USD':'XAUUSD','EUR_USD':'EURUSD','GBP_USD':'GBPUSD',
      'USD_JPY':'USDJPY','USD_CHF':'USDCHF','AUD_USD':'AUDUSD',
      'USD_CAD':'USDCAD','NZD_USD':'NZDUSD'
    };
    for(const p of (d.prices||[])){
      const sym = map[p.instrument];
      if(!sym) continue;
      const bid = parseFloat(p.bids?.[0]?.price||0);
      const ask = parseFloat(p.asks?.[0]?.price||0);
      prices[sym] = { bid:+bid.toFixed(5), ask:+ask.toFixed(5), price:+((bid+ask)/2).toFixed(5), updatedAt: new Date().toISOString() };
    }
  } catch(e){ console.error('OANDA error:', e); }

  // Binance - crypto
  try {
    const r = await fetch(
      'https://api.binance.com/api/v3/ticker/price?symbols=["BTCUSDT","ETHUSDT","XRPUSDT","SOLUSDT","BNBUSDT","DOGEUSDT"]',
      { cache:'no-store' }
    );
    const d = await r.json();
    const m: Record<string,string> = {
      BTCUSDT:'BTCUSD',ETHUSDT:'ETHUSD',XRPUSDT:'XRPUSD',
      SOLUSDT:'SOLUSD',BNBUSDT:'BNBUSD',DOGEUSDT:'DOGEUSD'
    };
    for(const i of d){
      const s = m[i.symbol];
      if(!s) continue;
      const p = parseFloat(i.price);
      prices[s] = { bid:+(p*0.999).toFixed(2), ask:+(p*1.001).toFixed(2), price:+p.toFixed(2), updatedAt: new Date().toISOString() };
    }
  } catch(e){ console.error('Binance error:', e); }

  return NextResponse.json(prices, { headers:{ 'Cache-Control':'no-store' }});
}
