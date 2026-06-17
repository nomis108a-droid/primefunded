'use server';

import { getApps, initializeApp, cert, type App } from 'firebase-admin/app';
import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { getPlanKey } from '@/lib/rulesConfig';

/**
 * @fileOverview Administrative Server Actions
 * Uses Firebase Admin SDK to perform high-privilege operations that bypass Security Rules.
 * Requires FIREBASE_SERVICE_ACCOUNT_KEY environment variable.
 */

function getAdminApp(): App {
  const existingApps = getApps();
  if (existingApps.length) return existingApps[0];

  let serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!serviceAccountKey) {
    throw new Error('Administrative terminal requires FIREBASE_SERVICE_ACCOUNT_KEY');
  }

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

/**
 * Helper to recursively convert Firestore Timestamps to ISO Strings for Next.js serialization.
 */
function serializeFirestoreData(data: any): any {
  if (data === null || data === undefined) return data;
  if (data && typeof data.toDate === 'function') {
    return data.toDate().toISOString();
  }
  if (Array.isArray(data)) {
    return data.map(item => serializeFirestoreData(item));
  }
  if (typeof data === 'object' && data.constructor.name === 'Object') {
    const serialized: any = {};
    for (const [key, value] of Object.entries(data)) {
      serialized[key] = serializeFirestoreData(value);
    }
    return serialized;
  }
  return data;
}

