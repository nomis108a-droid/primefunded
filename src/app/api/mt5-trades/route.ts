import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BLOCKED_LOGINS = ['757003491'];
const CACHE_TTL = 120_000; // 2 minutes
const accountCache = new Map<string, { data: any; id: string; ref: any; ts: number }>();

function getAdminDb() {
  if (!getApps().length) {
    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (!serviceAccountKey) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_KEY');
    const serviceAccount = JSON.parse(serviceAccountKey.startsWith("'") ? serviceAccountKey.slice(1, -1) : serviceAccountKey);
    initializeApp({ credential: cert(serviceAccount) });
  }
  return getFirestore();
}

async function getCachedAccount(db: any, loginStr: string) {
  const now = Date.now();
  const cached = accountCache.get(loginStr);
  if (cached && (now - cached.ts) < CACHE_TTL) return cached;
  const accountsRef = db.collection('mt5_accounts');
  const d1 = await accountsRef.doc(loginStr).get();
  if (d1.exists) {
    const entry = { data: d1.data(), id: d1.id, ref: d1.ref, ts: now };
    accountCache.set(loginStr, entry);
    return entry;
  }
  const loginVariants: (string | number)[] = !isNaN(Number(loginStr)) ? [loginStr, Number(loginStr)] : [loginStr];
  const q1 = await accountsRef.where('login', 'in', loginVariants).limit(1).get();
  if (!q1.empty) {
    const doc = q1.docs[0];
    const entry = { data: doc.data(), id: doc.id, ref: doc.ref, ts: now };
    accountCache.set(loginStr, entry);
    return entry;
  }
  return null;
}

export async function POST(request: Request) {
  try {
    let payload: any = {};
    try {
      const contentType = request.headers.get('content-type') || '';
      if (contentType.includes('application/json')) payload = await request.json();
    } catch (e) {}

    const loginStr = String(payload.login || payload.accountId || '').trim();
    if (BLOCKED_LOGINS.includes(loginStr)) return new Response(JSON.stringify({ status: "OK" }), { status: 200 });

    const apiKey = request.headers.get('x-api-key');
    if (apiKey !== process.env.MT5_API_KEY) return new Response(JSON.stringify({ status: "UNAUTHORIZED" }), { status: 401 });
    if (!loginStr) return new Response(JSON.stringify({ status: "ERROR", message: "Missing login" }), { status: 400 });

    const trades = payload.trades || [];
    if (trades.length === 0) return new Response(JSON.stringify({ status: "OK", note: "No trades" }), { status: 200 });

    const db = getAdminDb();
    const account = await getCachedAccount(db, loginStr);
    if (!account) return new Response(JSON.stringify({ status: "OK", note: "Account not found" }), { status: 200 });

    const { data: accountData, ref: accountRef } = account;
    const userId = accountData.userId;
    if (!userId) return new Response(JSON.stringify({ status: "OK", note: "No user linked" }), { status: 200 });
    if (accountData.status === 'breached') return new Response(JSON.stringify({ status: "OK", note: "Breached" }), { status: 200 });

    // ── Batch write all trades ───────────────────────────────
    const batch = db.batch();
    for (const trade of trades) {
      const tradeRef = db.collection('users').doc(userId).collection('trades').doc(String(trade.ticket));
      batch.set(tradeRef, {
        ticket: trade.ticket, symbol: trade.symbol, type: trade.type,
        volume: Math.max(0.01, trade.volume), price: trade.price, pnl: trade.profit,
        openTime: trade.openTime || null, closeTime: trade.time || null,
        date: new Date(trade.time * 1000), createdAt: FieldValue.serverTimestamp(), login: loginStr,
      }, { merge: true });
    }
    batch.update(accountRef, { lastMT5Update: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    await batch.commit();

    // ── Store daily closed losses for fast drawdown check ────
    const closedPnl = trades
      .filter((t: any) => t.time)
      .reduce((sum: number, t: any) => sum + (parseFloat(t.profit) || 0), 0);

    if (closedPnl < 0) {
      await accountRef.update({
        dailyClosedLosses: FieldValue.increment(Math.abs(closedPnl))
      });
      accountCache.delete(loginStr);
    }

    return new Response(JSON.stringify({ status: "OK", saved: trades.length }), { status: 200 });
  } catch (error: any) {
    return new Response(JSON.stringify({ status: "ERROR", message: error.message }), { status: 500 });
  }
}