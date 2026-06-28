'use server';

import { cookies } from 'next/headers';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { ADMIN_EMAILS } from '@/lib/admin';

/**
 * INSTITUTIONAL HELPER: Serialization
 * Recursively converts Firestore Timestamps and Dates to plain ISO strings for Server Action compliance.
 */
function serializeData(data: any): any {
  if (data === null || data === undefined) return data;

  // Handle Firestore Timestamps (Admin SDK uses plain objects with _seconds for JSON conversion sometimes)
  // or class instances if they are still present.
  if (data && typeof data.toDate === 'function') {
    return data.toDate().toISOString();
  }

  // Handle native Dates
  if (data instanceof Date) {
    return data.toISOString();
  }

  // Handle Arrays
  if (Array.isArray(data)) {
    return data.map(serializeData);
  }

  // Handle Objects
  if (typeof data === 'object' && data.constructor === Object) {
    const result: any = {};
    for (const key in data) {
      result[key] = serializeData(data[key]);
    }
    return result;
  }

  return data;
}

/**
 * SECURITY HELPER: Verify Admin credentials
 */
export async function verifyAdminAuth() {
  try {
    const cookieStore = await cookies();
    const masterToken = cookieStore.get('admin_master')?.value;
    if (masterToken === '93463962569392846256') return true;
    
    const token = cookieStore.get('session')?.value;
    if (!token) return false;
    const decoded = await adminAuth.verifySessionCookie(token, true);
    return !!(decoded.email && ADMIN_EMAILS.includes(decoded.email));
  } catch (error) {
    return false;
  }
}

async function sendAdminNotification(userId: string, title: string, message: string, type: string) {
  try {
    const userRef = adminDb.collection('users').doc(userId);
    const userSnap = await userRef.get();
    const email = userSnap.data()?.email;

    await userRef.collection('notifications').add({
      title,
      message,
      type,
      isRead: false,
      read: false,
      createdAt: FieldValue.serverTimestamp()
    });

    if (email) {
      await adminDb.collection('mail').add({
        to: email,
        message: {
          subject: `PrimeFunded: ${title}`,
          html: `<div style="background:#111;padding:30px;color:#fff;"><h2>${title}</h2><p>${message}</p></div>`
        }
      });
    }
  } catch (err) {
    console.error('[AdminActions] Notification error:', err);
  }
}

export async function fetchAllDemoAccounts() {
  if (!await verifyAdminAuth()) return { success: false, error: "Unauthorized" };
  const snap = await adminDb.collection('demoAccounts').orderBy('createdAt', 'desc').get();
  const accounts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return { success: true, accounts: serializeData(accounts) };
}

export async function fetchDemoTradesByAccount(accountId: string) {
  if (!await verifyAdminAuth()) return { success: false, error: "Unauthorized" };
  const snap = await adminDb.collection('demoTrades')
    .where('accountId', '==', accountId)
    .orderBy('openedAt', 'desc')
    .limit(100)
    .get();
  const trades = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return { success: true, trades: serializeData(trades) };
}

export async function resetDemoAccountAction(accountId: string) {
  if (!await verifyAdminAuth()) return { success: false, error: "Unauthorized" };
  const accountRef = adminDb.collection('demoAccounts').doc(accountId);
  const accountSnap = await accountRef.get();
  if (!accountSnap.exists) throw new Error("Account not found");
  
  const data = accountSnap.data()!;
  
  // IMMUTABILITY GUARD: Do not reset historical records
  const status = String(data.status || '').toLowerCase();
  if (status === 'passed' || status === 'blown' || status === 'terminated') {
    throw new Error(`Cannot reset an account with status: ${data.status}. This node is a permanent historical record.`);
  }

  await accountRef.update({
    balance: data.startBalance || 100000,
    equity: data.startBalance || 100000,
    status: 'active',
    breachReason: null,
    updatedAt: FieldValue.serverTimestamp()
  });
  
  return { success: true };
}

export async function advanceTraderPhaseAction(userId: string) {
  if (!await verifyAdminAuth()) return { success: false, error: "Unauthorized" };
  const userRef = adminDb.collection('users').doc(userId);
  const userSnap = await userRef.get();
  const userData = userSnap.data();
  const currentPhase = userData?.currentPhase || 'evaluation';
  let nextPhase = 'funded';
  
  if (userData?.accountPlan?.toLowerCase().includes('2-step')) {
    nextPhase = currentPhase === 'phase1' ? 'phase2' : 'funded';
  }
  
  await userRef.update({ currentPhase: nextPhase, updatedAt: FieldValue.serverTimestamp(), readyForNextPhase: false });
  await sendAdminNotification(userId, "🎯 Phase Advanced", `Congratulations! You have been advanced to the ${nextPhase.toUpperCase()} phase.`, "challenge_passed");
  
  return { success: true, nextPhase };
}

