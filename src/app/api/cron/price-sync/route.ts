import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { auditDemoAccount } from '@/lib/rulesEngine';

/**
 * @fileOverview Institutional Automated Price Synchronizer & Risk Engine
 * Fetches market data and triggers risk audits for all active accounts.
 */

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const cronKey = req.headers.get("x-cron-key") || req.nextUrl.searchParams.get("key");
  if (cronKey !== "primefunded_cron_2024") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getAdminDb();
  const prices: Record<string, any> = {};

  try {
    // 1. Fetch Prices
    const [cryptoRes, oandaRes] = await Promise.allSettled([
      fetch('https://api.binance.com/api/v3/ticker/price?symbols=["BTCUSDT","ETHUSDT","SOLUSDT","XRPUSDT","BNBUSDT","DOGEUSDT","ADAUSDT"]'),
      fetch('https://api-fxpractice.oanda.com/v3/accounts/' + process.env.OANDA_ACCOUNT_ID + '/pricing?instruments=XAU_USD,XAG_USD,EUR_USD,GBP_USD,USD_JPY,USD_CHF,AUD_USD', {
        headers: { 'Authorization': `Bearer ${process.env.OANDA_API_KEY}` }
      })
    ]);

    if (cryptoRes.status === 'fulfilled' && cryptoRes.value.ok) {
      const data = await cryptoRes.value.json();
      data.forEach((item: any) => {
        const symbol = item.symbol.replace('USDT', 'USD');
        const price = parseFloat(item.price);
        const spread = price * 0.00025;
        prices[symbol] = { price, bid: price - spread, ask: price + spread };
      });
    }

    if (oandaRes.status === 'fulfilled' && oandaRes.value.ok) {
      const data = await oandaRes.value.json();
      data.prices?.forEach((p: any) => {
        const symbol = p.instrument.replace('_', '');
        const bid = parseFloat(p.bids[0].price);
        const ask = parseFloat(p.asks[0].price);
        prices[symbol] = { price: (bid + ask) / 2, bid, ask };
      });
    }

    // 2. Persist Prices
    const batch = db.batch();
    Object.entries(prices).forEach(([symbol, data]) => {
      batch.set(db.collection('livePrices').doc(symbol.toUpperCase()), {
        ...data, pair: symbol, updatedAt: Timestamp.now()
      }, { merge: true });
    });
    await batch.commit();

    // 3. RUN RISK ENGINE FOR ALL ACTIVE ACCOUNTS
    const activeAccounts = await db.collection('demoAccounts').where('status', '==', 'active').get();
    for (const doc of activeAccounts.docs) {
      // Each audit is non-blocking to prevent cron timeout
      auditDemoAccount(doc.id).catch(e => console.error(`Audit failed for ${doc.id}:`, e));
    }

    return NextResponse.json({ success: true, updated: Object.keys(prices).length, audited: activeAccounts.size });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
