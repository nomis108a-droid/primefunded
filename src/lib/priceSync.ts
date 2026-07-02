import { getAdminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { auditDemoAccount } from '@/lib/rulesEngine';

/**
 * @fileOverview Institutional Price Synchronizer & Risk Auditor
 * Manages OANDA market data ingestion and enforces account compliance.
 * Optimized for REST-based FX/Metals synchronization.
 */

export async function syncPricesAndAudit() {
  const db = getAdminDb();

  // 0. Leader Election Lock: Prevent concurrent syncs across multi-instance environments
  try {
    const lockRef = db.collection('_system').doc('priceSyncLock');
    const lockSnap = await lockRef.get();
    
    if (lockSnap.exists) {
      const data = lockSnap.data();
      if (data?.lockedAt) {
        const lockedAt = (data.lockedAt as Timestamp).toDate();
        const diff = Date.now() - lockedAt.getTime();
        // If the lock was acquired less than 5 seconds ago, skip execution
        if (diff < 5000) {
          return { success: true, skipped: true, reason: 'Another instance holds the lock' };
        }
      }
    }

    // Acquire or Renew Lock
    await lockRef.set({
      lockedAt: Timestamp.now(),
      instanceId: process.env.K_REVISION || 'unknown'
    });
  } catch (err: any) {
    console.warn('[PriceSync] Lock acquisition failed, proceeding with caution:', err.message);
  }

  const prices: Record<string, any> = {};

  // 1. Define Institutional FX/Metal Instruments
  const instruments = 'XAU_USD,XAG_USD,XPT_USD,EUR_USD,GBP_USD,USD_JPY,USD_CHF,AUD_USD,USD_CAD,NZD_USD';

  try {
    // 2. OANDA REST Fetch (Forex + Metals)
    if (process.env.OANDA_ACCOUNT_ID && process.env.OANDA_API_KEY) {
      const res = await fetch(`https://api-fxpractice.oanda.com/v3/accounts/${process.env.OANDA_ACCOUNT_ID}/pricing?instruments=${instruments}`, {
        headers: { 'Authorization': `Bearer ${process.env.OANDA_API_KEY}` },
        cache: 'no-store'
      });

      if (res.ok) {
        const data = await res.json();
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
    }

    // 3. Persist OANDA Liquidity to Firestore
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
