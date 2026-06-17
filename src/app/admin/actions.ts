
'use server';

import { getApps, initializeApp, cert, type App } from 'firebase-admin/app';
import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { getPlanKey, RULES_CONFIG } from '@/lib/rulesConfig';
import { enrichTrades, getTradeDate } from '@/lib/tradeUtils';

function getAdminApp(): App {
  const existingApps = getApps();
  if (existingApps.length) return existingApps[0];

  let serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!serviceAccountKey) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_KEY');

  try {
    if (serviceAccountKey.startsWith("'") || serviceAccountKey.startsWith('"')) {
      serviceAccountKey = serviceAccountKey.slice(1, -1);
    }
    const serviceAccount = JSON.parse(serviceAccountKey);
    return initializeApp({
      credential: cert(serviceAccount),
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || `${serviceAccount.project_id}.firebasestorage.app`
    });
  } catch (e: any) {
    throw new Error(`Admin SDK Config Error: ${e.message}`);
  }
}

function getAdminDb(): Firestore {
  return getFirestore(getAdminApp());
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
 * Scans all active accounts for historical violations.
 * Includes Daily Drawdown session analysis.
 */
export async function runRetroactiveRiskAuditAction() {
  console.log(">>> [AUDIT] Institutional Audit Triggered via Server Action");
  try {
    const db = getAdminDb();
    const accounts = await db.collection('mt5_accounts').where('status', '==', 'active').get();
    console.log(`>>> [AUDIT] Found ${accounts.size} active accounts to process`);
    let breachCount = 0;

    for (const acc of accounts.docs) {
      const data = acc.data();
      const login = data.login;
      const initialBalance = parseFloat(String(data.accountBalance));
      const userId = data.userId;
      
      console.log(`>>> [AUDIT] STARTED for account: ${login} (Size: $${initialBalance}, User: ${userId})`);

      if (!userId || isNaN(initialBalance)) {
        console.log(`>>> [AUDIT] SKIPPING account ${login}: Missing critical data (userId or balance)`);
        continue;
      }

      const tradesSnap = await db.collection('users').doc(userId).collection('trades').get();
      console.log(`>>> [AUDIT] Analyzing ${tradesSnap.size} historical trades for ${login}`);
      
      const rawTrades = tradesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const enriched = enrichTrades(rawTrades, String(login));
      
      let breached = false;
      let reason = "";

      // 1. Transaction-Level Violation Check
      for (const t of enriched) {
        if (!t.closeTime) continue;

        const profit = t.pnl || 0;
        const duration = t.durationSeconds || 0;
        const ticket = t.id;

        // Rule 1: Max Single Loss (3% of initial balance)
        if (profit < 0 && Math.abs(profit) > initialBalance * 0.03) {
          breached = true;
          reason = `Retroactive breach: Single trade loss -$${Math.abs(profit).toFixed(2)} exceeds 3% limit ($${(initialBalance * 0.03).toFixed(2)}) on $${initialBalance.toLocaleString()} account (Ticket: ${ticket})`;
          console.log(`>>> [AUDIT] RULE VIOLATION (MAX LOSS) on account ${login}: ${reason}`);
          break;
        }

        // Rule 2: Min Duration (120s)
        if (t.matched && duration < 120 && profit !== 0) {
          breached = true;
          reason = `Retroactive breach: Trade duration ${duration}s is under 120s minimum required (Ticket: ${ticket})`;
          console.log(`>>> [AUDIT] RULE VIOLATION (DURATION) on account ${login}: ${reason}`);
          break;
        }
      }

      // 2. Daily Drawdown Session Analysis (Catch resets that hid breaches)
      if (!breached) {
        const sessionMap = new Map<string, number>();
        enriched.forEach(t => {
          if (t.closeTime && (t.pnl || 0) < 0) {
            const date = getTradeDate(t.closeTime);
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
            console.log(`>>> [AUDIT] RULE VIOLATION (DAILY DRAWDOWN) on account ${login}: ${reason}`);
            break;
          }
        }
      }

      if (breached) {
        breachCount++;
        console.log(`>>> [AUDIT] ATTEMPTING WRITE status=breached for account ${login}. Reason: ${reason}`);
        
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
          console.log(`>>> [AUDIT] PERSISTENCE SUCCESS for account ${login}`);
        } catch (writeError: any) {
          console.log(`>>> [AUDIT] PERSISTENCE FAILURE for account ${login}: ${writeError.message}`);
        }
      } else {
        console.log(`>>> [AUDIT] ACCOUNT CLEAN: ${login}`);
      }
    }
    console.log(`>>> [AUDIT] Process Complete. Breached ${breachCount} accounts.`);
    return { success: true, breachCount };
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
