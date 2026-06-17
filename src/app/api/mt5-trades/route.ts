import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getTradeDate, enrichTrades } from '@/lib/tradeUtils';
import { RULES_CONFIG, getPlanKey } from '@/lib/rulesConfig';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function getAdminDb() {
  if (!getApps().length) {
    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (!serviceAccountKey) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_KEY');
    const serviceAccount = JSON.parse(serviceAccountKey);
    initializeApp({ credential: cert(serviceAccount) });
  }
  return getFirestore();
}

export async function POST(request: Request) {
  try {
    // SECURITY: Verify MT5 API Key
    const apiKey = request.headers.get('x-api-key');
    if (apiKey !== process.env.MT5_API_KEY) {
      return new Response(JSON.stringify({ status: "UNAUTHORIZED" }), { status: 401 });
    }

    const db = getAdminDb();
    const payload = await request.json();
    const loginStr = String(payload.login || '');
    const trades = payload.trades || [];

    if (!loginStr) return new Response(JSON.stringify({ status: "ERROR", message: "Missing login" }), { status: 400 });

    const accountsRef = db.collection('mt5_accounts');
    let snapshot = await accountsRef.where('login', '==', loginStr).limit(1).get();
    
    if (snapshot.empty) return new Response(JSON.stringify({ status: "OK", note: "Account not found" }), { status: 200 });

    const accountDoc = snapshot.docs[0];
    const accountData = accountDoc.data();
    const userId = accountData.userId;

    if (!userId) return new Response(JSON.stringify({ status: "OK", note: "No user linked" }), { status: 200 });

    // 1. Save Trades securely
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
      }, { merge: true });
    }
    await batch.commit();

    return new Response(JSON.stringify({ status: "OK", saved: trades.length }), { status: 200 });
  } catch (error: any) {
    return new Response(JSON.stringify({ status: "ERROR", message: error.message }), { status: 500 });
  }
}