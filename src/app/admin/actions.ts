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

export async function runOneTimeCleanupAction() {
  if (!await verifyAdminAuth()) throw new Error("Unauthorized");
  
  // Specific TARGET IDs requested: 5051977398 and 108570666
  const targetIds = ["5051977398", "108570666"];
  const deletedIds: string[] = [];
  const resetUserIds: string[] = [];

  for (const id of targetIds) {
    // SAFETY: Explicitly skip and protect 108582571
    if (id === '108582571') continue;

    const accountRef = adminDb.collection('mt5_accounts').doc(id);
    const accountSnap = await accountRef.get();
    
    if (accountSnap.exists) {
      const data = accountSnap.data();
      const userId = data?.userId;

      // 1. Delete the primary account node
      await accountRef.delete();
      deletedIds.push(id);

      // 2. Exhaustively reset the user document if linked - Removing all institutional data
      if (userId) {
        const userRef = adminDb.collection('users').doc(userId);
        await userRef.update({
          mt5Login: FieldValue.delete(),
          mt5Password: FieldValue.delete(),
          mt5Server: FieldValue.delete(),
          accountStatus: FieldValue.delete(),
          liveBalance: FieldValue.delete(),
          liveEquity: FieldValue.delete(),
          lastMT5Update: FieldValue.delete(),
          breachReason: FieldValue.delete(),
          breachedAt: FieldValue.delete(),
          currentPhase: FieldValue.delete(),
          accountPlan: FieldValue.delete(),
          accountSize: FieldValue.delete(),
          accountBalance: FieldValue.delete(),
          activatedAt: FieldValue.delete(),
          readyForNextPhase: FieldValue.delete(),
          readyForPhaseReset: FieldValue.delete()
        });
        resetUserIds.push(userId);
      }
    }
  }

  return { success: true, deletedIds, resetUserIds };
}

export async function resetAccountAction(login: string, newBalance: number, phase: string = 'funded') {
  if (!await verifyAdminAuth()) throw new Error("Unauthorized");
  const loginStr = String(login).trim();
  const accountRef = adminDb.collection('mt5_accounts').doc(loginStr);
  
  const accountSnap = await accountRef.get();
  if (!accountSnap.exists) throw new Error("Account not found");
  
  const data = accountSnap.data();
  const userId = data?.userId;

  // Restore account to clean active state
  await accountRef.update({
    accountBalance: newBalance,
    balance: newBalance,
    equity: newBalance,
    status: 'active',
    phase: phase,
    breachReason: FieldValue.delete(),
    breachedAt: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp()
  });

  if (userId) {
    const userRef = adminDb.collection('users').doc(userId);
    await userRef.update({
      accountStatus: 'active',
      accountBalance: newBalance,
      liveBalance: newBalance,
      liveEquity: newBalance,
      currentPhase: phase,
      breachReason: FieldValue.delete(),
      breachedAt: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp()
    });
  }

  return { success: true };
}

