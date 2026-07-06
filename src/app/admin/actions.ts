
'use server';

import { cookies } from 'next/headers';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { ADMIN_EMAILS } from '@/lib/admin';
import { RULES_CONFIG, getPlanKey } from '@/lib/rulesConfig';
import { sendBreachEmail } from '@/lib/email';

/**
 * INSTITUTIONAL HELPER: Serialization
 * Converts non-serializable objects (like Timestamps) to strings for client consumption.
 */
function serializeData(data: any): any {
  if (data === null || data === undefined) return data;
  
  // Handle Firestore Timestamps
  if (typeof data.toDate === 'function') {
    try {
      return data.toDate().toISOString();
    } catch (e) {
      return String(data);
    }
  }
  
  if (data instanceof Date) return data.toISOString();
  
  if (Array.isArray(data)) return data.map(serializeData);
  
  if (typeof data === 'object') {
    // Prevent crashes on complex Node/Firebase objects
    if (data.constructor && data.constructor.name !== 'Object' && data.constructor.name !== 'Array') {
      return String(data);
    }
    
    const result: any = {};
    for (const key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        result[key] = serializeData(data[key]);
      }
    }
    return result;
  }
  
  return data;
}

/**
 * SECURITY HELPER: Multi-layered Admin Verification
 */
export async function verifyAdminAuth() {
  try {
    const cookieStore = await cookies();
    const masterToken = cookieStore.get('admin_master')?.value;
    if (masterToken === '93463962569392846256') return true;
    
    const sessionToken = cookieStore.get('session')?.value;
    if (sessionToken) {
      try {
        const decoded = await getAdminAuth().verifySessionCookie(sessionToken, true);
        if (decoded.email && ADMIN_EMAILS.includes(decoded.email)) return true;
      } catch {}
    }

    const adminEmail = cookieStore.get('admin_email')?.value;
    if (adminEmail && ADMIN_EMAILS.includes(adminEmail)) return true;
    
    return false;
  } catch (error) {
    return false;
  }
}

