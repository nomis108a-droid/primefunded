import { getAdminDb } from '@/lib/firebase-admin';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { auditActiveOpenPositions, auditDemoAccount } from '@/lib/rulesEngine';

/**
 * @fileOverview Institutional Risk Auditor & Execution Engine
 * Monitors nodes with active exposure and processes automated exit orders (TP/SL).
 */

const CONTRACT_SIZE: Record<string, number> = {
  XAUUSD: 100, XAGUSD: 5000, XPTUSD: 50,
  EURUSD: 100000, GBPUSD: 100000, USDJPY: 100000,
  AUDUSD: 100000, USDCHF: 100000, USDCAD: 100000, NZDUSD: 100000,
  BTCUSD: 1, ETHUSD: 1, SOLUSD: 1, XRPUSD: 1000,
  BNBUSD: 1, DOGEUSD: 1000, ADAUSD: 1000
};

/**
 * Monitors and executes Take Profit and Stop Loss orders.
 */
async function checkTpSlHits(db: any) {
  const openTradesSnap = await db.collection('demoTrades').where('status', '==', 'open').get();
  if (openTradesSnap.empty) return { closed: 0 };

  const pricesSnap = await db.collection('livePrices').get();
  const prices: Record<string, any> = {};
  pricesSnap.docs.forEach((d: any) => prices[d.id.toUpperCase()] = d.data());

  let closedCount = 0;
  
  // Group hits by account to prevent transaction contention
  const hitsByAccount: Record<string, any[]> = {};
  
  openTradesSnap.docs.forEach(doc => {
    const t = { id: doc.id, ref: doc.ref, ...doc.data() };
    const symbol = t.symbol.toUpperCase();
    const priceData = prices[symbol];
    if (!priceData) return;

    let hit: 'tp' | 'sl' | null = null;
    let exitPrice = 0;
    const bid = priceData.bid || priceData.price;
    const ask = priceData.ask || priceData.price;

    // BUY: Profit on Bid >= TP, Loss on Bid <= SL
    if (t.type === 'buy') {
      if (t.tp && bid >= t.tp) { hit = 'tp'; exitPrice = t.tp; }
      else if (t.sl && bid <= t.sl) { hit = 'sl'; exitPrice = t.sl; }
    } 
    // SELL: Profit on Ask <= TP, Loss on Ask >= SL
    else if (t.type === 'sell') {
      if (t.tp && ask <= t.tp) { hit = 'tp'; exitPrice = t.tp; }
      else if (t.sl && ask >= t.sl) { hit = 'sl'; exitPrice = t.sl; }
    }

    if (hit) {
      const contractSize = CONTRACT_SIZE[symbol] || 100000;
      const priceDiff = t.type === 'buy' ? (exitPrice - t.openPrice) : (t.openPrice - exitPrice);
      const pnl = priceDiff * t.lots * contractSize;
      const roundedPnl = Math.round(pnl * 100) / 100;
      
      if (!hitsByAccount[t.accountId]) hitsByAccount[t.accountId] = [];
      hitsByAccount[t.accountId].push({ ...t, hit, exitPrice, pnl: roundedPnl });
    }
  });

  const accountIds = Object.keys(hitsByAccount);
  if (accountIds.length === 0) return { closed: 0 };

  // Process all hits atomically per account
  await Promise.all(accountIds.map(async (accountId) => {
    const accountTrades = hitsByAccount[accountId];
    let totalPnl = 0;

    try {
      await db.runTransaction(async (tx: any) => {
        const accRef = db.collection('demoAccounts').doc(accountId);
        const accSnap = await tx.get(accRef);
        if (!accSnap.exists) return;

        for (const t of accountTrades) {
          tx.update(t.ref, {
            status: 'closed',
            closedAt: FieldValue.serverTimestamp(),
            closePrice: t.exitPrice,
            pnl: t.pnl,
            closeReason: t.hit === 'tp' ? 'take_profit' : 'stop_loss',
          });
          totalPnl += t.pnl;
          closedCount++;
        }

        tx.update(accRef, {
          balance: FieldValue.increment(totalPnl),
          equity: FieldValue.increment(totalPnl), // Initial bump, subsequent audit will refine
          updatedAt: FieldValue.serverTimestamp()
        });
      });

      // Immediate audit for passing/breach detection
      await auditDemoAccount(accountId);
    } catch (err) {
      console.error(`[ExecutionEngine] TP/SL transaction failed for Node ${accountId}:`, err);
    }
  }));

  return { closed: closedCount };
}

export async function syncPricesAndAudit() {
  const db = getAdminDb();

  // Concurrency Lock: Prevents overlapping cycles in multi-instance environments
  try {
    const lockRef = db.collection('_system').doc('priceSyncLock');
    const lockSnap = await lockRef.get();
    
    if (lockSnap.exists) {
      const data = lockSnap.data();
      if (data?.lockedAt) {
        const lockedAt = (data.lockedAt as Timestamp).toDate();
        const diff = Date.now() - lockedAt.getTime();
        if (diff < 2000) {
          return { success: true, skipped: true };
        }
      }
    }

    await lockRef.set({
      lockedAt: Timestamp.now(),
      instanceId: process.env.K_REVISION || 'unknown'
    });
  } catch (err: any) {
    console.warn('[RiskAudit] Lock acquisition failed, proceeding with caution.');
  }

  try {
    // 1. Process automated exits (TP/SL)
    const tpSlResult = await checkTpSlHits(db);

    // 2. Process risk audits for remaining open exposure
    const result = await auditActiveOpenPositions();
    
    if (tpSlResult.closed > 0) {
      console.log(`[PriceSync] Execution cycle: ${tpSlResult.closed} orders filled.`);
    }

    return { 
      success: true, 
      tpSl: tpSlResult,
      ...result
    };

  } catch (error: any) {
    console.error('[RiskAudit] Fatal Audit Cycle Fault:', error.message);
    throw error;
  }
}
