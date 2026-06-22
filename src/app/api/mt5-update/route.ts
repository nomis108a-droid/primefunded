import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { RULES_CONFIG, getPlanKey } from '@/lib/rulesConfig';
import { auditAccount } from '@/lib/rulesEngine';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BLOCKED_LOGINS = ['757003491'];

const accountCache = new Map<string, { data: any; id: string; ref: any; ts: number }>();
const CACHE_TTL = 60_000;
const lastWrite = new Map<string, number>();
const WRITE_THROTTLE = 30_000;

const getTradingDayKey = (date: Date) => {
  const adjusted = new Date(date.getTime() - (2 * 60 * 60 * 1000));
  return adjusted.toISOString().split('T')[0];
};

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
      if (contentType.includes('application/json')) {
        payload = await request.json();
      } else if (contentType.includes('form-data') || contentType.includes('application/x-www-form-urlencoded')) {
        const formData = await request.formData();
        payload = Object.fromEntries(formData.entries());
      }
    } catch (e) {}

    const loginStr = String(payload.login || payload.accountId || '').trim();
    if (!loginStr || loginStr === 'undefined') {
      return new Response(JSON.stringify({ status: "ERROR", message: "Missing login" }), { status: 400 });
    }

    if (BLOCKED_LOGINS.includes(loginStr)) {
      return new Response(JSON.stringify({ status: "OK" }), { status: 200 });
    }

    const now = Date.now();
    const last = lastWrite.get(loginStr) || 0;
    if (now - last < WRITE_THROTTLE) {
      return new Response(JSON.stringify({ status: "OK", note: "Throttled" }), { status: 200 });
    }

    const db = getAdminDb();
    const account = await getCachedAccount(db, loginStr);
    if (!account) {
      return new Response(JSON.stringify({ status: "OK", note: "Account not found" }), { status: 200 });
    }

    const { data: accountData, ref: accountRef } = account;
    const userId = accountData.userId;

    if (accountData.status === 'breached') {
      return new Response(JSON.stringify({ status: "OK", note: "Account breached" }), { status: 200 });
    }

    const currBalance = Math.max(0, parseFloat(String(payload.balance)) || 0);
    const currEquity = Math.max(0, parseFloat(String(payload.equity)) || 0);
    const initialBalance = parseFloat(String(accountData.accountBalance)) || 100000;
    const todayKey = getTradingDayKey(new Date());
    const dailyClosedLosses = parseFloat(String(accountData.dailyClosedLosses)) || 0;

    const planKey = getPlanKey(accountData.accountPlan || '1-Step Pro');
    const phase = accountData.phase || 'evaluation';
    const rules = RULES_CONFIG.plans[planKey]?.[phase] || RULES_CONFIG.plans['1-step-pro']['evaluation'];

    const currentFloatingLoss = currBalance > currEquity ? currBalance - currEquity : 0;
    const totalDailyGrossLoss = dailyClosedLosses + currentFloatingLoss;
    const dailyLimit = initialBalance * (rules.dailyDrawdown / 100);

    let breachDetected = false;
    let breachReason = "";

    if (totalDailyGrossLoss > dailyLimit) {
      breachDetected = true;
      breachReason = `Daily Drawdown: Total loss $${totalDailyGrossLoss.toFixed(2)} exceeded limit $${dailyLimit.toFixed(2)}`;
    }

    if (!breachDetected) {
      const maxLossAllowed = initialBalance * (rules.maxDrawdown / 100);
      const equityFloor = initialBalance - maxLossAllowed;
      if (currEquity < equityFloor) {
        breachDetected = true;
        breachReason = `Max Drawdown: Equity $${currEquity.toLocaleString()} fell below floor $${equityFloor.toLocaleString()}`;
      }
    }

    const balanceChanged = Math.abs((accountData.balance || 0) - currBalance) > 0.01;
    const equityChanged = Math.abs((accountData.equity || 0) - currEquity) > 0.01;
    if (!balanceChanged && !equityChanged && !breachDetected) {
      return new Response(JSON.stringify({ status: "OK", note: "No change" }), { status: 200 });
    }

    lastWrite.set(loginStr, now);
    accountCache.delete(loginStr);

    const updates: any = {
      balance: currBalance,
      equity: currEquity,
      lastMT5Update: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (breachDetected) {
      updates.status = 'breached';
      updates.breachReason = breachReason;
      updates.breachedAt = FieldValue.serverTimestamp();

      const userRef = db.collection('users').doc(userId);
      const userSnap = await userRef.get();
      const traderId = userSnap.exists ? (userSnap.data()?.uid || 'N/A') : 'N/A';
      const breachKey = `update_hard_${loginStr}_${todayKey}`;

      await db.collection('breaches').doc(breachKey).set({
        userId, traderId, login: loginStr,
        userName: userSnap.data()?.name || 'N/A',
        userEmail: userSnap.data()?.email || 'N/A',
        breachReason, breachType: 'hard',
        breachedAt: FieldValue.serverTimestamp()
      }, { merge: true });

      await userRef.update({ accountStatus: 'breached', breachReason, breachedAt: FieldValue.serverTimestamp() });
    }

    await accountRef.update(updates);

    if (userId) {
      await db.collection('users').doc(userId).update({
        liveBalance: currBalance,
        liveEquity: currEquity,
        lastMT5Update: FieldValue.serverTimestamp()
      });
    }

    if (!breachDetected) {
      try {
        await auditAccount({ id: account.id, ...accountData, balance: currBalance, equity: currEquity, dailyClosedLosses });
      } catch (auditErr: any) {}
    }

    return new Response(JSON.stringify({ status: "OK", breach: breachDetected }), { status: 200 });

  } catch (error: any) {
    console.error("MT5 UPDATE CRITICAL ERROR:", error.message);
    return new Response(JSON.stringify({ status: "ERROR", message: error.message }), { status: 500 });
  }
}