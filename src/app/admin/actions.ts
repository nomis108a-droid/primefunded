'use server';

import { getApps, initializeApp, cert, type App } from 'firebase-admin/app';
import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore';

/**
 * @fileOverview Administrative Server Actions
 * Uses Firebase Admin SDK to perform high-privilege operations that bypass Security Rules.
 * Requires FIREBASE_SERVICE_ACCOUNT_KEY environment variable.
 */

function getAdminDb(): Firestore {
  const existingApps = getApps();
  let app: App;

  if (!existingApps.length) {
    let serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    
    if (!serviceAccountKey) {
      console.error('[Admin-SDK] FIREBASE_SERVICE_ACCOUNT_KEY is missing.');
      throw new Error('Administrative terminal requires FIREBASE_SERVICE_ACCOUNT_KEY to be configured in .env');
    }

    try {
      if (serviceAccountKey.startsWith("'") && serviceAccountKey.endsWith("'")) {
        serviceAccountKey = serviceAccountKey.slice(1, -1);
      } else if (serviceAccountKey.startsWith('"') && serviceAccountKey.endsWith('"')) {
        serviceAccountKey = serviceAccountKey.slice(1, -1);
      }

      const serviceAccount = JSON.parse(serviceAccountKey);
      app = initializeApp({
        credential: cert(serviceAccount),
      });
    } catch (e: any) {
      console.error('[Admin-SDK] Initialization failed:', e.message);
      throw new Error(`Admin SDK Config Error: ${e.message}`);
    }
  } else {
    app = existingApps[0];
  }
  return getFirestore(app);
}

/**
 * Helper to recursively convert Firestore Timestamps to ISO Strings for Next.js serialization.
 * This prevents the "Classes or null prototypes are not supported" runtime error.
 */
function serializeFirestoreData(data: any): any {
  if (data === null || data === undefined) return data;

  // Handle Firestore Admin Timestamps
  if (data && typeof data.toDate === 'function') {
    return data.toDate().toISOString();
  }

  // Handle Arrays
  if (Array.isArray(data)) {
    return data.map(item => serializeFirestoreData(item));
  }

  // Handle Objects
  if (typeof data === 'object' && data.constructor.name === 'Object') {
    const serialized: any = {};
    for (const [key, value] of Object.entries(data)) {
      serialized[key] = serializeFirestoreData(value);
    }
    return serialized;
  }

  return data;
}

export async function fetchAdminTerminalData() {
  try {
    const db = getAdminDb();

    const fetchCollection = async (name: string, limitCount = 500, orderByField?: string) => {
      try {
        let q = db.collection(name);
        if (orderByField) {
          const query = q.orderBy(orderByField, 'desc');
          const snap = await query.limit(limitCount).get();
          return snap.docs;
        }
        const snap = await q.limit(limitCount).get();
        return snap.docs;
      } catch (err: any) {
        console.error(`[Admin-SDK] Error fetching ${name}:`, err.message);
        return [];
      }
    };

    const [usersDocs, ordersDocs, payoutsDocs, referralsDocs, broadcastsDocs, breachesDocs] = await Promise.all([
      db.collection('users').get().then(s => s.docs).catch(() => []),
      fetchCollection('orders', 200, 'submittedAt'),
      fetchCollection('payouts', 200, 'date'),
      fetchCollection('referrals', 100, 'createdAt'),
      fetchCollection('broadcasts', 20, 'sentAt'),
      fetchCollection('breaches', 200, 'breachedAt'),
    ]);

    const serialize = (doc: any) => ({
      id: doc.id,
      ...serializeFirestoreData(doc.data())
    });

    return {
      users: usersDocs.map(serialize),
      orders: ordersDocs.map(serialize),
      payouts: payoutsDocs.map(serialize),
      referrals: referralsDocs.map(serialize),
      broadcasts: broadcastsDocs.map(serialize),
      breaches: breachesDocs.map(serialize),
      success: true
    };
  } catch (error: any) {
    console.error('[Admin-SDK] fetchAdminTerminalData Critical Failure:', error);
    return { success: false, error: `Sync Failure: ${error.message}` };
  }
}

/**
 * Update the status of an order record.
 */