export async function deleteMt5AccountAction(login: string) {
  if (!await verifyAdminAuth()) throw new Error("Unauthorized");
  const loginStr = String(login).trim();
  const accountRef = adminDb.collection('mt5_accounts').doc(loginStr);
  
  const accountSnap = await accountRef.get();
  if (!accountSnap.exists) return { success: true };
  
  const data = accountSnap.data();
  const userId = data?.userId;

  // 1. Delete the primary account node
  await accountRef.delete();

  // 2. Delete associated trades from the user's profile
  if (userId) {
    const tradesRef = adminDb.collection('users').doc(userId).collection('trades');
    const tradesSnap = await tradesRef.where('login', '==', loginStr).get();
    
    if (!tradesSnap.empty) {
      const batch = adminDb.batch();
      tradesSnap.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    }

    // 3. Clear mirroring fields on the user profile if this was their active node
    const userRef = adminDb.collection('users').doc(userId);
    const userSnap = await userRef.get();
    const userData = userSnap.data();
    
    if (String(userData?.mt5Login) === loginStr) {
      await userRef.update({
        mt5Login: FieldValue.delete(),
        mt5Password: FieldValue.delete(),
        mt5Server: FieldValue.delete(),
        accountStatus: FieldValue.delete(),
        liveBalance: FieldValue.delete(),
        liveEquity: FieldValue.delete(),
        lastMT5Update: FieldValue.delete(),
        currentPhase: FieldValue.delete(),
        accountPlan: FieldValue.delete(),
        accountSize: FieldValue.delete(),
        accountBalance: FieldValue.delete(),
        breachReason: FieldValue.delete(),
        breachedAt: FieldValue.delete()
      });
    }
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

export async function runRetroactiveRiskAuditAction() {
  if (!await verifyAdminAuth()) throw new Error("Unauthorized");
  
  const snap = await adminDb.collection('mt5_accounts').get();
  let breachCount = 0;
  const auditData: any[] = [];

  for (const doc of snap.docs) {
    const data = doc.data();
    const login = String(data.login || doc.id);
    const userId = data.userId || data.uid;
    const initialBalance = parseFloat(String(data.accountBalance || data.startingBalance || 0));

    if (!userId || initialBalance <= 0 || data.status === 'breached') {
      auditData.push({ login, skipped: true, reason: !userId ? "Missing userId" : "Zero balance" });
      continue;
    }

    const userRef = adminDb.collection('users').doc(userId);
    const userSnap = await userRef.get();
    const userData = userSnap.data();
    const traderId = userData?.uid || 'N/A';
    
    const tradesSnap = await userRef.collection('trades').get();
    const trades = tradesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    let breached = false;
    let reason = "";
    let violatingTicket = "audit";

    for (const t of trades) {
      const pnl = parseFloat(String(t.pnl || t.profit || 0));
      if (pnl < 0 && Math.abs(pnl) > (initialBalance * 0.03)) {
        breached = true;
        reason = `Retroactive breach: Single trade loss -$${Math.abs(pnl).toFixed(2)} exceeds 3% limit ($${(initialBalance * 0.03).toFixed(2)}) (Ticket: ${t.id || t.ticket})`;
        violatingTicket = String(t.id || t.ticket);
        break;
      }
    }

    if (breached) {
      const breachKey = `audit_hard_${login}_${violatingTicket}`;
      const existingBreach = await adminDb.collection('breaches').doc(breachKey).get();
      if (!existingBreach.exists) {
        breachCount++;
        await doc.ref.update({ status: 'breached', breachReason: reason, breachedAt: FieldValue.serverTimestamp() });
        await userRef.update({ accountStatus: 'breached', breachReason: reason, breachedAt: FieldValue.serverTimestamp() });
        
        await adminDb.collection('breaches').doc(breachKey).set({
          userId, traderId, login,
          userName: userData?.name || 'N/A',
          userEmail: userData?.email || 'N/A',
          breachReason: reason, breachType: 'hard',
          breachedAt: FieldValue.serverTimestamp()
        }, { merge: true });

        await sendAdminNotification(userId, "🚫 Account Liquidated (Audit)", reason, "challenge_failed");
        auditData.push({ login, breached: true, reason });
      } else {
        auditData.push({ login, skipped: true, reason: "Breach already recorded" });
      }
    } else {
      auditData.push({ login, breached: false });
    }
  }

  return { success: true, breachCount, auditData };
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

export async function registerMt5AccountAction(data: any) {
  if (!await verifyAdminAuth()) throw new Error("Unauthorized");
  
  const loginStr = String(data.login).trim();
  const accountRef = adminDb.collection('mt5_accounts').doc(loginStr);
  
  // CRITICAL: Prevent overwriting existing nodes
  const existingDoc = await accountRef.get();
  if (existingDoc.exists) {
    throw new Error(`Login ID ${loginStr} is already provisioned in the system. Use a unique login number.`);
  }

  // Patch: Instant Funding accounts automatically start in 'funded' phase
  const isInstant = data.plan?.toLowerCase().includes('instant');
  const finalPhase = isInstant ? 'funded' : (data.phase || 'evaluation');

  await accountRef.set({
    userId: data.userId,
    login: loginStr,
    password: data.password,
    displayLogin: data.displayLogin || `PF-${loginStr}`,
    accountPlan: data.plan,
    accountBalance: data.size,
    balance: data.size,
    equity: data.size,
    phase: finalPhase,
    status: 'active',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  });

  const userRef = adminDb.collection('users').doc(data.userId);
  await userRef.update({
    mt5Login: loginStr,
    mt5Password: data.password,
    mt5Server: "MetaQuotes-Demo",
    accountPlan: data.plan,
    accountSize: `$${data.size / 1000}k`,
    accountBalance: data.size,
    accountStatus: 'active',
    currentPhase: finalPhase,
    activatedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  });

  await sendAdminNotification(data.userId, "🚀 Account Provisioned", `Your MetaTrader 5 account PF-${loginStr} is now active. View credentials in the terminal.`, "account_provisioned");

  return { success: true, docId: loginStr };
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

export async function forceBreachAccountAction(userId: string, login: string, reason: string) {
  if (!await verifyAdminAuth()) throw new Error("Unauthorized");
  const fullReason = `Manual Admin Breach: ${reason}`;
  
  const userRef = adminDb.collection('users').doc(userId);
  const userSnap = await userRef.get();
  const userData = userSnap.data();

  const batch = adminDb.batch();

  if (login && login !== 'undefined' && login !== 'N/A') {
    const accountRef = adminDb.collection('mt5_accounts').doc(String(login));
    batch.update(accountRef, { status: 'breached', breachedAt: FieldValue.serverTimestamp(), breachReason: fullReason });
  }

  batch.update(userRef, { accountStatus: 'breached', breachReason: fullReason, breachedAt: FieldValue.serverTimestamp() });

  const breachId = `manual_${login}_${Date.now()}`;
  batch.set(adminDb.collection('breaches').doc(breachId), {
    login, userId, traderId: userData?.uid || 'N/A', userName: userData?.name || 'N/A', userEmail: userData?.email || 'N/A',
    reason: fullReason, breachReason: fullReason, type: 'hard', breachedAt: FieldValue.serverTimestamp(),
    phase: userData?.currentPhase || 'N/A', plan: userData?.accountPlan || 'N/A', manualBreach: true, adminAction: true
  });

  await batch.commit();
  await sendAdminNotification(userId, "🚫 Account Liquidated", `Your account has been terminated due to an institutional risk breach: ${reason}.`, "challenge_failed");
  
  return { success: true };
}

export async function fetchAdminTerminalData() {
  if (!await verifyAdminAuth()) throw new Error("Unauthorized");
  const [usersSnap, ordersSnap, payoutsSnap, referralsSnap, broadcastsSnap, breachesSnap, accountsSnap] = await Promise.all([
    adminDb.collection('users').get(),
    adminDb.collection('orders').get(),
    adminDb.collection('payouts').get(),
    adminDb.collection('referrals').get(),
    adminDb.collection('broadcasts').get(),
    adminDb.collection('breaches').get(),
    adminDb.collection('mt5_accounts').get(),
  ]);

  const users = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const orders = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const payouts = payoutsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const referrals = referralsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const broadcasts = broadcastsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const breaches = breachesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  
  const accounts = accountsSnap.docs.map(d => {
    const data = d.data();
    const currentLogin = data.login;
    if (typeof currentLogin !== 'string') {
      const loginStr = String(currentLogin || d.id).trim();
      d.ref.update({ login: loginStr }).catch(() => {});
      return { id: d.id, ...data, login: loginStr };
    }
    return { id: d.id, ...data };
  });

  return { 
    users: JSON.parse(JSON.stringify(users)), 
    orders: JSON.parse(JSON.stringify(orders)), 
    payouts: JSON.parse(JSON.stringify(payouts)), 
    referrals: JSON.parse(JSON.stringify(referrals)), 
    broadcasts: JSON.parse(JSON.stringify(broadcasts)), 
    breaches: JSON.parse(JSON.stringify(breaches)), 
    accounts: JSON.parse(JSON.stringify(accounts)),
    success: true 
  };
}
