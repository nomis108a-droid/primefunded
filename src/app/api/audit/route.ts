import { NextResponse } from 'next/server';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { auditAccount } from '@/lib/rulesEngine';

/**
 * @fileOverview Global Audit API Route
 * Triggers rule verification for all active MT5 nodes.
 */

function getAdminDb() {
  if (!getApps().length) {
    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (!serviceAccountKey) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_KEY');
    const serviceAccount = JSON.parse(serviceAccountKey);
    initializeApp({ credential: cert(serviceAccount) });
  }
  return getFirestore();
}

async function runGlobalAudit() {
  const db = getAdminDb();
  const snapshot = await db.collection('mt5_accounts').where('status', '==', 'active').get();
  
  const results = {
    totalChecked: snapshot.size,
    breachesDetected: 0,
    errors: 0,
    details: [] as any[]
  };

  for (const doc of snapshot.docs) {
    try {
      const res = await auditAccount({ id: doc.id, ...doc.data() });
      if (res?.breached) {
        results.breachesDetected++;
        results.details.push({ login: doc.id, status: 'breached', reason: res.reason });
      }
    } catch (err: any) {
      results.errors++;
      results.details.push({ login: doc.id, status: 'error', message: err.message });
    }
  }

  return results;
}

export async function POST() {
  try {
    const results = await runGlobalAudit();
    return NextResponse.json({ success: true, ...results });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const results = await runGlobalAudit();
    return NextResponse.json({ success: true, ...results });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
