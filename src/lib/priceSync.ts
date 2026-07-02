import { getAdminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { auditDemoAccount } from '@/lib/rulesEngine';

/**
 * @fileOverview Institutional Risk Auditor
 * Manages leaderboard locks and enforces account compliance across all active nodes.
 * Liquidity synchronization is now handled by dedicated streaming services.
 */

export async function syncPricesAndAudit() {
  const db = getAdminDb();

  // 0. Leader Election Lock: Prevent concurrent audits across multi-instance environments
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
    console.warn('[RiskAudit] Lock acquisition failed, proceeding with caution:', err.message);
  }

  try {
    // 1. Fetch all active accounts for audit
    const activeAccounts = await db.collection('demoAccounts')
      .where('status', '==', 'active')
      .get();

    if (activeAccounts.empty) {
      return { success: true, audited: 0 };
    }

    // 2. Trigger Risk Engine Audit for All Active Nodes
    // Each audit is non-blocking to maximize throughput in high-volume scenarios
    const auditPromises = activeAccounts.docs.map(doc => 
      auditDemoAccount(doc.id).catch(err => {
        console.error(`[RiskAudit] Audit failed for Node ${doc.id}:`, err.message);
      })
    );

    await Promise.allSettled(auditPromises);

    return { 
      success: true, 
      audited: activeAccounts.size 
    };

  } catch (error: any) {
    console.error('[RiskAudit] Fatal Audit Cycle Fault:', error.message);
    throw error;
  }
}
