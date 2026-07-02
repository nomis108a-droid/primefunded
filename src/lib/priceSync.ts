import { getAdminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { auditDemoAccount } from '@/lib/rulesEngine';

/**
 * @fileOverview Institutional Risk Auditor
 * Fix 12: Real-time Floating Equity Audit
 */

export async function syncPricesAndAudit() {
  const db = getAdminDb();

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
    const activeAccounts = await db.collection('demoAccounts')
      .where('status', '==', 'active')
      .get();

    if (activeAccounts.empty) {
      return { success: true, audited: 0 };
    }

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