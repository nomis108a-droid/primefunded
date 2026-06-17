'use server';

import { getApps, initializeApp, cert, type App } from 'firebase-admin/app';
import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { getPlanKey, RULES_CONFIG } from '@/lib/rulesConfig';
import { enrichTrades, getTradeDate } from '@/lib/tradeUtils';

const AUDIT_VERSION = "2024-06-18-AUDIT-VERIFY-101";

/**
 * Initializes the Firebase Admin SDK for administrative operations.
 * Uses a named app 'pf-admin' to prevent initialization conflicts.
 */
function getAdminApp(): App {
  const existingApps = getApps();
  const adminApp = existingApps.find(app => app.name === 'pf-admin');
  if (adminApp) return adminApp;

  let serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!serviceAccountKey) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_KEY');

  try {
    if (serviceAccountKey.startsWith("'") || serviceAccountKey.startsWith('"')) {
      serviceAccountKey = serviceAccountKey.slice(1, -1);
    }
    const serviceAccount = JSON.parse(serviceAccountKey);
    console.log(`>>> [SYSTEM] Initializing Admin SDK for Project: ${serviceAccount.project_id}`);
    
    return initializeApp({
      credential: cert(serviceAccount),
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || `${serviceAccount.project_id}.firebasestorage.app`
    }, 'pf-admin');
  } catch (e: any) {
    throw new Error(`Admin SDK Config Error: ${e.message}`);
  }
}

function getAdminDb(): Firestore {
  return getFirestore(getAdminApp());
}

/**
 * Isolated Connection Test
 */
