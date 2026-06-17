'use server';

import { getApps, initializeApp, cert, type App, getApp } from 'firebase-admin/app';
import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { getPlanKey, RULES_CONFIG } from '@/lib/rulesConfig';
import { enrichTrades, getTradeDate } from '@/lib/tradeUtils';

const AUDIT_VERSION = "2024-06-18-PROBE-01";

function getAdminApp(): App {
  const existingApps = getApps();
  // Look for our specific admin app first
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
 * Returns the raw count and IDs from the mt5_accounts collection.
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
      projectId: getAdminApp().options.projectId // Verify which project we are hitting
    };
  } catch (error: any) {
    console.error(">>> [PROBE] FAILED:", error.message);
    return { success: false, error: error.message };
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

async function generateAndSendCertificate(
  userId: string,
  userName: string,
  userEmail: string,
  phase: string,
  plan: string,
  size: number
) {
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

    page.drawRectangle({
      x: 20, y: 20, width: 560, height: 360,
      borderColor: rgb(0.06, 0.7, 0.96),
      borderWidth: 2,
    });

    page.drawText(title, { x: 50, y: 320, size: 28, font: fontBold, color: rgb(0, 0, 0) });
    page.drawText('This certificate is proudly presented to', { x: 50, y: 280, size: 12, font: fontRegular });
    page.drawText(userName, { x: 50, y: 245, size: 24, font: fontBold, color: rgb(0.06, 0.7, 0.96) });
    page.drawText(`For successfully completing requirements for the ${plan} challenge.`, { x: 50, y: 215, size: 12, font: fontRegular });
    page.drawText(`Account Size: $${size.toLocaleString()}`, { x: 50, y: 190, size: 14, font: fontRegular });
    page.drawText(`Date issued: ${dateStr}`, { x: 50, y: 100, size: 11, font: fontRegular });
    page.drawText('PRIME FUNDED GLOBAL COMPLIANCE', { x: 380, y: 50, size: 9, font: fontBold });

    const pdfBytes = await pdfDoc.save();
    const fileName = `certificates/${userId}/${phase}-${Date.now()}.pdf`;
    const file = bucket.file(fileName);
    await file.save(Buffer.from(pdfBytes), { contentType: 'application/pdf' });
    
    const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(fileName)}?alt=media`;

    await db.collection('users').doc(userId).update({
      certificates: FieldValue.arrayUnion({
        url: publicUrl,
        label: isFunded ? 'Funding Certificate' : `Phase Pass: ${phase.toUpperCase()}`,
        date: new Date().toISOString(),
        phase,
        plan
      })
    });

    await db.collection('mail').add({
      to: userEmail,
      message: {
        subject: isFunded ? "🎉 You're Now Funded!" : `🏆 Stage Passed: ${phase.toUpperCase()}`,
        html: `<p>Congratulations ${userName}!</p><p>You have met all targets. View your certificate here: <a href="${publicUrl}">Download</a></p>`
      }
    });

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

/**
 * Institutional Retroactive Risk Auditor
 * RELAXED QUERY: Fetches all accounts to find the status mismatch.
 */
export async function runRetroactiveRiskAuditAction() {
  console.log(">>> [AUDIT] Institutional Audit Triggered via Server Action");
  const auditData: any[] = [];
  try {
    const db = getAdminDb();
    // Fetch all accounts to ensure we aren't missing anyone due to status filters
    const accounts = await db.collection('mt5_accounts').get();
    console.log(`>>> [AUDIT] Query returned ${accounts.docs.length} root accounts from mt5_accounts collection`);
    
    let breachCount = 0;

    for (const acc of accounts.docs) {
      const data = acc.data();
      const login = String(data.login || 'UNKNOWN');
      const status = String(data.status || 'MISSING');
      const userId = data.userId;
      const initialBalance = parseFloat(String(data.accountBalance || 0));

      console.log(`>>> [AUDIT] Evaluating Account ${login}: Status=${status}, User=${userId}, Balance=${initialBalance}`);

      if (status.toLowerCase() !== 'active') {
        console.log(`>>> [AUDIT] Skipping account ${login} because status is ${status}`);
        continue;
      }

      if (!userId || initialBalance <= 0) {
        console.log(`>>> [AUDIT] Skipping account ${login}: Incomplete data (Balance: ${initialBalance})`);
        continue;
      }

      const tradesSnap = await db.collection('users').doc(userId).collection('trades').get();
      const rawTrades = tradesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      
      const threshold = initialBalance * 0.03;
      // Extract absolute loss amounts for the debug log
      const allLosses = rawTrades.filter(t => (t.pnl || t.profit || 0) < 0).map(t => Math.abs(t.pnl || t.profit));
      const biggestLoss = allLosses.length > 0 ? Math.max(...allLosses) : 0;
      const isMaxLossBreached = biggestLoss > threshold;

      const debugObj = { 
        login, 
        initialBalanceUsed: initialBalance, 
        totalTrades: rawTrades.length,
        lossesFound: allLosses,
        biggestLoss,
        thresholdCalculated: threshold, 
        isMaxLossBreached
      };
      
      auditData.push(debugObj);

      const enriched = enrichTrades(rawTrades, login);
      let breached = false;
      let reason = "";

      // 1. Transaction-Level Violation Check
      for (const t of enriched) {
        const profit = t.pnl || 0;
        const duration = t.durationSeconds || 0;
        const ticket = t.id;

        // Rule 1: Max Single Loss (3% of initial balance)
        if (profit < 0 && Math.abs(profit) > threshold) {
          breached = true;
          reason = `Retroactive breach: Single trade loss -$${Math.abs(profit).toFixed(2)} exceeds 3% limit ($${threshold.toFixed(2)}) on $${initialBalance.toLocaleString()} account (Ticket: ${ticket})`;
          break;
        }

        // Rule 2: Min Duration (120s)
        if (t.matched && duration > 0 && duration < 120 && profit !== 0) {
          breached = true;
          reason = `Retroactive breach: Trade duration ${duration}s is under 120s minimum required (Ticket: ${ticket})`;
          break;
        }
      }

      // 2. Daily Drawdown Session Analysis
      if (!breached) {
        const sessionMap = new Map<string, number>();
        enriched.forEach(t => {
          if ((t.pnl || 0) < 0) {
            const date = getTradeDate(t.closeTime || t.time || t.date);
            if (date) {
              const adjusted = new Date(date.getTime() - (2 * 60 * 60 * 1000));
              const key = adjusted.toISOString().split('T')[0];
              sessionMap.set(key, (sessionMap.get(key) || 0) + Math.abs(t.pnl || 0));
            }
          }
        });

        const planKey = getPlanKey(data.accountPlan || '1-Step Pro');
        const phase = data.phase || 'evaluation';
        const rules = RULES_CONFIG.plans[planKey]?.[phase] || RULES_CONFIG.plans['1-step-pro']['evaluation'];
        const dailyLimit = initialBalance * (rules.dailyDrawdown / 100);

        for (const [date, loss] of sessionMap.entries()) {
          if (loss > dailyLimit) {
            breached = true;
            reason = `Retroactive breach: Daily Gross Loss of $${loss.toFixed(2)} on ${date} exceeded session limit of $${dailyLimit.toFixed(2)}`;
            break;
          }
        }
      }

      if (breached) {
        breachCount++;
        console.log(`>>> [AUDIT] WRITING status=breached for account ${login}: ${reason}`);
        
        try {
          await acc.ref.update({ 
            status: 'breached', 
            breachReason: reason, 
            breachedAt: FieldValue.serverTimestamp() 
          });
          
          await db.collection('users').doc(userId).update({ 
            accountStatus: 'breached', 
            breachReason: reason, 
            breachedAt: FieldValue.serverTimestamp() 
          });

          await db.collection('breaches').add({
            userId,
            login: String(login),
            userEmail: data.email || 'N/A',
            userName: data.name || 'N/A',
            breachReason: reason,
            breachType: 'hard',
            breachedAt: FieldValue.serverTimestamp()
          });
          console.log(`>>> [AUDIT] SUCCESS: Firestore write confirmed for ${login}`);
        } catch (writeError: any) {
          console.log(`>>> [AUDIT] PERSISTENCE FAILURE for account ${login}: ${writeError.message}`);
        }
      }
    }
    return { success: true, breachCount, auditData, version: AUDIT_VERSION };
  } catch (error: any) {
    console.log(`>>> [AUDIT] CRITICAL SYSTEM ERROR: ${error.message}`);
    return { success: false, error: error.message };
  }
}

export async function registerMt5AccountAction(data: any) {
  try {
    const db = getAdminDb();
    const userRef = db.collection('users').doc(data.userId);
    const userSnap = await userRef.get();
    if (!userSnap.exists) throw new Error("Trader not found.");

    const accountsRef = db.collection('mt5_accounts');
    const activeAccs = await accountsRef.where('userId', '==', data.userId).where('status', '==', 'active').get();
    const batch = db.batch();
    activeAccs.docs.forEach(doc => batch.update(doc.ref, { status: 'passed', updatedAt: FieldValue.serverTimestamp() }));

    const accountRef = db.collection('mt5_accounts').doc();
    batch.set(accountRef, {
      login: String(data.login),
      mt5Password: data.password,
      userId: data.userId,
      accountPlan: data.plan,
      accountBalance: Number(data.size),
      balance: Number(data.size),
      equity: Number(data.size),
      phase: data.phase,
      status: "active",
      dailyStartBalance: Number(data.size),
      createdAt: FieldValue.serverTimestamp(),
    });

    batch.update(userRef, {
      accountPlan: data.plan,
      accountSize: `$${(data.size / 1000)}k`,
      accountBalance: Number(data.size),
      accountStatus: "active",
      currentPhase: data.phase,
      liveBalance: Number(data.size),
      liveEquity: Number(data.size),
      dailyStartBalance: Number(data.size),
      mt5Login: data.login,
      mt5Password: data.password,
      readyForNextPhase: false,
      updatedAt: FieldValue.serverTimestamp(),
    });

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
    if (!userSnap.exists) throw new Error("User not found.");

    const userData = userSnap.data()!;
    const currentPhase = userData.currentPhase || 'evaluation';
    const plan = userData.accountPlan || '1-Step Pro';
    const planKey = plan.toLowerCase();

    let nextPhase = 'funded';
    if (planKey.includes('2-step')) {
      if (currentPhase === 'phase1') nextPhase = 'phase2';
      else nextPhase = 'funded';
    } else if (planKey.includes('3-step')) {
      if (currentPhase === 'phase1') nextPhase = 'phase2';
      else if (currentPhase === 'phase2') nextPhase = 'phase3';
      else nextPhase = 'funded';
    }

    const batch = db.batch();
    const sizeNum = userData.accountBalance || 100000;

    // Transition previous account docs
    const accountsRef = db.collection('mt5_accounts');
    const activeAccs = await accountsRef.where('userId', '==', userId).where('status', '==', 'active').get();
    activeAccs.docs.forEach(doc => batch.update(doc.ref, { status: 'passed', updatedAt: FieldValue.serverTimestamp() }));

    batch.update(userRef, {
      currentPhase: nextPhase,
      readyForNextPhase: false,
      liveBalance: sizeNum,
      liveEquity: sizeNum,
      dailyStartBalance: sizeNum,
      updatedAt: FieldValue.serverTimestamp()
    });

    await batch.commit();
    await generateAndSendCertificate(userId, userData.name || 'Trader', userData.email, nextPhase, plan, sizeNum);
    return { success: true, nextPhase };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function logSoftBreachAction(userId: string, reason: string, note?: string) {
  try {
    const db = getAdminDb();
    const userRef = db.collection('users').doc(userId);
    const userSnap = await userRef.get();
    if (!userSnap.exists) throw new Error("Trader not found.");

    await db.collection('breaches').add({
      userId,
      userEmail: userSnap.data()!.email,
      userName: userSnap.data()!.name,
      breachType: 'soft',
      breachReason: reason,
      adminNote: note || '',
      breachedAt: FieldValue.serverTimestamp()
    });

    await userRef.update({ readyForPhaseReset: true, updatedAt: FieldValue.serverTimestamp() });
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

    await userRef.update({
      readyForPhaseReset: false,
      liveBalance: initial,
      liveEquity: initial,
      dailyStartBalance: initial,
      updatedAt: FieldValue.serverTimestamp()
    });

    const accountsRef = db.collection('mt5_accounts');
    const accSnap = await accountsRef.where('userId', '==', userId).where('status', '==', 'active').limit(1).get();
    if (!accSnap.empty) {
      await accSnap.docs[0].ref.update({ balance: initial, equity: initial, dailyStartBalance: initial });
    }
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
  const userRef = db.collection('users').doc(id);
  const userSnap = await userRef.get();
  if (!userSnap.exists) throw new Error("User not found");

  const oldData = userSnap.data()!;
  const newPhase = data.currentPhase;
  
  await userRef.update({ ...data, updatedAt: FieldValue.serverTimestamp() });

  // If phase is changed manually to a milestone, trigger certificate/email
  if (newPhase !== oldData.currentPhase && ['phase1', 'phase2', 'phase3', 'funded'].includes(newPhase)) {
    await generateAndSendCertificate(id, oldData.name || 'Trader', oldData.email, newPhase, oldData.accountPlan || 'Challenge', Number(oldData.accountBalance || 100000));
  }

  return { success: true };
}
