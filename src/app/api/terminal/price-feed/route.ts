import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

/**
 * @fileOverview Institutional Price Synchronizer
 * Hardened with timeouts to prevent 502 Gateway errors.
 */

export async function GET(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");
  if (!process.env.TERMINAL_CRON_KEY || apiKey !== process.env.TERMINAL_CRON_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const oandaKey = process.env.OANDA_API_KEY;
  const oandaAccount = process.env.OANDA_ACCOUNT_ID;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const db = getAdminDb();
    const prices: Record<string, any> = {};

    const [cryptoRes, oandaRes] = await Promise.allSettled([
      fetch('https://api.binance.com/api/v3/ticker/price?symbols=["BTCUSDT","ETHUSDT","XRPUSDT","SOLUSDT"]', { signal: controller.signal }),
      oandaKey && oandaAccount 
        ? fetch(`https://api-fxpractice.oanda.com/v3/accounts/${oandaAccount}/pricing?instruments=XAU_USD,EUR_USD,GBP_USD,USD_JPY,AUD_USD,USD_CHF`, {
            headers: { 'Authorization': `Bearer ${oandaKey}` },
            signal: controller.signal
          })
        : Promise.reject('OANDA Config Missing')
    ]);

    // Sync Crypto (Binance)
    if (cryptoRes.status === 'fulfilled' && cryptoRes.value.ok) {
      const data = await cryptoRes.value.json();
      data.forEach((item: any) => {
        const symbol = item.symbol.replace('USDT', 'USD');
        const price = parseFloat(item.price);
        const spread = price * 0.0005; 
        prices[symbol] = { price, bid: price - spread, ask: price + spread };
      });
    }

    // Sync Forex/Metals (OANDA)
    if (oandaRes.status === 'fulfilled' && oandaRes.value.ok) {
      const data = await oandaRes.value.json();
      if (data.prices) {
        data.prices.forEach((p: any) => {
          const symbol = p.instrument.replace('_', ''); 
          const bid = parseFloat(p.bids[0].price);
          const ask = parseFloat(p.asks[0].price);
          prices[symbol] = { price: (bid + ask) / 2, bid, ask };
        });
      }
    }

    const batch = db.batch();
    Object.entries(prices).forEach(([symbol, data]) => {
      const ref = db.collection("livePrices").doc(symbol);
      batch.set(ref, {
        pair: symbol,
        ...data,
        updatedAt: Timestamp.now(),
      }, { merge: true });
    });

    await batch.commit();
    return NextResponse.json({ ok: true, synced: Object.keys(prices) });
  } catch (error: any) {
    console.error('[Price-Feed] Fatal Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 200 }); // Avoid 502
  } finally {
    clearTimeout(timeoutId);
  }
}
