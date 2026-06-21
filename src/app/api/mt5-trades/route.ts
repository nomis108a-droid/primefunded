import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { auditAccount } from '@/lib/rulesEngine';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BLOCKED_LOGINS = ['757003491'];

function getAdminDb() {
  if (!getApps().length) {
    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (!serviceAccountKey) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_KEY');
    const serviceAccount = JSON.parse(serviceAccountKey.startsWith("'") ? serviceAccountKey.slice(1, -1) : serviceAccountKey);
    initializeApp({ credential: cert(serviceAccount) });
  }
  return getFirestore();
}

export async function POST(request: Request) {
  try {
    // Resilient payload parsing to prevent crashes on empty/ping requests
    let payload: any = {};
    try {
      const contentType = request.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        payload = await request.json();
      }
    } catch (e) {
      // Body was empty or invalid, proceed with empty payload
    }

    const loginStr = String(payload.login || payload.accountId || '').trim();

    // DENYLIST CHECK: Exit immediately for blocked accounts (No logging, no processing)
    if (BLOCKED_LOGINS.includes(loginStr)) {
      return new Response(JSON.stringify({ status: "OK" }), { status: 200 });
    }

    // SECURITY: Verify MT5 API Key
    const apiKey = request.headers.get('x-api-key');
    if (apiKey !== process.env.MT5_API_KEY) {
      return new Response(JSON.stringify({ status: "UNAUTHORIZED" }), { status: 401 });
    }

    if (!loginStr) return new Response(JSON.stringify({ status: "ERROR", message: "Missing login" }), { status: 400 });

    const db = getAdminDb();
    const accountsRef = db.collection('mt5_accounts');
    let accountDoc = null;
    
    // 1. PRIORITY #1: Direct Document ID Lookup
    const d1 = await accountsRef.doc(loginStr).get();
    if (d1.exists) {
      accountDoc = d1;
    }

    // 2. PRIORITY #2: Field Query (String match)
    if (!accountDoc) {
      const q1 = await accountsRef.where('login', '==', loginStr).limit(1).get();
      if (!q1.empty) {
        accountDoc = q1.docs[0];
      }
    }

    // 3. PRIORITY #3: Field Query (Numeric match for legacy)
    if (!accountDoc && !isNaN(Number(loginStr))) {
      const q2 = await accountsRef.where('login', '==', Number(loginStr)).limit(1).get();
      if (!q2.empty) {
        accountDoc = q2.docs[0];
      }
    }
    
    if (!accountDoc) {
      return new Response(JSON.stringify({ status: "OK", note: "Account not found" }), { status: 200 });
    }

    const accountData = accountDoc.data()!;
    const userId = accountData.userId;

    if (!userId) return new Response(JSON.stringify({ status: "OK", note: "No user linked" }), { status: 200 });

    if (accountData.status === 'breached') {
      return new Response(JSON.stringify({ status: "OK", note: "Account breached, trade records ignored" }), { status: 200 });
    }

    const trades = payload.trades || [];
    const batch = db.batch();
    for (const trade of trades) {
      const tradeRef = db.collection('users').doc(userId).collection('trades').doc(String(trade.ticket));
      batch.set(tradeRef, {
        ticket: trade.ticket,
        symbol: trade.symbol,
        type: trade.type,
        volume: Math.max(0.01, trade.volume),
        price: trade.price,
        pnl: trade.profit,
        openTime: trade.openTime || null,
        closeTime: trade.time || null,
        date: new Date(trade.time * 1000),
        createdAt: FieldValue.serverTimestamp(),
        login: loginStr,
      }, { merge: true });
    }
    
    await batch.commit();
    await accountDoc.ref.update({ lastMT5Update: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });

    if (accountData.status !== 'breached' && trades.length > 0) {
      try {
        await auditAccount({ id: accountDoc.id, ...accountData });
      } catch (auditErr: any) {
        // Silently log audit failure to avoid breaking EA sync
      }
    }

    return new Response(JSON.stringify({ status: "OK", saved: trades.length }), { status: 200 });
  } catch (error: any) {
    return new Response(JSON.stringify({ status: "ERROR", message: error.message }), { status: 500 });
  }
}
