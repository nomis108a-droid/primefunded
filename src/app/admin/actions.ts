'use server';

import { cookies } from 'next/headers';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { ADMIN_EMAILS } from '@/lib/admin';
import { RULES_CONFIG, getPlanKey } from '@/lib/rulesConfig';

/**
 * SECURITY HELPER: Admin Verification (Legacy)
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

/**
 * Institutional Admin Session Verification
 * Validates the Firebase ID Token and checks for admin privileges.
 */
async function verifyAdminSession(idToken: string) {
  if (!idToken) throw new Error("Identity verification failed: Authentication token is required.");
  
  const auth = getAdminAuth();
  
  try {
    const decoded = await auth.verifyIdToken(idToken);
    const email = decoded.email?.toLowerCase();
    
    if (!email) throw new Error("Identity verification failed: Email missing from token.");

    const adminList = ADMIN_EMAILS.map(e => e.toLowerCase());

    if (!adminList.includes(email)) {
      console.warn(`[Admin-Auth] Unauthorized access attempt by: ${email}`);
      throw new Error("Administrator permission required.");
    }
    
    return decoded;
  } catch (err: any) {
    console.error("[Admin-Auth] Session Verification Error:", err.message);
    if (err.code === 'auth/id-token-expired') throw new Error("Session expired. Please sign in again.");
    
    // Propagate infrastructure errors (like metadata failures) for action-level handling
    throw err;
  }
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
 * Institutional Account Provisioning (Admin SDK Bypass)
 * Safely grants challenges by writing directly via Admin SDK.
 * Bypasses all Firestore Security Rules.
 */
export async function giftAccountAction(email: string, accountSize: string, planType: string) {
  // 1. Verify Caller Authority
  if (!await verifyAdminAuth()) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const db = getAdminDb();
    const auth = getAdminAuth();

    const targetEmail = (email || "").trim().toLowerCase();
    if (!targetEmail) return { success: false, error: "Email is required." };

    // 2. Identify Target User
    let userId = "";
    try {
      const authUser = await auth.getUserByEmail(targetEmail);
      userId = authUser.uid;
    } catch (e) {
      const emailSnap = await db.collection('users').where('email', '==', targetEmail).limit(1).get();
      if (!emailSnap.empty) {
        userId = emailSnap.docs[0].id;
      } else {
        return { success: false, error: "No trader found with this email. Ensure they have signed up." };
      }
    }

    // 3. Resolve Plan Parameters
    const planKey = getPlanKey(planType);
    const balance = parseInt(accountSize.replace(/[^0-9]/g, '')) || 100000;
    const rules = RULES_CONFIG.plans[planKey]?.['evaluation'] || RULES_CONFIG.plans['1-step-pro']['evaluation'];
    
    const profitTarget = balance * (rules.profitTarget || 10) / 100;
    const dailyLossLimitUsd = balance * (rules.dailyDrawdown / 100);
    const maxLossLimitUsd = balance * (rules.maxDrawdown / 100);

    const batch = db.batch();
    const userRef = db.collection('users').doc(userId);

    // A. Update Profile Status
    batch.set(userRef, {
      accountSize,
      planType: planKey,
      accountStatus: 'active',
      grantedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });

    // B. Create Sub-collection Challenge (Bypass Rules)
    const subChallengeRef = userRef.collection('challenges').doc();
    batch.set(subChallengeRef, {
      status: 'active',
      accountSize,
      planType: planKey,
      balance,
      createdAt: FieldValue.serverTimestamp()
    });

    // C. Create Terminal Node
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
      isGifted: true,
      grantedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });

    // D. Send Notification
    const notifRef = userRef.collection('notifications').doc();
    batch.set(notifRef, {
      title: '🎁 Account Provisioned',
      message: `Your free ${accountSize} ${planType} challenge node is now live in your dashboard.`,
      type: 'account_gifted',
      isRead: false,
      createdAt: FieldValue.serverTimestamp()
    });

    await batch.commit();
    return { success: true };
  } catch (err: any) {
    console.error("[Grant-Action] Failure:", err.message);
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

/**
 * CHUNKED BROADCAST DELIVERY
 */
export async function sendGlobalBroadcastAction(data: { title: string, message: string, type: string }) {
  try {
    if (!await verifyAdminAuth()) return { success: false, error: "Unauthorized" };
    const db = getAdminDb();
    
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
 * Institutional KYC Action with Audit Logging
 * Enhanced with exhaustive error reporting for forensic analysis.
 */
export async function updateKycStatusAction(idToken: string, userId: string, status: string, reason?: string) {
  console.log(`[KYC-Action] Initiating update: user=${userId}, status=${status}`);
  try {
    // 1. Authorization Gate - Verify Session
    const adminUser = await verifyAdminSession(idToken);
    
    const db = getAdminDb();
    const auth = getAdminAuth();

    const userRef = db.collection('users').doc(userId);
    const userSnap = await userRef.get();
    
    if (!userSnap.exists) {
      throw new Error(`KYC record lookup failed: user ${userId} not found in dataset.`);
    }
    
    const userData = userSnap.data()!;
    const prevStatus = userData.kycStatus || 'none';

    // 2. Execution via Atomic Batch
    const batch = db.batch();
    
    const updates: any = { 
      kycStatus: status, 
      kycVerified: status === 'verified', 
      updatedAt: FieldValue.serverTimestamp() 
    };

    if (status === 'verified') {
      updates.approvedAt = FieldValue.serverTimestamp();
      updates.approvedBy = adminUser.email;
      updates.kycRejectionReason = null;
    } else if (status === 'rejected') {
      updates.rejectedAt = FieldValue.serverTimestamp();
      updates.rejectedBy = adminUser.email;
      updates.kycRejectionReason = reason || "Documents invalid or unclear.";
    }
    
    batch.update(userRef, updates);
    
    // Set Custom Claims for Verified Users via Admin SDK
    if (status === 'verified') {
      await auth.setCustomUserClaims(userId, { kycVerified: true });
    }
    
    // Create notification
    const notifRef = userRef.collection('notifications').doc();
    batch.set(notifRef, {
      title: status === 'verified' ? '✅ KYC Verified' : '❌ KYC Rejected',
      message: status === 'verified' ? 'Your identity verification has been approved.' : `Your KYC was rejected. Reason: ${reason}`,
      type: 'kyc_update',
      isRead: false,
      createdAt: FieldValue.serverTimestamp()
    });

    // 3. Institutional Audit Logging
    const auditRef = db.collection('kyc_audit_logs').doc();
    batch.set(auditRef, {
      adminId: adminUser.uid,
      adminEmail: adminUser.email,
      userId,
      userEmail: userData.email || 'unknown',
      previousStatus: prevStatus,
      newStatus: status,
      reason: reason || null,
      timestamp: FieldValue.serverTimestamp()
    });
    
    await batch.commit();
    console.log(`[KYC-Action] Successfully finalized update for user: ${userId}`);
    return { success: true };
  } catch (err: any) { 
    // EXHAUSTIVE SERVER-SIDE ERROR LOGGING
    console.error('[KYC-Action] CRITICAL SERVICE FAILURE:', {
      message: err.message,
      code: err.code,
      details: err.details,
      stack: err.stack
    });

    // CONTEXTUAL ERROR FEEDBACK FOR THE UI
    const displayError = err.details || err.message || "Institutional service node failure";
    
    return { 
      success: false, 
      error: displayError.includes('metadata') 
        ? "Administrative authentication failure (Metadata server timeout). Please verify environment credentials."
        : displayError 
    }; 
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
    // Logic for cleanup of expired waiting orders...
    return { success: true };
  } catch (err: any) { return { success: false, error: err.message }; }
}