export async function updateOrderStatusAction(orderId: string, status: 'verified' | 'rejected', reason?: string) {
  try {
    const db = getAdminDb();
    const orderRef = db.collection('orders').doc(orderId);
    
    const updates: any = {
      status,
      updatedAt: FieldValue.serverTimestamp()
    };

    if (reason) updates.rejectionReason = reason;

    await orderRef.update(updates);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Update the status of a payout request.
 */
export async function updatePayoutStatusAction(payoutId: string, status: 'approved' | 'rejected' | 'done', reason?: string) {
  try {
    const db = getAdminDb();
    const payoutRef = db.collection('payouts').doc(payoutId);
    
    const updates: any = {
      status,
      updatedAt: FieldValue.serverTimestamp()
    };

    if (reason) updates.adminNote = reason;

    await payoutRef.update(updates);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Create a new global broadcast announcement.
 */
export async function createBroadcastAction(title: string, message: string) {
  try {
    const db = getAdminDb();
    const broadcastRef = db.collection('broadcasts').doc();
    
    await broadcastRef.set({
      title,
      message,
      status: 'active',
      sentAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp()
    });
    
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Delete a broadcast.
 */
export async function deleteBroadcastAction(id: string) {
  try {
    const db = getAdminDb();
    await db.collection('broadcasts').doc(id).delete();
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Register a manually created MT5 account into Firestore.
 */
export async function registerMt5AccountAction(data: {
  login: string;
  password: string;
  displayLogin: string;
  userId: string;
  plan: string;
  size: number;
  phase: string;
}) {
  try {
    const db = getAdminDb();
    
    // 1. Create MT5 sync document with String login
    const accountRef = db.collection('mt5_accounts').doc();
    const accountData = {
      login: String(data.login),
      displayLogin: data.displayLogin || String(data.login),
      mt5Password: data.password,
      userId: data.userId,
      accountPlan: data.plan,
      accountBalance: data.size,
      balance: data.size,
      equity: data.size,
      phase: data.phase,
      status: "active",
      dailyStartBalance: data.size, // FIX: Initialize baseline for risk engine
      dailyDrawdownPct: 0,
      maxDrawdownPct: 0,
      createdAt: FieldValue.serverTimestamp(),
      lastMT5Update: null,
    };

    await accountRef.set(accountData);

    // 2. Update the user's primary profile
    const userRef = db.collection('users').doc(data.userId);
    await userRef.update({
      accountBalance: data.size,
      accountSize: `$${(data.size / 1000)}k`.replace('.0k', 'k'), // Cosmetic for UI
      accountPlan: data.plan,
      accountStatus: "active",
      accountActive: true,
      currentPhase: data.phase,
      liveBalance: data.size,
      liveEquity: data.size,
      dailyStartBalance: data.size, // FIX: Initialize baseline for dashboard P&L
      mt5Login: data.login,
      mt5Password: data.password,
      mt5Server: "MetaQuotes-Demo",
      activatedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // 3. Post notification to trader
    await userRef.collection('notifications').add({
      title: "✅ Institutional Account Ready",
      message: `Your ${data.plan} account with $${data.size.toLocaleString()} is now active. Access credentials in your terminal.`,
      type: 'challenge_passed',
      isRead: false,
      createdAt: FieldValue.serverTimestamp()
    });

    return { success: true, docId: accountRef.id };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function processKycAction(userId: string, action: 'verified' | 'rejected', reason?: string) {
  try {
    const db = getAdminDb();
    const userRef = db.collection('users').doc(userId);
    
    const updates: any = {
      kycStatus: action,
      kycVerified: action === 'verified',
      updatedAt: FieldValue.serverTimestamp()
    };

    if (action === 'rejected' && reason) {
      updates.kycRejectionReason = reason;
    }

    await userRef.update(updates);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Directly update a user's account-level profile fields.
 * Excludes live trading metrics to prevent synchronization conflicts.
 */
export async function updateUserProfileAction(userId: string, data: any) {
  try {
    const db = getAdminDb();
    const userRef = db.collection('users').doc(userId);
    
    // Explicitly whitelist allowed fields
    const allowedFields = ['name', 'phone', 'country', 'tier', 'status', 'referralCode'];
    const updates: any = {};
    
    allowedFields.forEach(field => {
      if (data[field] !== undefined) {
        updates[field] = data[field];
      }
    });

    updates.updatedAt = FieldValue.serverTimestamp();

    await userRef.update(updates);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
