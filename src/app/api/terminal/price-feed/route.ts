
import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

/**
 * @fileOverview Institutional Price Synchronizer (OANDA + Binance)
 * Updates Firestore livePrices for SL/TP and Risk Engine audits.
 * Triggered via Cron.
 */

export async function GET(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");
  if (!process.env.TERMINAL_CRON_KEY || apiKey !== process.env.TERMINAL_CRON_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const oandaKey = process.env.OANDA_API_KEY;
  const oandaAccount = process.env.OANDA_ACCOUNT_ID;

  console.log(`[Price-Feed] Running cron update. OANDA Config: Key=${!!oandaKey}, Account=${!!oandaAccount}`);

  try {
    const db = getAdminDb();
    
    // 1. DUAL SOURCE FETCH:
    // Binance handles Crypto (Free/Keyless)
    // OANDA handles Forex & Metals (Requires OANDA_API_KEY)
    const [cryptoRes, oandaRes] = await Promise.allSettled([
      fetch('https://api.binance.com/api/v3/ticker/price?symbols=["BTCUSDT","ETHUSDT","XRPUSDT","SOLUSDT"]'),
      oandaKey && oandaAccount 
        ? fetch(`https://api-fxpractice.oanda.com/v3/accounts/${oandaAccount}/pricing?instruments=XAU_USD,EUR_USD,GBP_USD,USD_JPY,AUD_USD,USD_CHF`, {
            headers: { 'Authorization': `Bearer ${oandaKey}` }
          })
        : Promise.reject('OANDA Config Missing')
    ]);

    const batch = db.batch();
    const prices: Record<string, any> = {};

    // 2. Sync Crypto (Binance)
    if (cryptoRes.status === 'fulfilled' && cryptoRes.value.ok) {
      const data = await cryptoRes.value.json();
      data.forEach((item: any) => {
        const symbol = item.symbol.replace('USDT', 'USD');
        const price = parseFloat(item.price);
        const spread = price * 0.0005; // 0.05% Institutional Spread
        prices[symbol] = { price, bid: price - spread, ask: price + spread };
      });
    }

    // 3. Sync Forex/Metals (OANDA)
    if (oandaRes.status === 'fulfilled' && oandaRes.value.ok) {
      const data = await oandaRes.value.json();
      if (data.prices) {
        data.prices.forEach((p: any) => {
          const symbol = p.instrument.replace('_', ''); // XAU_USD -> XAUUSD
          const bid = parseFloat(p.bids[0].price);
          const ask = parseFloat(p.asks[0].price);
          prices[symbol] = { price: (bid + ask) / 2, bid, ask };
        });
      }
    } else {
      const reason = oandaRes.status === 'rejected' ? oandaRes.reason : `HTTP ${oandaRes.value.status}`;
      console.warn(`[OANDA-DEBUG] Sync skipped or failed: ${reason}`);
    }

    // 4. Atomic Commit to Firestore
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
    console.error('[Price-Feed] Fatal Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