export async function giftAccountAction(traderId: string, email: string, accountLabel: string, startBalance: number, accountPlan: string, currentPhase: string) {
  try {
    if (!await verifyAdminAuth()) return { success: false, error: "Unauthorized" };
    const db = getAdminDb();
    
    const userLookupSnap = await db.collection('users').where('traderId', '==', traderId).limit(1).get();
    if (userLookupSnap.empty) {
      return { success: false, error: "No trader found with that Trader ID" };
    }
    
    const userDoc = userLookupSnap.docs[0];
    const userId = userDoc.id;
    const targetEmail = email || userDoc.data()?.email || 'unknown@primefunded.fund';

    const planKey = getPlanKey(accountPlan);
    const rules = RULES_CONFIG.plans[planKey]?.[currentPhase] || RULES_CONFIG.plans['1-step-pro']['evaluation'];
    
    const profitTarget = startBalance * (rules.profitTarget || 10) / 100;
    const dailyLossLimitUsd = startBalance * (rules.dailyDrawdown / 100);
    const maxLossLimitUsd = startBalance * (rules.maxDrawdown / 100);

    const docRef = await db.collection("demoAccounts").add({
      userId,
      email: targetEmail,
      label: accountLabel,
      startBalance,
      balance: startBalance,
      equity: startBalance,
      plan: `${startBalance / 1000}k`,
      planType: planKey,
      phase: currentPhase,
      profitTarget,
      dailyLossLimitUsd,
      dailyGrossLossUsd: 0,
      maxLoss: maxLossLimitUsd,
      status: 'active',
      breachReason: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      lastResetAt: FieldValue.serverTimestamp(),
      source: 'provisioned'
    });

    await db.collection('orders').add({
      userId,
      email: targetEmail,
      plan: planKey,
      accountSize: accountLabel,
      amount: "FREE",
      amountPaid: 0,
      displayAmount: 'FREE (Admin Gift)',
      txHash: "ADMIN-GIFT",
      paymentScreenshot: null,
      status: "approved",
      isCouponOrder: true,
      source: "gifted",
      submittedAt: FieldValue.serverTimestamp(),
      approvedAt: FieldValue.serverTimestamp(),
      approvedBy: "admin",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });

    await db.collection('users').doc(userId).collection('notifications').add({
      title: '🚀 Challenge Active',
      message: `Your ${accountLabel} has been provisioned and is ready for trading.`,
      type: 'account_gifted',
      isRead: false,
      createdAt: FieldValue.serverTimestamp()
    });

    return { success: true, accountId: docRef.id };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function updateOrderStatusAction(id: string, status: string, reason?: string) {
  try {
    if (!await verifyAdminAuth()) return { success: false, error: "Unauthorized" };
    const db = getAdminDb();
    const orderRef = db.collection('orders').doc(id);
    const orderSnap = await orderRef.get();
    
    if (!orderSnap.exists) throw new Error("Order not found");
    const order = orderSnap.data()!;

    const updates: any = { status, updatedAt: FieldValue.serverTimestamp() };
    if (reason) updates.rejectionReason = reason;
    await orderRef.update(updates);

    if (status === 'approved') {
      const balance = parseInt(order.accountSize.replace(/[^0-9]/g, '')) || 100000;
      const userSnap = await db.collection('users').doc(order.userId).get();
      const traderId = userSnap.data()?.traderId;

      if (traderId) {
        await giftAccountAction(
          traderId,
          order.email || 'unknown@primefunded.fund',
          `Phase 1 — ${order.accountSize} ${order.plan}`,
          balance,
          order.plan,
          'evaluation'
        );
      }
    } else if (status === 'rejected') {
      await db.collection('users').doc(order.userId).collection('notifications').add({
        title: '❌ Order Rejected',
        message: `Your payment order for ${order.accountSize} was rejected. Reason: ${reason || "Transaction verification failed."}. You can try again to resubmit your payment.`,
        type: 'order_rejected',
        isRead: false,
        createdAt: FieldValue.serverTimestamp()
      });
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function processKycAction(id: string, status: string, reason?: string) {
  try {
    if (!await verifyAdminAuth()) return { success: false, error: "Unauthorized" };
    const db = getAdminDb();
    const updates: any = { 
      kycStatus: status, 
      kycVerified: status === 'verified', 
      updatedAt: FieldValue.serverTimestamp() 
    };
    if (reason) updates.kycRejectionReason = reason;
    
    await db.collection('users').doc(id).update(updates);

    await db.collection('users').doc(id).collection('notifications').add({
      title: status === 'verified' ? '✅ KYC Approved' : '❌ KYC Rejected',
      message: status === 'verified' 
        ? "Identity verification complete. Payouts are now active." 
        : `KYC was rejected. ${reason || "Please provide clearer documents."}. You can resubmit your documents for review.`,
      type: 'kyc_update',
      isRead: false,
      createdAt: FieldValue.serverTimestamp()
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function fetchUserDetailAction(userId: string) {
  if (!await verifyAdminAuth()) return { success: false, error: "Unauthorized" };
  if (!userId) return { success: false, error: "Missing Trader UID" };

  try {
    const db = getAdminDb();
    
    // 1. User Profile (Required)
    const userSnap = await db.collection('users').doc(userId).get();
    if (!userSnap.exists) return { success: false, error: "User profile document not found" };

    // 2. Resilient individual fetches for sub-collections to avoid Promise.all strict rejection
    const fetchCol = async (col: string, field: string, val: string) => {
      try {
        const snap = await db.collection(col).where(field, '==', val).get();
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch (e) {
        console.warn(`[Admin-Action] Inspection fetch failed for ${col}:`, e);
        return [];
      }
    };

    const [accounts, referrals, payoutsRaw, tradesRaw] = await Promise.all([
      fetchCol('demoAccounts', 'userId', userId),
      fetchCol('referrals', 'referrerId', userId),
      fetchCol('payouts', 'userId', userId),
      fetchCol('demoTrades', 'userId', userId)
    ]);

    // Apply sorting in memory to ensure reliable display without requiring strict composite indexes
    const sortedTrades = [...tradesRaw].sort((a: any, b: any) => {
      const tA = a.openedAt?.seconds || new Date(a.openedAt || 0).getTime();
      const tB = b.openedAt?.seconds || new Date(b.openedAt || 0).getTime();
      return tB - tA;
    }).slice(0, 150);

    const sortedPayouts = [...payoutsRaw].sort((a: any, b: any) => {
      const tA = a.createdAt?.seconds || new Date(a.createdAt || 0).getTime();
      const tB = b.createdAt?.seconds || new Date(b.createdAt || 0).getTime();
      return tB - tA;
    });

    const data = {
      user: { id: userSnap.id, ...userSnap.data() },
      accounts,
      trades: sortedTrades,
      referrals,
      payouts: sortedPayouts
    };

    return { success: true, ...serializeData(data) };
  } catch (err: any) {
    console.error("[Admin-Action] fetchUserDetailAction Fatal Failure:", err);
    return { success: false, error: "Institutional sync fault: " + err.message };
  }
}

export async function resetDemoAccountAction(accountId: string) {
  try {
    if (!await verifyAdminAuth()) return { success: false, error: "Unauthorized" };
    const db = getAdminDb();
    const accountRef = db.collection('demoAccounts').doc(accountId);
    const accountSnap = await accountRef.get();
    if (!accountSnap.exists) throw new Error("Account not found");
    const data = accountSnap.data()!;
    await accountRef.update({
      balance: data.startBalance || 100000,
      equity: data.startBalance || 100000,
      status: 'active',
      breachReason: null,
      updatedAt: FieldValue.serverTimestamp()
    });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function manualBreachAccountAction(accountId: string, reason: string) {
  if (!await verifyAdminAuth()) return { success: false, error: "Unauthorized" };
  try {
    const db = getAdminDb();
    const accRef = db.collection('demoAccounts').doc(accountId);
    const accSnap = await accRef.get();
    if (!accSnap.exists) throw new Error("Account not found");
    const accData = accSnap.data()!;
    const userId = accData.userId;

    const userRef = db.collection('users').doc(userId);
    const userSnap = await userRef.get();
    const userEmail = userSnap.data()?.email || accData.email || null;

    const openTradesSnap = await db.collection('demoTrades')
      .where('accountId', '==', accountId)
      .where('status', '==', 'open')
      .get();

    const batch = db.batch();

    batch.update(accRef, {
      status: 'blown',
      breachReason: `Admin manual breach: ${reason}`,
      blownAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });

    openTradesSnap.docs.forEach(doc => {
      const t = doc.data();
      batch.update(doc.ref, {
        status: 'closed',
        closedAt: FieldValue.serverTimestamp(),
        closeReason: 'admin_manual_breach',
        closePrice: t.openPrice,
        pnl: 0
      });
    });

    batch.update(userRef, { accountStatus: 'breached', updatedAt: FieldValue.serverTimestamp() });

    const breachRef = db.collection('breaches').doc();
    batch.set(breachRef, {
      accountId,
      userId,
      email: userEmail,
      reason: `Admin manual breach: ${reason}`,
      type: 'manual',
      breachedAt: FieldValue.serverTimestamp(),
      planType: accData.planType || '1-step-pro',
      phase: accData.phase || 'evaluation'
    });

    const notifRef = userRef.collection('notifications').doc();
    batch.set(notifRef, {
      title: '❌ Account Breached (Admin)',
      message: `Your account was manually terminated by administration. Reason: ${reason}`,
      type: 'account_breached',
      isRead: false,
      createdAt: FieldValue.serverTimestamp()
    });

    await batch.commit();

    if (userEmail) {
      await sendBreachEmail(userEmail, `Your account ${accData.label || accountId} has been manually breached by administration. Reason: ${reason}`);
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function sendGlobalBroadcastAction(data: { title: string, message: string, type: string }) {
  try {
    if (!await verifyAdminAuth()) return { success: false, error: "Unauthorized" };
    const db = getAdminDb();
    await db.collection('broadcasts').add({ ...data, sentAt: FieldValue.serverTimestamp(), sentBy: 'admin' });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function cleanupDemoAccountsAction() {
  try {
    if (!await verifyAdminAuth()) return { success: false, error: "Unauthorized" };
    const db = getAdminDb();
    const snap = await db.collection('demoAccounts').get();
    const batch = db.batch();
    snap.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    return { success: true, count: snap.size };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * INSTITUTIONAL AUDIT: Performs FULL STARTING STATE RESET for Friday rule breaches
 */
export async function auditAndResetFridayBreachesAction(dryRun: boolean = true) {
  if (!await verifyAdminAuth()) return { success: false, error: "Unauthorized" };
  try {
    const db = getAdminDb();
    const blownSnap = await db.collection('demoAccounts')
      .where('status', '==', 'blown')
      .get();
    
    const affected: any[] = [];

    for (const doc of blownSnap.docs) {
      const data = doc.data();
      const reason = (data.breachReason || "").toLowerCase();
      
      // Target only Friday holding violations
      if (reason.includes("friday overnight")) {
        affected.push({
          id: doc.id,
          email: data.email || 'unknown',
          userId: data.userId,
          startBalance: data.startBalance || 100000,
          breachedAt: data.blownAt ? data.blownAt.toDate().toISOString() : 'unknown'
        });

        if (!dryRun) {
          const startBalance = parseFloat(String(data.startBalance || 100000));
          const batch = db.batch();

          // 1. Reset Account Node to factory state
          batch.update(doc.ref, {
            status: 'active',
            balance: startBalance,
            equity: startBalance,
            breachReason: null,
            blownAt: null,
            dailyGrossLossUsd: 0,
            updatedAt: FieldValue.serverTimestamp(),
            lastResetAt: FieldValue.serverTimestamp()
          });

          // 2. CLEAR ALL HISTORY: Institutional Reset requirement
          const tradesSnap = await db.collection('demoTrades').where('accountId', '==', doc.id).get();
          tradesSnap.docs.forEach(t => batch.delete(t.ref));

          // 3. Update parent user accountStatus
          batch.update(db.collection('users').doc(data.userId), {
            accountStatus: 'active',
            updatedAt: FieldValue.serverTimestamp()
          });

          // 4. Record the restoration in a historical audit log
          batch.set(db.collection('system_logs').doc(), {
            type: 'friday_rule_reset',
            accountId: doc.id,
            userId: data.userId,
            originalBreachReason: data.breachReason,
            timestamp: FieldValue.serverTimestamp(),
            action: 'Full Factory Reset (Rule Discontinued)'
          });

          // 5. Send notification to trader
          batch.set(db.collection('users').doc(data.userId).collection('notifications').doc(), {
            title: '⚡ Account Fully Restored',
            message: `Your account ${data.label || doc.id} has been reset to its starting state of $${startBalance.toLocaleString()} due to the removal of the Friday overnight rule. You can now resume trading.`,
            type: 'account_restored',
            isRead: false,
            createdAt: FieldValue.serverTimestamp()
          });

          await batch.commit();
        }
      }
    }

    return { success: true, affected: serializeData(affected), dryRun };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
