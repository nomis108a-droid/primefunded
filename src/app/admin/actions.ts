'use server';

import { cookies } from 'next/headers';
import { getAdminAuth, getAdminDb, getAdminServices } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { ADMIN_EMAILS } from '@/lib/admin';

/**
 * Institutional Admin Session Verification
 * Validates the Firebase ID Token and performs forensic project identity checks.
 */
async function verifyAdminSession(idToken: string) {
  if (!idToken) {
    throw new Error("Authentication failed: No identity token provided.");
  }
  
  const services = getAdminServices();
  const expectedProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  
  // Forensic Audit: Decode token without verification to identify identity discrepancies
  try {
    const tokenParts = idToken.split('.');
    if (tokenParts.length === 3) {
      const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString('utf-8'));
      const tokenProjectId = payload.aud;
      
      console.log(`[Admin-Auth] VERIFICATION ATTEMPT:`);
      console.log(`[Admin-Auth] Expected Project (Server): ${expectedProjectId}`);
      console.log(`[Admin-Auth] Token Audience (Client):  ${tokenProjectId}`);
      
      if (tokenProjectId !== expectedProjectId) {
        console.error(`[Admin-Auth] PROJECT MISMATCH: The client is authenticated against "${tokenProjectId}" but the server expects "${expectedProjectId}".`);
        throw new Error(`Authentication Mismatch: Token project (${tokenProjectId}) does not match server project (${expectedProjectId}).`);
      }
    }
  } catch (decodeErr: any) {
    console.warn(`[Admin-Auth] Token decoding failed:`, decodeErr.message);
  }

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
    console.error("[Admin-Auth] Token verification failed.");
    console.error(`[Admin-Auth] Reason: ${err.message}`);
    
    if (err.code === 'auth/argument-error' || err.message?.includes('aud') || err.message?.includes('projectId')) {
      throw new Error(`Authentication Mismatch: Token project ID does not match server project (${expectedProjectId}).`);
    }

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
    
    // 2. Initialize Database Context
    const services = getAdminServices();
    const db = services.db;
    
    // 3. Document Integrity Check
    const userRef = db.collection('users').doc(userId);
    const userSnap = await userRef.get();
    
    if (!userSnap.exists) {
      console.error(`[${opId}] FAILED: Document users/${userId} not found.`);
      return { success: false, error: "KYC document not found" };
    }

    const userData = userSnap.data()!;
    const prevStatus = userData.kycStatus || 'none';

    // 4. Schema Mapping
    const isApproving = status === 'approved' || status === 'verified';
    const finalStatus = isApproving ? 'verified' : 'rejected';
    
    const updates: any = { 
      kycStatus: finalStatus, 
      kycVerified: isApproving, 
      updatedAt: FieldValue.serverTimestamp(),
      kycReviewedAt: FieldValue.serverTimestamp(),
      kycReviewedBy: adminEmail,
      approvedAt: isApproving ? FieldValue.serverTimestamp() : (userData.approvedAt || null),
      approvedBy: isApproving ? adminEmail : (userData.approvedBy || null),
      rejectedAt: !isApproving ? FieldValue.serverTimestamp() : (userData.rejectedAt || null),
      rejectedBy: !isApproving ? adminEmail : (userData.rejectedBy || null),
      kycRejectionReason: !isApproving ? (reason || "Documents invalid or unclear.") : null
    };

    // 5. Atomic Commit Cycle
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
      } catch (claimErr: any) {
        console.warn(`[${opId}] Warning: Custom claims failed: ${claimErr.message}`);
      }
    }
    
    return { success: true };

  } catch (err: any) { 
    console.error(`[${opId}] FATAL ERROR:`, err.message);
    return { success: false, error: err.message || "Failed to update KYC status." }; 
  }
}

export async function giftAccountAction(email: string, accountSize: string, planType: string) {
  if (!await verifyAdminAuth()) return { success: false, error: "Unauthorized" };
  return { success: true };
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
    return { success: true };
  } catch (err: any) { return { success: false, error: err.message }; }
}

export async function updateGlobalSettingsAction(settings: any) {
  if (!await verifyAdminAuth()) return { success: false, error: "Unauthorized" };
  try {
    const db = getAdminDb();
    await db.collection('settings').doc('payments').set(settings, { merge: true });
    return { success: true };
  } catch (err: any) { return { success: false, error: err.message }; }
}
