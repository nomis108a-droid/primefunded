'use server';

import { cookies } from 'next/headers';
import { getAdminAuth, getAdminDb, getAdminServices } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { ADMIN_EMAILS } from '@/lib/admin';
import { RULES_CONFIG, getPlanKey } from '@/lib/rulesConfig';

/**
 * Institutional Admin Session Verification
 * Validates the Firebase ID Token and checks for admin privileges.
 */
async function verifyAdminSession(idToken: string) {
  if (!idToken) {
    console.error("[Admin-Auth] FAILED: No ID token provided.");
    throw new Error("Authentication failed: No identity token provided.");
  }
  
  const services = getAdminServices();
  
  try {
    const decoded = await services.auth.verifyIdToken(idToken);
    const email = decoded.email?.toLowerCase();
    
    if (!email) {
      throw new Error("Authentication failed: Email missing from token.");
    }

    const adminList = ADMIN_EMAILS.map(e => e.toLowerCase());

    if (!adminList.includes(email)) {
      console.warn(`[Admin-Auth] UNAUTHORIZED: Access attempt by: ${email}`);
      throw new Error("Administrator permission required.");
    }
    
    return decoded;
  } catch (err: any) {
    console.error("[Admin-Auth] Token verification failed:", err.message);
    throw new Error(`Session error: ${err.message}`);
  }
}

/**
 * SECURITY HELPER: Admin Verification (Legacy Cookie)
 */
export async function verifyAdminAuth() {
  try {
    const cookieStore = await cookies();
    const masterToken = (await cookieStore).get('admin_master')?.value;
    if (masterToken === '93463962569392846256') return true;
    return false; 
  } catch (error) { return false; }
}

export async function updateGlobalSettingsAction(settings: any) {
  if (!await verifyAdminAuth()) return { success: false, error: "Unauthorized" };
  try {
    const db = getAdminDb();
    await db.collection('settings').doc('payments').set(settings, { merge: true });
    return { success: true };
  } catch (err: any) { return { success: false, error: err.message }; }
}

/**
 * Institutional Account Provisioning
 */
