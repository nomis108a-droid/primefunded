
'use server';

import { cookies } from 'next/headers';
import { getAdminAuth, getAdminDb, getAdminServices } from '@/lib/firebase-admin';
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
  if (!idToken) {
    console.error("[Admin-Auth] FAILED: No ID token provided.");
    throw new Error("Identity verification failed: Authentication token is required.");
  }
  
  const services = getAdminServices();
  
  try {
    const decoded = await services.auth.verifyIdToken(idToken);
    const email = decoded.email?.toLowerCase();
    
    if (!email) {
      console.error("[Admin-Auth] FAILED: Email missing from token.");
      throw new Error("Identity verification failed: Email missing from token.");
    }

    const adminList = ADMIN_EMAILS.map(e => e.toLowerCase());

    if (!adminList.includes(email)) {
      console.warn(`[Admin-Auth] UNAUTHORIZED: Access attempt by: ${email}`);
      throw new Error("Administrator permission required.");
    }
    
    console.log(`[Admin-Auth] SUCCESS: Session verified for ${email}`);
    return decoded;
  } catch (err: any) {
    console.error("[Admin-Auth] CRITICAL ERROR during token verification:", err.message);
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
 * Institutional KYC Action with Audit Logging
 * Specialized to handle the "approved"/"rejected" flow with correct schema mapping.
 */
export async function updateKycStatusAction(idToken: string, userId: string, status: string, reason?: string) {
  console.log(`[KYC-Action] >>> INCOMING REQUEST: Operation=${status}, TargetUID=${userId}`);
  
  try {
    // 1. Verify Administrative Credentials
    console.log(`[KYC-Action] 1. Verifying admin session...`);
    const adminUser = await verifyAdminSession(idToken);
    const adminEmail = adminUser.email!;
    
    // 2. Initialize Database Context
    console.log(`[KYC-Action] 2. Initializing database context...`);
    const services = getAdminServices();
    const db = services.db;
    
    // 3. Document Integrity Check
    const userRef = db.collection('users').doc(userId);
    console.log(`[KYC-Action] 3. Fetching user document: ${userRef.path}`);
    const userSnap = await userRef.get();
    
    if (!userSnap.exists) {
      console.error(`[KYC-Action] CRITICAL: User document ${userId} not found in 'users' collection.`);
      return { success: false, error: "Failed to update KYC status." };
    }

    const userData = userSnap.data()!;
    const prevStatus = userData.kycStatus || 'none';
    console.log(`[KYC-Action] User Found: ${userData.email} (Previous Status: ${prevStatus})`);

    // 4. Schema Mapping & Payloads
    // Status normalization for DB schema (enum: "none", "pending", "verified", "rejected")
    const finalStatus = (status === 'approved' || status === 'verified') ? 'verified' : 'rejected';
    
    const updates: any = { 
      kycStatus: finalStatus, 
      kycVerified: finalStatus === 'verified', 
      updatedAt: FieldValue.serverTimestamp() 
    };

    if (finalStatus === 'verified') {
      updates.approvedAt = FieldValue.serverTimestamp();
      updates.approvedBy = adminEmail;
      updates.kycRejectionReason = null;
    } else {
      updates.rejectedAt = FieldValue.serverTimestamp();
      updates.rejectedBy = adminEmail;
      updates.kycRejectionReason = reason || "Documents invalid or unclear.";
    }
    
    console.log(`[KYC-Action] 4. Preparing atomic update:`, JSON.stringify(updates));

    // 5. Atomic Commit Cycle
    const batch = db.batch();
    
    // A. Update Main Profile
    batch.update(userRef, updates);
    
    // B. Create Internal System Notification
    const notifRef = userRef.collection('notifications').doc();
    batch.set(notifRef, {
      title: finalStatus === 'verified' ? '✅ KYC Verified' : '❌ KYC Rejected',
      message: finalStatus === 'verified' ? 'Your identity verification has been approved.' : `Your KYC was rejected. Reason: ${reason}`,
      type: 'kyc_update',
      isRead: false,
      createdAt: FieldValue.serverTimestamp()
    });

    // C. Record Forensic Audit Log
    const auditRef = db.collection('kyc_audit_logs').doc();
    batch.set(auditRef, {
      adminEmail,
      userId,
      userEmail: userData.email || 'unknown',
      previousStatus: prevStatus,
      newStatus: finalStatus,
      reason: reason || null,
      timestamp: FieldValue.serverTimestamp()
    });
    
    console.log(`[KYC-Action] 5. Executing batch commit...`);
    await batch.commit();

    // 6. Post-Commit Security Extensions
    if (finalStatus === 'verified') {
      console.log(`[KYC-Action] 6. Setting custom claims...`);
      try {
        await services.auth.setCustomUserClaims(userId, { kycVerified: true });
      } catch (claimErr: any) {
        console.warn(`[KYC-Action] Warning: Custom claims failed to propagate: ${claimErr.message}`);
      }
    }
    
    console.log(`[KYC-Action] COMPLETED: User=${userId}, Status=${finalStatus}`);
    return { success: true };

  } catch (err: any) { 
    console.error('[KYC-Action] FATAL EXCEPTION:', err.message);
    if (err.stack) console.error(err.stack);
    return { success: false, error: "Failed to update KYC status." }; 
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
