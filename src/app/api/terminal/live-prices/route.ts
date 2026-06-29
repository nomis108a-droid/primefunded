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

  // Crypto - Binance first, CoinGecko fallback
  try {
    const r = await fetch(
      'https://api.binance.com/api/v3/ticker/price?symbols=["BTCUSDT","ETHUSDT","XRPUSDT","SOLUSDT","BNBUSDT","DOGEUSDT"]',
      { cache:'no-store' }
    );
    if (!r.ok) throw new Error(`Binance blocked: ${r.status}`);
    const d = await r.json();
    if (!Array.isArray(d)) throw new Error('Binance bad response');
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
    console.log('Crypto: Binance OK');
  } catch(e){
    console.error('Binance failed, trying CoinGecko:', e);
    try {
      const r = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,ripple,solana,binancecoin,dogecoin&vs_currencies=usd',
        { cache:'no-store' }
      );
      if (!r.ok) throw new Error(`CoinGecko error: ${r.status}`);
      const d = await r.json();
      const map: Record<string,string> = {
        bitcoin:'BTCUSD', ethereum:'ETHUSD', ripple:'XRPUSD',
        solana:'SOLUSD', binancecoin:'BNBUSD', dogecoin:'DOGEUSD'
      };
      for(const [id, sym] of Object.entries(map)){
        const p = (d as any)[id]?.usd;
        if(!p) continue;
        prices[sym] = { bid:+(p*0.999).toFixed(2), ask:+(p*1.001).toFixed(2), price:+p.toFixed(2), updatedAt: new Date().toISOString() };
      }
      console.log('Crypto: CoinGecko OK');
    } catch(e2){ console.error('CoinGecko also failed:', e2); }
  }

  return NextResponse.json(prices, { headers:{ 'Cache-Control':'no-store' }});
}