/**
 * Generates a PDF certificate, uploads it to storage, and queues a congratulatory email.
 */
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

    // 1. Generate PDF Certificate
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([600, 400]);
    const { width, height } = page.getSize();
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const isFunded = phase === 'funded';
    const title = isFunded ? 'CERTIFICATE OF FUNDING' : 'CERTIFICATE OF ACHIEVEMENT';
    const subTitle = isFunded ? 'Live Institutional Funding Granted' : `Evaluation Passed: ${phase.toUpperCase()}`;
    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    // Decorative border (Prime Cyan)
    page.drawRectangle({
      x: 20, y: 20, width: width - 40, height: height - 40,
      borderColor: rgb(0.06, 0.7, 0.96),
      borderWidth: 2,
    });

    page.drawText(title, { x: 50, y: 320, size: 28, font: fontBold, color: rgb(0, 0, 0) });
    page.drawText('This certificate is proudly presented to', { x: 50, y: 280, size: 12, font: fontRegular });
    page.drawText(userName, { x: 50, y: 245, size: 24, font: fontBold, color: rgb(0.06, 0.7, 0.96) });
    page.drawText(`For successfully completing institutional requirements for the ${plan} challenge.`, { x: 50, y: 215, size: 12, font: fontRegular });
    page.drawText(`Account Size: $${size.toLocaleString()}`, { x: 50, y: 190, size: 14, font: fontRegular });
    page.drawText(`Achievement: ${subTitle}`, { x: 50, y: 165, size: 14, font: fontBold });
    page.drawText(`Date issued: ${dateStr}`, { x: 50, y: 100, size: 11, font: fontRegular });
    page.drawText('PRIME FUNDED GLOBAL COMPLIANCE', { x: 380, y: 50, size: 9, font: fontBold });

    const pdfBytes = await pdfDoc.save();

    // 2. Upload to Storage
    const fileName = `certificates/${userId}/${phase}-${Date.now()}.pdf`;
    const file = bucket.file(fileName);
    await file.save(Buffer.from(pdfBytes), {
      contentType: 'application/pdf',
      metadata: { cacheControl: 'public, max-age=31536000' }
    });
    
    // Construct public-access URL (Firebase Storage format)
    const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(fileName)}?alt=media`;

    const certData = {
      url: publicUrl,
      label: isFunded ? 'Institutional Funding Certificate' : `Phase Achievement: ${phase.toUpperCase()}`,
      date: new Date().toISOString(),
      phase,
      plan
    };

    // 3. Update User Document Portfolio
    const userRef = db.collection('users').doc(userId);
    await userRef.update({
      certificates: FieldValue.arrayUnion(certData)
    });

    // 4. Queue Congratulatory Email (Trigger Email Extension)
    await db.collection('mail').add({
      to: userEmail,
      message: {
        subject: isFunded ? "🎉 Congratulations - You're Now a Funded Trader!" : `🏆 Congratulations - Stage Passed: ${phase.toUpperCase()}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff; color: #0f172a;">
            <div style="text-align: center; margin-bottom: 24px;">
              <h1 style="color: #11b3f5; font-size: 28px; margin: 0;">Institutional Milestone Reached</h1>
            </div>
            <p style="font-size: 16px; line-height: 1.6;">Hello <strong>${userName}</strong>,</p>
            <p style="font-size: 16px; line-height: 1.6;">Our compliance desk has verified your trading performance. We are pleased to confirm that you have met all targets for the <strong>${plan} ${size.toLocaleString()}</strong> challenge.</p>
            <p style="font-size: 16px; line-height: 1.6;">Attached to your dashboard is your official achievement certificate.</p>
            <div style="margin: 40px 0; text-align: center;">
              <a href="${publicUrl}" style="background-color: #11b3f5; color: #ffffff; padding: 16px 32px; text-decoration: none; border-radius: 12px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">Download My Certificate</a>
            </div>
            <p style="font-size: 14px; color: #64748b; font-style: italic;">Note: Your new credentials have been provisioned and are ready for use in the Trader Terminal.</p>
            <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 30px 0;">
            <p style="font-size: 12px; color: #94a3b8; text-align: center;">PrimeFunded Global | Institutional Prop Trading Platform</p>
          </div>
        `
      }
    });

    return { success: true, url: publicUrl };
  } catch (error: any) {
    console.error('[Certificate-Service] Critical Failure:', error);
    return { success: false, error: error.message };
  }
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

export async function updateOrderStatusAction(orderId: string, status: 'verified' | 'rejected', reason?: string) {
  try {
    const db = getAdminDb();
    const orderRef = db.collection('orders').doc(orderId);
    const updates: any = { status, updatedAt: FieldValue.serverTimestamp() };
    if (reason) updates.rejectionReason = reason;
    await orderRef.update(updates);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function updatePayoutStatusAction(payoutId: string, status: 'approved' | 'rejected' | 'done', reason?: string) {
  try {
    const db = getAdminDb();
    const payoutRef = db.collection('payouts').doc(payoutId);
    const updates: any = { status, updatedAt: FieldValue.serverTimestamp() };
    if (reason) updates.adminNote = reason;
    await payoutRef.update(updates);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

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

export async function deleteBroadcastAction(id: string) {
  try {
    const db = getAdminDb();
    await db.collection('broadcasts').doc(id).delete();
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

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
    const userRef = db.collection('users').doc(data.userId);
    const userSnap = await userRef.get();
    if (!userSnap.exists) throw new Error("Trader document not found.");
    const userData = userSnap.data()!;

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
      dailyStartBalance: data.size,
      dailyDrawdownPct: 0,
      maxDrawdownPct: 0,
      createdAt: FieldValue.serverTimestamp(),
      lastMT5Update: null,
    };

    await accountRef.set(accountData);

    await userRef.update({
      accountBalance: data.size,
      accountSize: `$${(data.size / 1000)}k`.replace('.0k', 'k'),
      accountPlan: data.plan,
      accountStatus: "active",
      accountActive: true,
      currentPhase: data.phase,
      liveBalance: data.size,
      liveEquity: data.size,
      dailyStartBalance: data.size,
      mt5Login: data.login,
      mt5Password: data.password,
      mt5Server: "MetaQuotes-Demo",
      readyForPhaseAdvancement: false,
      readyForPhaseReset: false,
      activatedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    await userRef.collection('notifications').add({
      title: "✅ Institutional Account Ready",
      message: `Your ${data.plan} account with $${data.size.toLocaleString()} is now active at stage: ${data.phase.toUpperCase()}.`,
      type: 'challenge_passed',
      isRead: false,
      createdAt: FieldValue.serverTimestamp()
    });

    // Handle Certificate Delivery for Passing/Funding
    if (data.phase && data.phase !== 'evaluation' && data.phase !== 'phase1') {
      try {
        await generateAndSendCertificate(
          data.userId,
          userData.name || 'Trader',
          userData.email,
          data.phase,
          data.plan,
          data.size
        );
      } catch (certErr) {
        console.error('[Certificate-Trigger] Failed to generate:', certErr);
      }
    }

    return { success: true, docId: accountRef.id };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function advanceTraderPhaseAction(userId: string) {
  try {
    const db = getAdminDb();
    const userRef = db.collection('users').doc(userId);
    const userSnap = await userRef.get();
    if (!userSnap.exists) throw new Error("Trader not found.");
    const userData = userSnap.data()!;

    const currentPhase = userData.currentPhase || 'evaluation';
    const plan = userData.accountPlan || '1-Step Pro';
    const planKey = getPlanKey(plan);
    const size = parseFloat(String(userData.accountBalance || 100000));

    // Simple advancement logic
    let nextPhase = 'funded';
    if (planKey.includes('1-step')) {
      nextPhase = 'funded';
    } else if (planKey.includes('2-step')) {
      nextPhase = currentPhase === 'phase1' ? 'phase2' : 'funded';
    } else if (planKey.includes('3-step')) {
      if (currentPhase === 'phase1') nextPhase = 'phase2';
      else if (currentPhase === 'phase2') nextPhase = 'phase3';
      else nextPhase = 'funded';
    }

    // Provision new phase credentials (reusing manual logic)
    // In a real scenario, this would generate new credentials via API
    // For now, we update the existing phase and clear the advancement flag
    await userRef.update({
      currentPhase: nextPhase,
      readyForPhaseAdvancement: false,
      updatedAt: FieldValue.serverTimestamp()
    });

    // Also update mt5_accounts link
    const accountsRef = db.collection('mt5_accounts');
    const accSnap = await accountsRef.where('userId', '==', userId).limit(1).get();
    if (!accSnap.empty) {
      await accSnap.docs[0].ref.update({
        phase: nextPhase,
        readyForPhaseAdvancement: false
      });
    }

    await userRef.collection('notifications').add({
      title: "🚀 Phase Advanced",
      message: `Congratulations! Your account has been advanced to: ${nextPhase.toUpperCase()}.`,
      type: 'challenge_passed',
      isRead: false,
      createdAt: FieldValue.serverTimestamp()
    });

    // Record in historical ledger
    await userRef.collection('phaseHistory').add({
      phase: nextPhase,
      plan,
      accountSize: userData.accountSize,
      advancedAt: FieldValue.serverTimestamp()
    });

    // Trigger Certificate & Email
    try {
      await generateAndSendCertificate(
        userId,
        userData.name || 'Trader',
        userData.email,
        nextPhase,
        plan,
        size
      );
    } catch (certErr) {
      console.error('[Phase-Advancement-Cert] Error:', certErr);
    }

    return { success: true, nextPhase };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function processKycAction(userId: string, action: 'verified' | 'rejected', reason?: string) {
  try {
    const db = getAdminDb();
    const userRef = db.collection('users').doc(userId);
    const updates: any = { kycStatus: action, kycVerified: action === 'verified', updatedAt: FieldValue.serverTimestamp() };
    if (action === 'rejected' && reason) updates.kycRejectionReason = reason;
    await userRef.update(updates);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function updateUserProfileAction(userId: string, data: any) {
  try {
    const db = getAdminDb();
    const userRef = db.collection('users').doc(userId);
    const userSnap = await userRef.get();
    if (!userSnap.exists) throw new Error("Trader not found.");
    const currentData = userSnap.data()!;

    const allowedFields = ['name', 'phone', 'country', 'tier', 'status', 'referralCode', 'currentPhase'];
    const updates: any = {};
    allowedFields.forEach(field => { if (data[field] !== undefined) updates[field] = data[field]; });
    updates.updatedAt = FieldValue.serverTimestamp();
    
    await userRef.update(updates);

    // FIX: If admin manually updates phase to a milestone, trigger certificate logic
    const newPhase = data.currentPhase;
    const oldPhase = currentData.currentPhase;

    if (newPhase && newPhase !== oldPhase && (newPhase === 'funded' || newPhase.includes('phase'))) {
      try {
        await generateAndSendCertificate(
          userId,
          data.name || currentData.name || 'Trader',
          currentData.email,
          newPhase,
          currentData.accountPlan || 'Challenge',
          parseFloat(String(currentData.accountBalance || 100000))
        );
      } catch (certErr) {
        console.error('[Manual-Update-Cert] Error:', certErr);
      }
    }

    return { success: true };
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
    const userData = userSnap.data()!;

    const breachRef = db.collection('breaches').doc();
    await breachRef.set({
      userId,
      userEmail: userData.email,
      userName: userData.name,
      plan: userData.accountPlan || 'N/A',
      phase: userData.currentPhase || 'N/A',
      breachType: 'soft',
      breachReason: reason,
      adminNote: note || '',
      breachedAt: FieldValue.serverTimestamp()
    });

    await userRef.update({
      readyForPhaseReset: true,
      updatedAt: FieldValue.serverTimestamp()
    });

    await userRef.collection('notifications').add({
      title: "⚠️ Compliance Warning",
      message: `A soft rule violation was recorded: ${reason}. Please contact support or request a phase reset.`,
      type: 'soft_breach_warning',
      isRead: false,
      createdAt: FieldValue.serverTimestamp()
    });

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
    if (!userSnap.exists) throw new Error("Trader not found.");
    const userData = userSnap.data()!;

    const initialBalance = parseFloat(String(userData.accountBalance || 100000));

    await userRef.update({
      readyForPhaseReset: false,
      readyForPhaseAdvancement: false,
      liveBalance: initialBalance,
      liveEquity: initialBalance,
      dailyStartBalance: initialBalance,
      updatedAt: FieldValue.serverTimestamp()
    });

    // Also update mt5_accounts link if it exists
    const accountsRef = db.collection('mt5_accounts');
    const accSnap = await accountsRef.where('userId', '==', userId).limit(1).get();
    if (!accSnap.empty) {
      await accSnap.docs[0].ref.update({
        status: 'active',
        balance: initialBalance,
        equity: initialBalance,
        dailyStartBalance: initialBalance,
        readyForPhaseAdvancement: false
      });
    }

    await userRef.collection('notifications').add({
      title: "🔄 Phase Progress Reset",
      message: "Your evaluation progress has been reset as requested. You may now resume trading from your starting balance.",
      type: 'payout_processed',
      isRead: false,
      createdAt: FieldValue.serverTimestamp()
    });

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