export async function probeInstitutionalConnectionAction() {
  console.log(">>> [PROBE] Starting connection test...");
  try {
    const db = getAdminDb();
    const snap = await db.collection('mt5_accounts').get();
    const docIds = snap.docs.map(d => d.id);
    const logins = snap.docs.map(d => d.data().login);
    
    console.log(`>>> [PROBE] Found ${snap.size} documents in mt5_accounts`);
    return { 
      success: true, 
      count: snap.size, 
      docIds, 
      logins,
      projectId: getAdminApp().options.projectId
    };
  } catch (error: any) {
    console.error(">>> [PROBE] FAILED:", error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Institutional Retroactive Risk Auditor
 * Optimized to catch historical violations across any session and persist to ledger.
 */
export async function runRetroactiveRiskAuditAction() {
  console.log(`>>> [AUDIT-ENTRY] Invoked at ${new Date().toISOString()}`);
  const auditData: any[] = [];
  let breachCount = 0;

  try {
    const db = getAdminDb();
    
    console.log(">>> [AUDIT-FETCH] Attempting to fetch mt5_accounts...");
    const snap = await db.collection('mt5_accounts').get();
    
    console.log(`>>> [AUDIT-FETCH-RESULT] Found ${snap.size} documents.`);
    
    if (snap.empty) {
      console.warn(">>> [AUDIT-FETCH-EMPTY] The collection was empty.");
      return { success: true, breachCount: 0, auditData: [], version: AUDIT_VERSION, note: "Empty collection" };
    }

    for (const doc of snap.docs) {
      const data = doc.data();
      const login = String(data.login || doc.id);
      
      // Field-agnostic user and balance resolution
      const userId = data.userId || data.uid || data.user_id;
      const initialBalance = parseFloat(String(data.accountBalance || data.startingBalance || data.balance || 0));
      
      console.log(`>>> [AUDIT-LOOP] Checking: ${login} | User: ${userId} | Balance: ${initialBalance}`);

      if (!userId || initialBalance <= 0) {
        const skipReason = !userId ? "Missing userId field" : "Invalid balance value";
        auditData.push({ 
          login, 
          skipped: true, 
          reason: skipReason,
          raw_data_snapshot: data 
        });
        continue;
      }

      // FETCH TRADES
      console.log(`>>> [AUDIT-TRADES] Fetching trades for User ${userId}...`);
      const tradesSnap = await db.collection('users').doc(userId).collection('trades').get();
      const rawTrades = tradesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      console.log(`>>> [AUDIT-TRADES-RESULT] Found ${rawTrades.length} trades for ${login}`);

      // CALCULATION: Rule Thresholds
      const threshold3Pct = initialBalance * 0.03;
      
      // ENFORCEMENT
      const enriched = enrichTrades(rawTrades, login);
      let breached = false;
      let reason = "";

      for (const t of enriched) {
        const profit = t.pnl || 0;
        const duration = t.durationSeconds || 0;

        // Rule 1: Max Single Loss (3% of initial balance)
        if (profit < 0 && Math.abs(profit) > threshold3Pct) {
          breached = true;
          reason = `Retroactive breach: Single trade loss -$${Math.abs(profit).toFixed(2)} exceeds 3% limit ($${threshold3Pct.toFixed(2)}) (Ticket: ${t.id})`;
          break;
        }

        // Rule 2: Min Duration (120s)
        if (t.matched && duration > 0 && duration < 120 && profit !== 0) {
          breached = true;
          reason = `Retroactive breach: Trade duration ${duration}s is under 120s minimum required (Ticket: ${t.id})`;
          break;
        }
      }

      auditData.push({ 
        login, 
        initialBalanceUsed: initialBalance, 
        totalTrades: rawTrades.length,
        breachDetected: breached,
        reason: breached ? reason : "Compliant"
      });

      // WRITE: Commit breach to Firestore if detected
      if (breached) {
        breachCount++;
        console.log(`>>> [AUDIT-ENFORCE] VIOLATION DETECTED for ${login}: ${reason}`);
        
        try {
          // 1. Update MT5 Account Status
          await doc.ref.update({ 
            status: 'breached', 
            breachReason: reason, 
            breachedAt: FieldValue.serverTimestamp() 
          });
          
          // 2. Update User Profile Status
          await db.collection('users').doc(userId).update({ 
            accountStatus: 'breached', 
            breachReason: reason, 
            breachedAt: FieldValue.serverTimestamp() 
          });

          // 3. Create Entry in Breaches Ledger (CRITICAL: For Admin UI)
          await db.collection('breaches').add({
            userId,
            userName: data.name || 'Trader',
            userEmail: data.email || 'N/A',
            login: login,
            breachType: 'hard',
            breachReason: reason,
            breachedAt: FieldValue.serverTimestamp()
          });

          console.log(`>>> [AUDIT-WRITE-SUCCESS] Firestore records updated for ${login}`);
        } catch (writeErr: any) {
          console.error(`>>> [AUDIT-WRITE-FAIL] Failed to update ${login}: ${writeErr.message}`);
        }
      }
    }

    return { 
      success: true, 
      breachCount, 
      auditData, 
      version: AUDIT_VERSION 
    };

  } catch (error: any) {
    console.error(`>>> [AUDIT-FATAL] ${error.message}`);
    return { success: false, error: error.message, version: AUDIT_VERSION };
  }
}

function serializeFirestoreData(data: any): any {
  if (data === null || data === undefined) return data;
  if (data && typeof data.toDate === 'function') return data.toDate().toISOString();
  if (Array.isArray(data)) return data.map(item => serializeFirestoreData(item));
  if (typeof data === 'object' && data.constructor.name === 'Object') {
    const serialized: any = {};
    for (const [key, value] of Object.entries(data)) serialized[key] = serializeFirestoreData(value);
    return serialized;
  }
  return data;
}

async function generateAndSendCertificate(userId: string, userName: string, userEmail: string, phase: string, plan: string, size: number) {
  try {
    const db = getAdminDb();
    const app = getAdminApp();
    const storage = getStorage(app);
    const bucket = storage.bucket();
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([600, 400]);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const isFunded = phase === 'funded';
    const title = isFunded ? 'CERTIFICATE OF FUNDING' : 'CERTIFICATE OF ACHIEVEMENT';
    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    page.drawRectangle({ x: 20, y: 20, width: 560, height: 360, borderColor: rgb(0.06, 0.7, 0.96), borderWidth: 2 });
    page.drawText(title, { x: 50, y: 320, size: 28, font: fontBold, color: rgb(0, 0, 0) });
    page.drawText('This certificate is proudly presented to', { x: 50, y: 280, size: 12, font: fontRegular });
    page.drawText(userName, { x: 50, y: 245, size: 24, font: fontBold, color: rgb(0.06, 0.7, 0.96) });
    page.drawText(`For successfully completing requirements for the ${plan} challenge.`, { x: 50, y: 215, size: 12, font: fontRegular });
    page.drawText(`Account Size: $${size.toLocaleString()}`, { x: 50, y: 190, size: 14, font: fontRegular });
    page.drawText(`Date issued: ${dateStr}`, { x: 50, y: 100, size: 11, font: fontRegular });
    const pdfBytes = await pdfDoc.save();
    const fileName = `certificates/${userId}/${phase}-${Date.now()}.pdf`;
    const file = bucket.file(fileName);
    await file.save(Buffer.from(pdfBytes), { contentType: 'application/pdf' });
    const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(fileName)}?alt=media`;
    await db.collection('users').doc(userId).update({ certificates: FieldValue.arrayUnion({ url: publicUrl, label: isFunded ? 'Funding Certificate' : `Phase Pass: ${phase.toUpperCase()}`, date: new Date().toISOString(), phase, plan }) });
    return { success: true, url: publicUrl };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function fetchAdminTerminalData() {
  try {
    const db = getAdminDb();
    const [users, orders, payouts, referrals, broadcasts, breaches] = await Promise.all([
      db.collection('users').get().then(s => s.docs.map(d => ({ id: d.id, ...serializeFirestoreData(d.data()) }))),
      db.collection('orders').orderBy('submittedAt', 'desc').limit(100).get().then(s => s.docs.map(d => ({ id: d.id, ...serializeFirestoreData(d.data()) }))),
      db.collection('payouts').orderBy('date', 'desc').limit(100).get().then(s => s.docs.map(d => ({ id: d.id, ...serializeFirestoreData(d.data()) }))),
      db.collection('referrals').orderBy('createdAt', 'desc').limit(100).get().then(s => s.docs.map(d => ({ id: d.id, ...serializeFirestoreData(d.data()) }))),
      db.collection('broadcasts').orderBy('sentAt', 'desc').limit(20).get().then(s => s.docs.map(d => ({ id: d.id, ...serializeFirestoreData(d.data()) }))),
      db.collection('breaches').orderBy('breachedAt', 'desc').limit(100).get().then(s => s.docs.map(d => ({ id: d.id, ...serializeFirestoreData(d.data()) }))),
    ]);
    return { users, orders, payouts, referrals, broadcasts, breaches, success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function registerMt5AccountAction(data: any) {
  try {
    const db = getAdminDb();
    const userRef = db.collection('users').doc(data.userId);
    const userSnap = await userRef.get();
    if (!userSnap.exists) throw new Error("Trader not found.");
    const batch = db.batch();
    const accountRef = db.collection('mt5_accounts').doc();
    batch.set(accountRef, { login: String(data.login), mt5Password: data.password, userId: data.userId, accountPlan: data.plan, accountBalance: Number(data.size), balance: Number(data.size), equity: Number(data.size), phase: data.phase, status: "active", createdAt: FieldValue.serverTimestamp() });
    batch.update(userRef, { accountPlan: data.plan, accountSize: `$${(data.size / 1000)}k`, accountBalance: Number(data.size), accountStatus: "active", currentPhase: data.phase, liveBalance: Number(data.size), liveEquity: Number(data.size), mt5Login: data.login, mt5Password: data.password, updatedAt: FieldValue.serverTimestamp() });
    await batch.commit();
    await generateAndSendCertificate(data.userId, userSnap.data()!.name || 'Trader', userSnap.data()!.email, data.phase, data.plan, Number(data.size));
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function advanceTraderPhaseAction(userId: string) {
  try {
    const db = getAdminDb();
    const userRef = db.collection('users').doc(userId);
    const userSnap = await userRef.get();
    const userData = userSnap.data()!;
    const currentPhase = userData.currentPhase || 'evaluation';
    let nextPhase = 'funded';
    if (userData.accountPlan?.toLowerCase().includes('2-step')) {
      nextPhase = currentPhase === 'phase1' ? 'phase2' : 'funded';
    }
    await userRef.update({ currentPhase: nextPhase, updatedAt: FieldValue.serverTimestamp() });
    await generateAndSendCertificate(userId, userData.name || 'Trader', userData.email, nextPhase, userData.accountPlan || 'Challenge', Number(userData.accountBalance || 100000));
    return { success: true, nextPhase };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function logSoftBreachAction(userId: string, reason: string, note?: string) {
  try {
    const db = getAdminDb();
    await db.collection('breaches').add({ userId, breachType: 'soft', breachReason: reason, adminNote: note || '', breachedAt: FieldValue.serverTimestamp() });
    await db.collection('users').doc(userId).update({ readyForPhaseReset: true, updatedAt: FieldValue.serverTimestamp() });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function resetPhaseProgressAction(userId: string) {
  try {
    const db = getAdminDb();
    const userRef = db.collection('users').doc(userId);
    const userSnap = await userRef.get();
    const initial = parseFloat(String(userSnap.data()!.accountBalance || 100000));
    await userRef.update({ readyForPhaseReset: false, liveBalance: initial, liveEquity: initial, updatedAt: FieldValue.serverTimestamp() });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function manualGenerateCertificateAction(userId: string) {
  const db = getAdminDb();
  const user = await db.collection('users').doc(userId).get();
  if (!user.exists) return { success: false, error: "Not found" };
  const d = user.data()!;
  return generateAndSendCertificate(userId, d.name, d.email, d.currentPhase, d.accountPlan, Number(d.accountBalance));
}

export async function updateOrderStatusAction(id: string, status: string) {
  const db = getAdminDb();
  await db.collection('orders').doc(id).update({ status, updatedAt: FieldValue.serverTimestamp() });
  return { success: true };
}

export async function updatePayoutStatusAction(id: string, status: string) {
  const db = getAdminDb();
  await db.collection('payouts').doc(id).update({ status, updatedAt: FieldValue.serverTimestamp() });
  return { success: true };
}

export async function processKycAction(id: string, status: string, reason?: string) {
  const db = getAdminDb();
  const updates: any = { kycStatus: status, kycVerified: status === 'verified', updatedAt: FieldValue.serverTimestamp() };
  if (reason) updates.kycRejectionReason = reason;
  await db.collection('users').doc(id).update(updates);
  return { success: true };
}

export async function createBroadcastAction(title: string, message: string) {
  const db = getAdminDb();
  await db.collection('broadcasts').add({ title, message, sentAt: FieldValue.serverTimestamp() });
  return { success: true };
}

export async function deleteBroadcastAction(id: string) {
  const db = getAdminDb();
  await db.collection('broadcasts').doc(id).delete();
  return { success: true };
}

export async function updateUserProfileAction(id: string, data: any) {
  const db = getAdminDb();
  await db.collection('users').doc(id).update({ ...data, updatedAt: FieldValue.serverTimestamp() });
  return { success: true };
}
