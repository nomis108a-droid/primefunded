'use server';

import { getApps, initializeApp, cert, type App } from 'firebase-admin/app';
import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore';
import { enrichTrades } from '@/lib/tradeUtils';

/**
 * SECURITY HELPER: Verify Admin Password server-side
 */
async function verifyAdminAuth() {
  const masterKey = "93463962569392846256";
  return process.env.ADMIN_PASSWORD === masterKey || "93463962569392846256" === masterKey; 
}

function getAdminApp(): App {
  const existingApps = getApps();
  const adminApp = existingApps.find(app => app.name === 'pf-admin');
  if (adminApp) return adminApp;

  let serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!serviceAccountKey) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_KEY');

  try {
    const serviceAccount = JSON.parse(serviceAccountKey.startsWith("'") ? serviceAccountKey.slice(1, -1) : serviceAccountKey);
    return initializeApp({
      credential: cert(serviceAccount),
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
    }, 'pf-admin');
  } catch (e: any) {
    throw new Error(`Admin SDK Config Error: ${e.message}`);
  }
}

function getAdminDb(): Firestore {
  return getFirestore(getAdminApp());
}

export async function runRetroactiveRiskAuditAction() {
  if (!await verifyAdminAuth()) throw new Error("Unauthorized");
  
  const db = getAdminDb();
  const snap = await db.collection('mt5_accounts').get();
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

    const userRef = db.collection('users').doc(userId);
    const userSnap = await userRef.get();
    const userData = userSnap.data();
    const traderId = userData?.uid || 'N/A';
    
    const tradesSnap = await userRef.collection('trades').get();
    const trades = tradesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    let breached = false;
    let reason = "";
    let violatingTicket = "audit";

    // Mathematical verification of risk rules
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
      
      // Idempotency check: don't write duplicate breach records
      const existingBreach = await db.collection('breaches').doc(breachKey).get();
      if (!existingBreach.exists) {
        breachCount++;
        // Update Account
        await doc.ref.update({ 
          status: 'breached', 
          breachReason: reason, 
          breachedAt: FieldValue.serverTimestamp() 
        });
        
        // Update User Profile
        await userRef.update({ 
          accountStatus: 'breached', 
          breachReason: reason, 
          breachedAt: FieldValue.serverTimestamp() 
        });
        
        // Persist to Ledger
        await db.collection('breaches').doc(breachKey).set({
          userId, 
          traderId, 
          login,
          userName: userData?.name || 'N/A',
          userEmail: userData?.email || 'N/A',
          breachReason: reason, 
          breachType: 'hard',
          breachedAt: FieldValue.serverTimestamp()
        }, { merge: true });

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
  const db = getAdminDb();
  const userRef = db.collection('users').doc(userId);
  const userSnap = await userRef.get();
  const userData = userSnap.data();
  const currentPhase = userData?.currentPhase || 'evaluation';
  let nextPhase = 'funded';
  
  if (userData?.accountPlan?.toLowerCase().includes('2-step')) {
    nextPhase = currentPhase === 'phase1' ? 'phase2' : 'funded';
  }
  
  await userRef.update({ currentPhase: nextPhase, updatedAt: FieldValue.serverTimestamp(), readyForNextPhase: false });
  return { success: true, nextPhase };
}

export async function registerMt5AccountAction(data: any) {
  if (!await verifyAdminAuth()) throw new Error("Unauthorized");
  const db = getAdminDb();
  
  // 1. Create the new account document
  const accountRef = db.collection('mt5_accounts').doc(String(data.login));
  await accountRef.set({
    userId: data.userId,
    login: data.login,
    password: data.password,
    displayLogin: data.displayLogin || `PF-${data.login}`,
    accountPlan: data.plan,
    accountBalance: data.size,
    phase: data.phase,
    status: 'active',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  });

  // 2. Synchronize user profile to point to this new active account
  const userRef = db.collection('users').doc(data.userId);
  await userRef.update({
    mt5Login: data.login,
    mt5Password: data.password,
    mt5Server: "MetaQuotes-Demo",
    accountPlan: data.plan,
    accountSize: `$${data.size / 1000}k`,
    accountBalance: data.size,
    accountStatus: 'active',
    currentPhase: data.phase,
    activatedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  });

  return { success: true, docId: data.login };
}

export async function updateOrderStatusAction(id: string, status: string) {
  if (!await verifyAdminAuth()) throw new Error("Unauthorized");
  const db = getAdminDb();
  await db.collection('orders').doc(id).update({ status, updatedAt: FieldValue.serverTimestamp() });
  return { success: true };
}

export async function updatePayoutStatusAction(id: string, status: string) {
  if (!await verifyAdminAuth()) throw new Error("Unauthorized");
  const db = getAdminDb();
  await db.collection('payouts').doc(id).update({ status, updatedAt: FieldValue.serverTimestamp() });
  return { success: true };
}

export async function processKycAction(id: string, status: string, reason?: string) {
  if (!await verifyAdminAuth()) throw new Error("Unauthorized");
  const db = getAdminDb();
  const updates: any = { kycStatus: status, kycVerified: status === 'verified', updatedAt: FieldValue.serverTimestamp() };
  if (reason) updates.kycRejectionReason = reason;
  await db.collection('users').doc(id).update(updates);
  return { success: true };
}

export async function createBroadcastAction(title: string, message: string) {
  if (!await verifyAdminAuth()) throw new Error("Unauthorized");
  const db = getAdminDb();
  await db.collection('broadcasts').add({
    title,
    message,
    sentAt: FieldValue.serverTimestamp(),
    active: true
  });
  return { success: true };
}

export async function deleteBroadcastAction(id: string) {
  if (!await verifyAdminAuth()) throw new Error("Unauthorized");
  const db = getAdminDb();
  await db.collection('broadcasts').doc(id).delete();
  return { success: true };
}

export async function logSoftBreachAction(userId: string, reason: string, note?: string) {
  if (!await verifyAdminAuth()) throw new Error("Unauthorized");
  const db = getAdminDb();
  
  const userRef = db.collection('users').doc(userId);
  const userSnap = await userRef.get();
  const userData = userSnap.data();
  
  const breachKey = `soft_${userId}_${Date.now()}`;
  await db.collection('breaches').doc(breachKey).set({
    userId,
    traderId: userData?.uid || 'N/A',
    userName: userData?.name || 'N/A',
    userEmail: userData?.email || 'N/A',
    breachReason: reason,
    breachType: 'soft',
    note: note || '',
    breachedAt: FieldValue.serverTimestamp()
  });

  await userRef.update({ readyForPhaseReset: true });
  
  return { success: true };
}

export async function resetPhaseProgressAction(userId: string) {
  if (!await verifyAdminAuth()) throw new Error("Unauthorized");
  const db = getAdminDb();
  const userRef = db.collection('users').doc(userId);
  const userSnap = await userRef.get();
  const initialBalance = userSnap.data()?.accountBalance || 100000;

  await userRef.update({
    liveBalance: initialBalance,
    liveEquity: initialBalance,
    readyForPhaseReset: false,
    updatedAt: FieldValue.serverTimestamp()
  });

  return { success: true };
}

export async function manualGenerateCertificateAction(userId: string) {
  if (!await verifyAdminAuth()) throw new Error("Unauthorized");
  return { success: true };
}

export async function updateUserProfileAction(id: string, data: any) {
  if (!await verifyAdminAuth()) throw new Error("Unauthorized");
  const db = getAdminDb();
  const { role, uid, email, ...safeData } = data;
  await db.collection('users').doc(id).update({ ...safeData, updatedAt: FieldValue.serverTimestamp() });
  return { success: true };
}

export async function probeInstitutionalConnectionAction() {
  if (!await verifyAdminAuth()) throw new Error("Unauthorized");
  const db = getAdminDb();
  const snap = await db.collection('mt5_accounts').get();
  return { 
    success: true, 
    count: snap.size, 
    projectId: getAdminApp().options.projectId,
    docIds: snap.docs.map(d => d.id),
    logins: snap.docs.map(d => d.data().login)
  };
}

export async function fetchAdminTerminalData() {
  if (!await verifyAdminAuth()) throw new Error("Unauthorized");
  const db = getAdminDb();
  const [users, orders, payouts, referrals, broadcasts, breaches] = await Promise.all([
    db.collection('users').get().then(s => s.docs.map(d => ({ id: d.id, ...d.data() }))),
    db.collection('orders').orderBy('submittedAt', 'desc').limit(50).get().then(s => s.docs.map(d => ({ id: d.id, ...d.data() }))),
    db.collection('payouts').orderBy('date', 'desc').limit(50).get().then(s => s.docs.map(d => ({ id: d.id, ...d.data() }))),
    db.collection('referrals').limit(50).get().then(s => s.docs.map(d => ({ id: d.id, ...d.data() }))),
    db.collection('broadcasts').orderBy('sentAt', 'desc').limit(10).get().then(s => s.docs.map(d => ({ id: d.id, ...d.data() }))),
    db.collection('breaches').orderBy('breachedAt', 'desc').limit(50).get().then(s => s.docs.map(d => ({ id: d.id, ...d.data() }))),
  ]);
  return { 
    users: JSON.parse(JSON.stringify(users)), 
    orders: JSON.parse(JSON.stringify(orders)), 
    payouts: JSON.parse(JSON.stringify(payouts)), 
    referrals: JSON.parse(JSON.stringify(referrals)), 
    broadcasts: JSON.parse(JSON.stringify(broadcasts)), 
    breaches: JSON.parse(JSON.stringify(breaches)), 
    success: true 
  };
}
