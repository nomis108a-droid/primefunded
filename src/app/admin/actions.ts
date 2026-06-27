
'use server';

import { cookies } from 'next/headers';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { ADMIN_EMAILS } from '@/lib/admin';

/**
 * SECURITY HELPER: Verify Admin credentials
 * Checks for a valid session cookie and ensures the user's email is in the authorized ADMIN_EMAILS list.
 */
export async function verifyAdminAuth() {
  try {
    const cookieStore = await cookies();
    
    // Check master password cookie (set by 5-click login)
    const masterToken = cookieStore.get('admin_master')?.value;
    if (masterToken === '93463962569392846256') return true;
    
    // Fallback: check Firebase session cookie
    const token = cookieStore.get('session')?.value;
    if (!token) return false;
    const decoded = await adminAuth.verifySessionCookie(token, true);
    return !!(decoded.email && ADMIN_EMAILS.includes(decoded.email));
  } catch (error) {
    console.error('[AdminAuth] Verification failed:', error);
    return false;
  }
}

/**
 * Admin-side Notification & Email Helper
 */
async function sendAdminNotification(
  userId: string,
  title: string,
  message: string,
  type: string
) {
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
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
              <div style="background:#0a0a0a;padding:20px;text-align:center;">
                <h1 style="color:#00d4ff;margin:0;">PrimeFunded</h1>
              </div>
              <div style="background:#111;padding:30px;color:#fff;">
                <h2 style="color:#fff;">${title}</h2>
                <p style="color:#ccc;line-height:1.6;">${message}</p>
                <a href="https://primefunded.fund/dashboard"
                   style="background:#00d4ff;color:#000;padding:12px 24px;
                          text-decoration:none;border-radius:6px;
                          font-weight:bold;display:inline-block;margin-top:20px;">
                  View Dashboard
                </a>
              </div>
              <div style="background:#0a0a0a;padding:15px;text-align:center;">
                <p style="color:#555;font-size:12px;">PrimeFunded Institutional Trading</p>
              </div>
            </div>
          `
        }
      });
    }
  } catch (err) {
    console.error('[AdminActions] Notification error:', err);
  }
}

export async function fetchAllDemoAccounts() {
  if (!await verifyAdminAuth()) throw new Error("Unauthorized");
  const snap = await adminDb.collection('demoAccounts').orderBy('createdAt', 'desc').get();
  const accounts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return JSON.parse(JSON.stringify(accounts));
}

export async function fetchDemoTradesByAccount(accountId: string) {
  if (!await verifyAdminAuth()) throw new Error("Unauthorized");
  const snap = await adminDb.collection('demoTrades')
    .where('accountId', '==', accountId)
    .orderBy('openedAt', 'desc')
    .limit(100)
    .get();
  const trades = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return JSON.parse(JSON.stringify(trades));
}

export async function resetDemoAccountAction(accountId: string) {
  if (!await verifyAdminAuth()) throw new Error("Unauthorized");
  const accountRef = adminDb.collection('demoAccounts').doc(accountId);
  const accountSnap = await accountRef.get();
  if (!accountSnap.exists) throw new Error("Account not found");
  
  const data = accountSnap.data()!;
  await accountRef.update({
    balance: data.startBalance || 100000,
    equity: data.startBalance || 100000,
    status: 'active',
    updatedAt: FieldValue.serverTimestamp()
  });
  
  return { success: true };
}

export async function advanceTraderPhaseAction(userId: string) {
  if (!await verifyAdminAuth()) throw new Error("Unauthorized");
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
  if (!await verifyAdminAuth()) throw new Error("Unauthorized");
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
  if (!await verifyAdminAuth()) throw new Error("Unauthorized");
  
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
  if (!await verifyAdminAuth()) throw new Error("Unauthorized");
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
  if (!await verifyAdminAuth()) throw new Error("Unauthorized");
  
  await adminDb.collection('broadcasts').add({
    ...data,
    sentAt: FieldValue.serverTimestamp(),
    sentBy: 'admin'
  });

  return { success: true };
}

export async function fetchAdminTerminalData() {
  if (!await verifyAdminAuth()) throw new Error("Unauthorized");
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

  const users = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const orders = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const payouts = payoutsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const referrals = referralsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const broadcasts = broadcastsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const breaches = breachesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const demoAccounts = demoAccountsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const demoTrades = demoTradesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  return { 
    users: JSON.parse(JSON.stringify(users)), 
    orders: JSON.parse(JSON.stringify(orders)), 
    payouts: JSON.parse(JSON.stringify(payouts)), 
    referrals: JSON.parse(JSON.stringify(referrals)), 
    broadcasts: JSON.parse(JSON.stringify(broadcasts)), 
    breaches: JSON.parse(JSON.stringify(breaches)), 
    demoAccounts: JSON.parse(JSON.stringify(demoAccounts)),
    demoTrades: JSON.parse(JSON.stringify(demoTrades)),
    success: true 
  };
}
