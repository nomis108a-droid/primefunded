
'use server';

import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { ADMIN_EMAILS } from '@/lib/admin';
import { processReferralCommission } from '@/lib/referral';

async function verifyAdminSession(idToken: string) {
  if (!idToken) throw new Error("Authentication failed: No identity token provided.");
  const auth = getAdminAuth();
  const decoded = await auth.verifyIdToken(idToken);
  const email = decoded.email?.toLowerCase();
  if (!email || !ADMIN_EMAILS.map(e => e.toLowerCase()).includes(email)) {
    throw new Error("Administrator permission required.");
  }
  return decoded;
}

export async function approveManualOrderAction(id: string, idToken: string) {
  try {
    await verifyAdminSession(idToken);
    const db = getAdminDb();
    const orderRef = db.collection('orders').doc(id);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) throw new Error("Order not found");
    
    const orderData = orderSnap.data()!;
    
    await orderRef.update({ 
      status: 'completed', 
      approvedAt: FieldValue.serverTimestamp(), 
      updatedAt: FieldValue.serverTimestamp() 
    });

    // Process Commission
    if (orderData.userId && orderData.amountPaid > 0) {
      // Need a client-side friendly call here or move processReferralCommission to a shared admin utility
      // For simplicity in this action, we trigger it directly since we have Admin SDK access
      await triggerCommission(orderData.userId, orderData.amountPaid, orderData.plan);
    }

    return { success: true };
  } catch (err: any) { return { success: false, error: err.message }; }
}

/**
 * Shared server-side commission trigger using Admin SDK
 */
async function triggerCommission(userId: string, amount: number, planType: string) {
  const db = getAdminDb();
  const userSnap = await db.collection('users').doc(userId).get();
  if (!userSnap.exists) return;
  
  const userData = userSnap.data()!;
  const referrerId = userData.referredBy;
  if (!referrerId || !planType.toLowerCase().includes('step')) return;

  const commission = amount * 0.20;
  const batch = db.batch();

  const referrerRef = db.collection('users').doc(referrerId);
  batch.update(referrerRef, {
    'referralStats.purchases': FieldValue.increment(1),
    'referralEarnings.pending': FieldValue.increment(commission),
    'referralEarnings.withdrawable': FieldValue.increment(commission),
    updatedAt: FieldValue.serverTimestamp()
  });

  const referralRef = db.collection('referrals').doc();
  batch.set(referralRef, {
    referrerId,
    referredUserId: userId,
    referredUserEmail: userData.email || 'unknown',
    status: 'funded',
    amount: commission,
    planType,
    orderAmount: amount,
    createdAt: FieldValue.serverTimestamp()
  });

  const notifRef = referrerRef.collection('notifications').doc();
  batch.set(notifRef, {
    title: '💰 Commission Earned!',
    message: `You earned $${commission.toFixed(2)} from a referral purchase.`,
    type: 'referral_earned',
    isRead: false,
    createdAt: FieldValue.serverTimestamp()
  });

  await batch.commit();
}

export async function updateKycStatusAction(idToken: string, userId: string, status: string, reason?: string) {
  try {
    const adminUser = await verifyAdminSession(idToken);
    const db = getAdminDb();
    const userRef = db.collection('users').doc(userId);
    const isApproving = status === 'approved' || status === 'verified';
    const finalStatus = isApproving ? 'verified' : 'rejected';
    
    await userRef.update({ 
      kycStatus: finalStatus, 
      kycVerified: isApproving, 
      updatedAt: FieldValue.serverTimestamp(),
      kycReviewedAt: FieldValue.serverTimestamp(),
      kycReviewedBy: adminUser.email,
      kycRejectionReason: !isApproving ? (reason || "Documents invalid.") : null
    });
    return { success: true };
  } catch (err: any) { return { success: false, error: err.message }; }
}

export async function updateOrderStatusAction(id: string, status: string, reason?: string) {
  try {
    const db = getAdminDb();
    const updates: any = { status, updatedAt: FieldValue.serverTimestamp() };
    if (reason) updates.rejectionReason = reason;
    await db.collection('orders').doc(id).update(updates);
    return { success: true };
  } catch (err: any) { return { success: false, error: err.message }; }
}

export async function resetSingleAccountAction(accountId: string) {
  try {
    const db = getAdminDb();
    const accountRef = db.collection('demoAccounts').doc(accountId);
    const accountSnap = await accountRef.get();
    if (!accountSnap.exists) throw new Error("Account not found");
    const data = accountSnap.data()!;
    const batch = db.batch();
    batch.update(accountRef, { balance: data.startBalance || 100000, equity: data.startBalance || 100000, status: 'active', breachReason: null, dailyGrossLossUsd: 0, updatedAt: FieldValue.serverTimestamp() });
    const tradesSnap = await db.collection('demoTrades').where('accountId', '==', accountId).get();
    tradesSnap.docs.forEach(tradeDoc => batch.delete(tradeDoc.ref));
    await batch.commit();
    return { success: true };
  } catch (err: any) { return { success: false, error: err.message }; }
}

export async function resetAllHistoryAction() {
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
    const db = getAdminDb();
    await db.collection('broadcasts').add({ ...data, sentAt: FieldValue.serverTimestamp() });
    return { success: true };
  } catch (err: any) { return { success: false, error: err.message }; }
}

export async function updatePayoutStatusAction(payoutId: string, status: string) {
  try {
    const db = getAdminDb();
    await db.collection('payouts').doc(payoutId).update({ status, updatedAt: FieldValue.serverTimestamp() });
    return { success: true };
  } catch (err: any) { return { success: false, error: err.message }; }
}
