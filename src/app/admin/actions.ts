'use server';

import { cookies } from 'next/headers';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { ADMIN_EMAILS } from '@/lib/admin';
import { RULES_CONFIG, getPlanKey } from '@/lib/rulesConfig';

/**
 * SECURITY HELPER: Admin Verification
 * Checks for the master key session cookie established in the terminal.
 */
export async function verifyAdminAuth() {
  try {
    const cookieStore = await cookies();
    const masterToken = cookieStore.get('admin_master')?.value;
    
    // The master key established in Admin Terminal
    if (masterToken === '93463962569392846256') return true;
    
    return false; 
  } catch (error) { return false; }
}

export async function updateGlobalSettingsAction(settings: any) {
  if (!await verifyAdminAuth()) return { success: false, error: "Unauthorized" };
  try {
    const db = getAdminDb();
    if (!db) return { success: false, error: "Database unavailable" };
    await db.collection('settings').doc('payments').set(settings, { merge: true });
    return { success: true };
  } catch (err: any) { return { success: false, error: err.message }; }
}

/**
 * Institutional Account Provisioning (REWRITTEN FROM SCRATCH)
 * Uses Firebase Admin SDK to safely grant free challenges to traders.
 */
export async function giftAccountAction(email: string, accountSize: string, planType: string) {
  // 1. Verify Caller Authority
  if (!await verifyAdminAuth()) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const db = getAdminDb();
    const auth = getAdminAuth();
    if (!db || !auth) return { success: false, error: "Admin services offline." };

    const targetEmail = (email || "").trim().toLowerCase();
    if (!targetEmail) return { success: false, error: "Email is required." };

    // 2. Identify Target User ID
    let userId = "";
    
    // Strategy A: Search Firestore by Email
    const emailSnap = await db.collection('users').where('email', '==', targetEmail).limit(1).get();
    if (!emailSnap.empty) {
      userId = emailSnap.docs[0].id;
    } else {
      // Strategy B: Search Firebase Auth directly
      try {
        const authUser = await auth.getUserByEmail(targetEmail);
        userId = authUser.uid;
      } catch (e) {
        return { success: false, error: "No trader found with this email. Ensure they have signed up." };
      }
    }

    // 3. Resolve Plan Parameters & Risk Rules
    const planKey = getPlanKey(planType);
    const balance = parseInt(accountSize.replace(/[^0-9]/g, '')) || 100000;
    
    // Resolve rules from master config
    const rules = RULES_CONFIG.plans[planKey]?.['evaluation'] || RULES_CONFIG.plans['1-step-pro']['evaluation'];
    
    const profitTarget = balance * (rules.profitTarget || 10) / 100;
    const dailyLossLimitUsd = balance * (rules.dailyDrawdown / 100);
    const maxLossLimitUsd = balance * (rules.maxDrawdown / 100);

    // 4. Provision Challenge Node
    const docRef = await db.collection("demoAccounts").add({
      userId,
      email: targetEmail,
      label: `${planType.toUpperCase()} — $${(balance/1000)}k Challenge`,
      startBalance: balance,
      balance: balance,
      equity: balance,
      plan: `${balance/1000}k`,
      planType: planKey,
      phase: 'evaluation',
      profitTarget,
      dailyLossLimitUsd,
      dailyGrossLossUsd: 0,
      maxLoss: maxLossLimitUsd,
      status: 'active',
      isGifted: true,
      grantedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });

    // 5. Send Real-time Notification
    await db.collection('users').doc(userId).collection('notifications').add({
      title: '🎁 Account Provisioned',
      message: `Your free ${accountSize} ${planType} challenge node is now live in your dashboard.`,
      type: 'account_gifted',
      isRead: false,
      createdAt: FieldValue.serverTimestamp()
    });

    return { success: true, id: docRef.id };
  } catch (err: any) {
    console.error("[Grant-Action] Failure:", err.message);
    return { success: false, error: err.message };
  }
}

export async function approveManualOrderAction(id: string) {
  if (!await verifyAdminAuth()) return { success: false, error: "Unauthorized" };
  try {
    const db = getAdminDb();
    if (!db) throw new Error("Database unavailable");
    const orderRef = db.collection('orders').doc(id);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) throw new Error("Order not found");
    const order = orderSnap.data()!;

    if (order.status === 'completed') return { success: true, alreadyDone: true };

    const userSnap = await db.collection('users').doc(order.userId).get();
    const userData = userSnap.data();
    const traderEmail = order.email || userData?.email;
    
    if (!traderEmail) return { success: false, error: "User email not found." };

    const res = await giftAccountAction(traderEmail, order.accountSize, order.plan);

    if (res.success) {
      await orderRef.update({ 
        status: 'completed', 
        approvedBy: "admin", 
        approvedAt: FieldValue.serverTimestamp(), 
        updatedAt: FieldValue.serverTimestamp() 
      });
      return { success: true };
    }
    throw new Error(res.error);
  } catch (err: any) { return { success: false, error: err.message }; }
}

export async function updateOrderStatusAction(id: string, status: string, reason?: string) {
  try {
    if (!await verifyAdminAuth()) return { success: false, error: "Unauthorized" };
    const db = getAdminDb();
    if (!db) throw new Error("Admin DB unavailable");
    
    const orderRef = db.collection('orders').doc(id);
    const updates: any = { status, updatedAt: FieldValue.serverTimestamp() };
    if (reason) updates.rejectionReason = reason;
    await orderRef.update(updates);
    return { success: true };
  } catch (err: any) { return { success: false, error: err.message }; }
}