export async function giftAccountAction(email: string, accountSize: string, planType: string) {
  if (!await verifyAdminAuth()) return { success: false, error: "Unauthorized" };

  try {
    const services = getAdminServices();
    const db = services.db;
    const auth = services.auth;

    const targetEmail = (email || "").trim().toLowerCase();
    if (!targetEmail) return { success: false, error: "Email is required." };

    let userId = "";
    try {
      const authUser = await auth.getUserByEmail(targetEmail);
      userId = authUser.uid;
    } catch (e) {
      const emailSnap = await db.collection('users').where('email', '==', targetEmail).limit(1).get();
      if (!emailSnap.empty) {
        userId = emailSnap.docs[0].id;
      } else {
        return { success: false, error: "No trader found with this email." };
      }
    }

    const planKey = getPlanKey(planType);
    const balance = parseInt(accountSize.replace(/[^0-9]/g, '')) || 100000;
    const rules = RULES_CONFIG.plans[planKey]?.['evaluation'] || RULES_CONFIG.plans['1-step-pro']['evaluation'];
    
    const profitTarget = balance * (rules.profitTarget || 10) / 100;
    const dailyLossLimitUsd = balance * (rules.dailyDrawdown / 100);
    const maxLossLimitUsd = balance * (rules.maxDrawdown / 100);

    const batch = db.batch();
    const userRef = db.collection('users').doc(userId);

    batch.set(userRef, {
      accountSize,
      planType: planKey,
      accountStatus: 'active',
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });

    const demoAccRef = db.collection("demoAccounts").doc();
    batch.set(demoAccRef, {
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
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });

    await batch.commit();
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function approveManualOrderAction(id: string) {
  if (!await verifyAdminAuth()) return { success: false, error: "Unauthorized" };
  try {
    const db = getAdminDb();
    const orderRef = db.collection('orders').doc(id);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) throw new Error("Order not found");
    const order = orderSnap.data()!;

    if (order.status === 'completed') return { success: true };

    const res = await giftAccountAction(order.email, order.accountSize, order.plan);
    if (res.success) {
      await orderRef.update({ 
        status: 'completed', 
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
    const updates: any = { status, updatedAt: FieldValue.serverTimestamp() };
    if (reason) updates.rejectionReason = reason;
    await db.collection('orders').doc(id).update(updates);
    return { success: true };
  } catch (err: any) { return { success: false, error: err.message }; }
}

export async function resetSingleAccountAction(accountId: string) {
  if (!await verifyAdminAuth()) return { success: false, error: "Unauthorized" };
  try {
    const db = getAdminDb();
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
    const tradesSnap = await db.collection('demoTrades').get();
    const batch = db.batch();
    tradesSnap.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    return { success: true, count: tradesSnap.size };
  } catch (err: any) { return { success: false, error: err.message }; }
}

export async function sendGlobalBroadcastAction(data: { title: string, message: string, type: string }) {
  try {
    if (!await verifyAdminAuth()) return { success: false, error: "Unauthorized" };
    const db = getAdminDb();
    await db.collection('broadcasts').add({ ...data, sentAt: FieldValue.serverTimestamp() });
    return { success: true };
  } catch (err: any) { return { success: false, error: err.message }; }
}

/**
 * Institutional KYC Action
 * Updates trader status and provides forensic audit logging.
 */
export async function updateKycStatusAction(idToken: string, userId: string, status: string, reason?: string) {
  const opId = `KYC-${Math.random().toString(36).substring(7).toUpperCase()}`;
  console.log(`[${opId}] Operation started: ${status} for user ${userId}`);

  try {
    // 1. Verify Administrative Credentials
    const adminUser = await verifyAdminSession(idToken);
    const adminEmail = adminUser.email!;
    const adminUid = adminUser.uid;
    console.log(`[${opId}] Admin verified: ${adminEmail}`);
    
    // 2. Initialize Database Context
    const services = getAdminServices();
    const db = services.db;
    
    // 3. Document Integrity Check
    // Collection mapping: Users exist in the 'users' collection per backend.json
    const userRef = db.collection('users').doc(userId);
    const userSnap = await userRef.get();
    
    if (!userSnap.exists) {
      console.error(`[${opId}] FAILED: Document users/${userId} not found.`);
      return { success: false, error: "KYC document not found" };
    }

    const userData = userSnap.data()!;
    const prevStatus = userData.kycStatus || 'none';
    console.log(`[${opId}] Current status: ${prevStatus}`);

    // 4. Schema Mapping (uses 'verified' for approved state per project blueprint)
    const isApproving = status === 'approved' || status === 'verified';
    const finalStatus = isApproving ? 'verified' : 'rejected';
    
    const updates: any = { 
      kycStatus: finalStatus, 
      kycVerified: isApproving, 
      updatedAt: FieldValue.serverTimestamp(),
      kycReviewedAt: FieldValue.serverTimestamp(),
      kycReviewedBy: adminUid,
      // Store descriptive fields for audit
      approvedAt: isApproving ? FieldValue.serverTimestamp() : (userData.approvedAt || null),
      approvedBy: isApproving ? adminEmail : (userData.approvedBy || null),
      rejectedAt: !isApproving ? FieldValue.serverTimestamp() : (userData.rejectedAt || null),
      rejectedBy: !isApproving ? adminEmail : (userData.rejectedBy || null),
      kycRejectionReason: !isApproving ? (reason || "Documents invalid or unclear.") : null
    };

    // 5. Atomic Commit Cycle
    console.log(`[${opId}] Committing update to Firestore...`);
    const batch = db.batch();
    batch.update(userRef, updates);
    
    // Create Internal System Notification
    const notifRef = userRef.collection('notifications').doc();
    batch.set(notifRef, {
      title: isApproving ? '✅ KYC Verified' : '❌ KYC Rejected',
      message: isApproving ? 'Your identity verification has been approved.' : `Your KYC was rejected. Reason: ${reason}`,
      type: 'kyc_update',
      isRead: false,
      createdAt: FieldValue.serverTimestamp()
    });

    // Record Forensic Audit Log
    const auditRef = db.collection('kyc_audit_logs').doc();
    batch.set(auditRef, {
      opId,
      adminEmail,
      adminUid,
      userId,
      userEmail: userData.email || 'unknown',
      previousStatus: prevStatus,
      newStatus: finalStatus,
      reason: reason || null,
      timestamp: FieldValue.serverTimestamp()
    });
    
    await batch.commit();
    console.log(`[${opId}] Success: KYC status updated to ${finalStatus}`);

    // 6. Provision custom security claims
    if (isApproving) {
      try {
        await services.auth.setCustomUserClaims(userId, { kycVerified: true });
        console.log(`[${opId}] Custom claims propagated.`);
      } catch (claimErr: any) {
        console.warn(`[${opId}] Warning: Custom claims failed: ${claimErr.message}`);
      }
    }
    
    return { success: true };

  } catch (err: any) { 
    console.error(`[${opId}] FATAL ERROR:`, err);
    if (err.message?.includes('PERMISSION_DENIED')) return { success: false, error: "Permission denied" };
    return { success: false, error: err.message || "Failed to update KYC status." }; 
  }
}

export async function updatePayoutStatusAction(payoutId: string, status: string) {
  try {
    if (!await verifyAdminAuth()) return { success: false, error: "Unauthorized" };
    const db = getAdminDb();
    await db.collection('payouts').doc(payoutId).update({ status, updatedAt: FieldValue.serverTimestamp() });
    return { success: true };
  } catch (err: any) { return { success: false, error: err.message }; }
}

export async function cleanupDuplicateOrdersAction() {
  if (!await verifyAdminAuth()) return { success: false, error: "Unauthorized" };
  try {
    const db = getAdminDb();
    const ordersSnap = await db.collection('orders').where('status', '==', 'waiting').get();
    return { success: true };
  } catch (err: any) { return { success: false, error: err.message }; }
}
