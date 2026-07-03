import { getAdminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { auditActiveOpenPositions } from '@/lib/rulesEngine';

/**
 * @fileOverview Institutional Risk Auditor
 * Targeted Audit Engine: Monitors only nodes with active exposure.
 */

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
    // TARGETED AUDIT: Only check accounts that actually have open trades (exposure)
    // This is significantly more efficient than scanning all active accounts
    const result = await auditActiveOpenPositions();
    
    console.log('[PriceSync] Audit cycle:', result);

    return { 
      success: true, 
      ...result
    };

  } catch (error: any) {
    console.error('[RiskAudit] Fatal Audit Cycle Fault:', error.message);
    throw error;
  }
}