export async function resetSingleAccountAction(accountId: string) {
  if (!await verifyAdminAuth()) return { success: false, error: "Unauthorized" };
  try {
    const db = getAdminDb();
    if (!db) throw new Error("Admin DB unavailable");
    
    const accountRef = db.collection('demoAccounts').doc(accountId);
    const accountSnap = await accountRef.get();
    if (!accountSnap.exists) throw new Error("Account not found");
    const data = accountSnap.data()!;

    const batch = db.batch();
    batch.update(accountRef, {
      balance: data.startBalance || 100000,
      equity: data.startBalance || 100000,
      status: 'active',
      breachReason: null,
      dailyGrossLossUsd: 0,
      updatedAt: FieldValue.serverTimestamp()
    });

    const tradesSnap = await db.collection('demoTrades').where('accountId', '==', accountId).get();
    tradesSnap.docs.forEach(tradeDoc => batch.delete(tradeDoc.ref));

    await batch.commit();
    return { success: true };
  } catch (err: any) { return { success: false, error: err.message }; }
}

export async function resetAllHistoryAction() {
  if (!await verifyAdminAuth()) return { success: false, error: "Unauthorized" };
  try {
    const db = getAdminDb();
    if (!db) throw new Error("Admin DB unavailable");
    
    const tradesSnap = await db.collection('demoTrades').get();
    const batch = db.batch();
    tradesSnap.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    return { success: true, count: tradesSnap.size };
  } catch (err: any) { return { success: false, error: err.message }; }
}

/**
 * CHUNKED BROADCAST DELIVERY
 */
export async function sendGlobalBroadcastAction(data: { title: string, message: string, type: string }) {
  try {
    if (!await verifyAdminAuth()) return { success: false, error: "Unauthorized" };
    const db = getAdminDb();
    if (!db) return { success: false, error: "Database unavailable" };
    
    await db.collection('broadcasts').add({ ...data, sentAt: FieldValue.serverTimestamp() });
    
    const usersSnap = await db.collection('users').get();
    const userDocs = usersSnap.docs;
    const CHUNK_SIZE = 450;
    
    for (let i = 0; i < userDocs.length; i += CHUNK_SIZE) {
      const chunk = userDocs.slice(i, i + CHUNK_SIZE);
      const batch = db.batch();
      chunk.forEach(userDoc => {
        const notifRef = userDoc.ref.collection('notifications').doc();
        batch.set(notifRef, {
          title: `📢 ${data.title}`,
          message: data.message,
          type: 'broadcast',
          isRead: false,
          createdAt: FieldValue.serverTimestamp()
        });
      });
      await batch.commit();
    }
    
    return { success: true };
  } catch (err: any) { return { success: false, error: err.message }; }
}

/**
 * Hardened KYC Action
 */
export async function updateKycStatusAction(userId: string, status: string, reason?: string) {
  try {
    if (!await verifyAdminAuth()) return { success: false, error: "Unauthorized" };
    const db = getAdminDb();
    if (!db) throw new Error("Admin services unavailable");

    const updates: any = { 
      kycStatus: status, 
      kycVerified: status === 'verified', 
      updatedAt: FieldValue.serverTimestamp() 
    };
    if (reason) updates.kycRejectionReason = reason;
    else if (status === 'verified') updates.kycRejectionReason = null;
    
    await db.collection('users').doc(userId).update(updates);
    
    // Set Custom Claims for Verified Users via Admin SDK
    if (status === 'verified') {
      const auth = getAdminAuth();
      if (auth) {
        await auth.setCustomUserClaims(userId, { kycVerified: true });
      }
    }
    
    await db.collection('users').doc(userId).collection('notifications').add({
      title: status === 'verified' ? '✅ KYC Verified' : '❌ KYC Rejected',
      message: status === 'verified' ? 'Your identity verification has been approved.' : `Your KYC was rejected. Reason: ${reason}`,
      type: 'kyc_update',
      isRead: false,
      createdAt: FieldValue.serverTimestamp()
    });
    
    return { success: true };
  } catch (err: any) { 
    return { success: false, error: err.message }; 
  }
}

export async function updatePayoutStatusAction(payoutId: string, status: string) {
  try {
    if (!await verifyAdminAuth()) return { success: false, error: "Unauthorized" };
    const db = getAdminDb();
    if (!db) throw new Error("Admin DB unavailable");
    
    await db.collection('payouts').doc(payoutId).update({ status, updatedAt: FieldValue.serverTimestamp() });
    return { success: true };
  } catch (err: any) { return { success: false, error: err.message }; }
}

export async function cleanupDuplicateOrdersAction() {
  if (!await verifyAdminAuth()) return { success: false, error: "Unauthorized" };
  try {
    const db = getAdminDb();
    if (!db) throw new Error("Admin DB unavailable");
    
    const ordersSnap = await db.collection('orders').where('status', '==', 'waiting').get();
    // Logic for cleanup of expired waiting orders...
    return { success: true };
  } catch (err: any) { return { success: false, error: err.message }; }
}