export async function updateOrderStatusAction(id: string, status: string) {
  if (!await verifyAdminAuth()) return { success: false, error: "Unauthorized" };
  const updates: any = { status, updatedAt: FieldValue.serverTimestamp() };
  if (status === 'approved') {
    updates.approvedAt = FieldValue.serverTimestamp();
    updates.approvedBy = "admin";
  }
  const orderRef = adminDb.collection('orders').doc(id);
  const orderSnap = await orderRef.get();
  const orderData = orderSnap.data();
  await orderRef.update(updates);
  if (status === 'approved' && orderData?.userId) {
    await sendAdminNotification(orderData.userId, "✅ Order Approved", "Your payment has been verified. Your challenge node is being prepared.", "order_approved");
  }
  return { success: true };
}

export async function updatePayoutStatusAction(id: string, status: string) {
  if (!await verifyAdminAuth()) return { success: false, error: "Unauthorized" };
  const payoutRef = adminDb.collection('payouts').doc(id);
  const payoutSnap = await payoutRef.get();
  const payoutData = payoutSnap.data();
  await payoutRef.update({ status, updatedAt: FieldValue.serverTimestamp() });
  if (status === 'done' && payoutData?.userId) {
    await sendAdminNotification(payoutData.userId, "💸 Payout Processed", `Your withdrawal for $${payoutData.amount} has been processed successfully.`, "payout_processed");
  }
  return { success: true };
}

export async function processKycAction(id: string, status: string, reason?: string) {
  if (!await verifyAdminAuth()) return { success: false, error: "Unauthorized" };
  const updates: any = { kycStatus: status, kycVerified: status === 'verified', updatedAt: FieldValue.serverTimestamp() };
  if (reason) updates.kycRejectionReason = reason;
  await adminDb.collection('users').doc(id).update(updates);
  if (status === 'verified') {
    await sendAdminNotification(id, "🛡️ KYC Verified", "Your identity verification is complete. Payouts are now unlocked.", "kyc_approved");
  } else if (status === 'rejected') {
    await sendAdminNotification(id, "❌ KYC Rejected", `Your documents were rejected: ${reason}`, "kyc_rejected");
  }
  return { success: true };
}

export async function sendGlobalBroadcastAction(data: { title: string, message: string, type: string }) {
  if (!await verifyAdminAuth()) return { success: false, error: "Unauthorized" };
  await adminDb.collection('broadcasts').add({ ...data, sentAt: FieldValue.serverTimestamp(), sentBy: 'admin' });
  return { success: true };
}

export async function fetchUserDetailAction(userId: string) {
  if (!await verifyAdminAuth()) return { success: false, error: "Unauthorized" };
  try {
    const [userSnap, accountsSnap, tradesSnap, referralsSnap, payoutsSnap] = await Promise.all([
      adminDb.collection('users').doc(userId).get(),
      adminDb.collection('demoAccounts').where('userId', '==', userId).get(),
      adminDb.collection('demoTrades').where('userId', '==', userId).orderBy('openedAt', 'desc').limit(100).get(),
      adminDb.collection('referrals').where('referrerId', '==', userId).get(),
      adminDb.collection('payouts').where('userId', '==', userId).get()
    ]);
    if (!userSnap.exists) return { success: false, error: "User not found" };
    const data = {
      user: { id: userSnap.id, ...userSnap.data() },
      accounts: accountsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      trades: tradesSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      referrals: referralsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      payouts: payoutsSnap.docs.map(d => ({ id: d.id, ...d.data() }))
    };
    return { success: true, ...serializeData(data) };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function fetchAdminTerminalData() {
  if (!await verifyAdminAuth()) return { success: false, error: "Unauthorized" };
  try {
    const [usersSnap, ordersSnap, payoutsSnap, referralsSnap, broadcastsSnap, breachesSnap, demoAccountsSnap, demoTradesSnap] = await Promise.all([
      adminDb.collection('users').get(),
      adminDb.collection('orders').get(),
      adminDb.collection('payouts').get(),
      adminDb.collection('referrals').get(),
      adminDb.collection('broadcasts').get(),
      adminDb.collection('breaches').get(),
      adminDb.collection('demoAccounts').get(),
      adminDb.collection('demoTrades').orderBy('openedAt', 'desc').limit(500).get(),
    ]);
    const result = {
      users: usersSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      orders: ordersSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      payouts: payoutsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      referrals: referralsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      broadcasts: broadcastsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      breaches: breachesSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      demoAccounts: demoAccountsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      demoTrades: demoTradesSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      success: true
    };
    return serializeData(result);
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
