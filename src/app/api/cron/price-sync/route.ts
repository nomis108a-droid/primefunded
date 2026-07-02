
import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

/**
 * @fileOverview Institutional Automated Price Synchronizer
 * Fetches real-time market data and persists it to Firestore.
 * Triggered by server-side cron jobs.
 */

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const cronKey = req.headers.get("x-cron-key") || req.nextUrl.searchParams.get("key");
  const expectedKey = "primefunded_cron_2024";

  if (cronKey !== expectedKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getAdminDb();
  const oandaKey = process.env.OANDA_API_KEY;
  const oandaAcc = process.env.OANDA_ACCOUNT_ID;
  
  const prices: Record<string, any> = {};
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
                price: +((bid + ask) / 2).toFixed(5)
              };
            }
          }
        }).catch(() => {})
      );
    }

    // 2. Binance - Crypto
    const binanceSymbols = '["BTCUSDT","ETHUSDT","SOLUSDT","XRPUSDT","BNBUSDT","DOGEUSDT","ADAUSDT"]';
    fetchPromises.push(
      fetch(`https://api.binance.com/api/v3/ticker/price?symbols=${encodeURIComponent(binanceSymbols)}`, { 
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

              const spread = price * 0.00025;
              const dec = (sym === 'BTCUSD' || sym === 'ETHUSD' || sym === 'BNBUSD') ? 2 : 4;
              
              prices[sym] = {
                bid: +(price - spread).toFixed(dec),
                ask: +(price + spread).toFixed(dec),
                price: +price.toFixed(dec)
              };
            });
          }
        }
      }).catch(() => {})
    );

    await Promise.all(fetchPromises);

    const batch = db.batch();
    const keys = Object.keys(prices);
    
    keys.forEach(symbol => {
      const docRef = db.collection('livePrices').doc(symbol.toUpperCase());
      batch.set(docRef, {
        ...prices[symbol],
        pair: symbol.toUpperCase(),
        updatedAt: Timestamp.now()
      }, { merge: true });
    });

    if (keys.length > 0) {
      await batch.commit();
    }

    return NextResponse.json({ 
      success: true, 
      updated: keys.length, 
      symbols: keys 
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  } finally {
    clearTimeout(timeoutId);
  }
}
