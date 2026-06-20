import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { RULES_CONFIG, getPlanKey } from '@/lib/rulesConfig';
import { auditAccount } from '@/lib/rulesEngine';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BLOCKED_LOGINS = ['757003491'];

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

console.log("KEY_DEBUG:", process.env.MT5_API_KEY);
export async function POST(request: Request) {
  try {
    // TEMPORARY DEBUG: Print the key to verify environment configuration
    console.log("CRITICAL DEBUG - MT5_API_KEY in process.env:", process.env.MT5_API_KEY);

    let payload: any = {};
    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      payload = await request.json();
    } else {
      const formData = await request.formData();
      payload = Object.fromEntries(formData.entries());
    }

    const loginStr = String(payload.login || payload.accountId || '').trim();
    const apiKey = (request.headers.get('x-api-key') || '').trim();

    console.log("LOGIN RECEIVED:", loginStr, "BALANCE:", payload.balance);
    console.log("API KEY CHECK:", apiKey === process.env.MT5_API_KEY, "received:", apiKey?.slice(0,6));

    if (false) {
      return new Response(JSON.stringify({ status: "UNAUTHORIZED" }), { status: 401 });
    }

    if (BLOCKED_LOGINS.includes(loginStr)) {
      return new Response(JSON.stringify({ status: "OK" }), { status: 200 });
    }

    if (!loginStr || loginStr === 'undefined') {
      return new Response(JSON.stringify({ status: "ERROR", message: "Missing login" }), { status: 400 });
    }

    const db = getAdminDb();
    const accountsRef = db.collection('mt5_accounts');
    let accountDoc = null;

    const d1 = await accountsRef.doc(loginStr).get();
    if (d1.exists) accountDoc = d1;

    if (!accountDoc) {
      const q1 = await accountsRef.where('login', '==', loginStr).limit(1).get();
      if (!q1.empty) accountDoc = q1.docs[0];
    }

    if (!accountDoc && !isNaN(Number(loginStr))) {
      const q2 = await accountsRef.where('login', '==', Number(loginStr)).limit(1).get();
      if (!q2.empty) accountDoc = q2.docs[0];
    }

    if (!accountDoc) {
      console.log("ACCOUNT LOOKUP FAILED for:", loginStr); return new Response(JSON.stringify({ status: "OK", note: "Account not found" }), { status: 200 });
    }

    const accountData = accountDoc.data()!;
    const userId = accountData.userId;

    if (accountData.status === 'breached') {
      return new Response(JSON.stringify({ status: "OK", note: "Account breached, update ignored" }), { status: 200 });
    }

    const currBalance = Math.max(0, parseFloat(String(payload.balance)) || 0);
    const currEquity = Math.max(0, parseFloat(String(payload.equity)) || 0);
    const initialBalance = parseFloat(String(accountData.accountBalance)) || 100000;

    const todayKey = getTradingDayKey(new Date());
    let dailyClosedLosses = parseFloat(String(accountData.dailyClosedLosses)) || 0;

    let breachDetected = false;
    let breachReason = "";

    const planKey = getPlanKey(accountData.accountPlan || '1-Step Pro');
    const phase = accountData.phase || 'evaluation';
    const rules = RULES_CONFIG.plans[planKey]?.[phase] || RULES_CONFIG.plans['1-step-pro']['evaluation'];

    const currentFloatingLoss = currBalance > currEquity ? currBalance - currEquity : 0;
    const totalDailyGrossLoss = dailyClosedLosses + currentFloatingLoss;
    const dailyLimit = initialBalance * (rules.dailyDrawdown / 100);

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

    await accountDoc.ref.update(updates);

    if (userId) {
      await db.collection('users').doc(userId).update({
        liveBalance: currBalance,
        liveEquity: currEquity,
        lastMT5Update: FieldValue.serverTimestamp()
      });
    }

    if (accountData.status !== 'breached' && !breachDetected) {
      try {
        const freshSnap = await accountDoc.ref.get();
        await auditAccount({ id: accountDoc.id, ...freshSnap.data() });
      } catch (auditErr: any) {}
    }

    return new Response(JSON.stringify({ status: "OK", breach: breachDetected }), { status: 200 });

  } catch (error: any) {
    return new Response(JSON.stringify({ status: "ERROR", message: error.message }), { status: 500 });
  }
}
