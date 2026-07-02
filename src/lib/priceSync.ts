import { getAdminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { auditDemoAccount } from '@/lib/rulesEngine';

/**
 * @fileOverview Institutional Price Synchronizer & Risk Auditor
 * Manages real-time market data ingestion and enforces account compliance.
 */

export async function syncPricesAndAudit() {
  const db = getAdminDb();
  const prices: Record<string, any> = {};

  // 1. Define Institutional Instruments
  const instruments = 'XAU_USD,XAG_USD,XPT_USD,EUR_USD,GBP_USD,USD_JPY,USD_CHF,AUD_USD,USD_CAD,NZD_USD';
  const cryptoSymbols = '["BTCUSDT","ETHUSDT","SOLUSDT","XRPUSDT","BNBUSDT","DOGEUSDT","ADAUSDT"]';

  try {
    // 2. Parallel Liquidity Fetch
    const [cryptoRes, oandaRes] = await Promise.allSettled([
      fetch(`https://api.binance.com/api/v3/ticker/price?symbols=${encodeURIComponent(cryptoSymbols)}`, { cache: 'no-store' }),
      (process.env.OANDA_ACCOUNT_ID && process.env.OANDA_API_KEY)
        ? fetch(`https://api-fxpractice.oanda.com/v3/accounts/${process.env.OANDA_ACCOUNT_ID}/pricing?instruments=${instruments}`, {
            headers: { 'Authorization': `Bearer ${process.env.OANDA_API_KEY}` },
            cache: 'no-store'
          })
        : Promise.reject('OANDA credentials missing')
    ]);

    // Process Binance (Crypto)
    if (cryptoRes.status === 'fulfilled' && cryptoRes.value.ok) {
      const data = await cryptoRes.value.json();
      data.forEach((item: any) => {
        const symbol = item.symbol.replace('USDT', 'USD');
        const price = parseFloat(item.price);
        if (isNaN(price)) return;

        // Institutional spread simulation (0.025%)
        const spread = price * 0.00025;
        const dec =
          (symbol === 'BTCUSD' || symbol === 'ETHUSD') ? 2 :
          (symbol === 'BNBUSD' || symbol === 'SOLUSD') ? 2 :
          (symbol === 'XRPUSD' || symbol === 'ADAUSD') ? 4 :
          (symbol === 'DOGEUSD') ? 5 : 2;

        prices[symbol] = {
          price: +price.toFixed(dec),
          bid: +(price - spread).toFixed(dec),
          ask: +(price + spread).toFixed(dec)
        };
      });
    }

    // Process OANDA (Forex + Metals)
    if (oandaRes.status === 'fulfilled' && oandaRes.value.ok) {
      const data = await oandaRes.value.json();
      data.prices?.forEach((p: any) => {
        const symbol = p.instrument.replace('_', '');
        const bid = parseFloat(p.bids[0].price);
        const ask = parseFloat(p.asks[0].price);
        if (isNaN(bid) || isNaN(ask)) return;

        prices[symbol] = {
          price: +((bid + ask) / 2).toFixed(5),
          bid: +bid.toFixed(5),
          ask: +ask.toFixed(5)
        };
      });
    }

    // 3. Persist Liquidty to Firestore
    if (Object.keys(prices).length > 0) {
      const batch = db.batch();
      Object.entries(prices).forEach(([symbol, data]) => {
        batch.set(db.collection('livePrices').doc(symbol.toUpperCase()), {
          ...data,
          pair: symbol,
          updatedAt: Timestamp.now()
        }, { merge: true });
      });
      await batch.commit();
    }

    // 4. Trigger Risk Engine Audit for All Active Nodes
    const activeAccounts = await db.collection('demoAccounts')
      .where('status', '==', 'active')
      .get();

    for (const doc of activeAccounts.docs) {
      // Each audit is non-blocking to prevent cron timeout
      auditDemoAccount(doc.id).catch(err => {
        console.error(`[PriceSync] Audit failed for Node ${doc.id}:`, err.message);
      });
    }

    return { 
      success: true, 
      updated: Object.keys(prices).length, 
      audited: activeAccounts.size 
    };

  } catch (error: any) {
    console.error('[PriceSync] Fatal Synchronization Fault:', error.message);
    throw error;
  }
}
