
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { RULES_CONFIG, getPlanKey } from '@/lib/rulesConfig';
import { auditAccount } from '@/lib/rulesEngine';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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

export async function POST(request: Request) {
  try {
    // SECURITY: Verify MT5 API Key
    const apiKey = request.headers.get('x-api-key');

    if (apiKey !== process.env.MT5_API_KEY) {
      return new Response(JSON.stringify({ status: "UNAUTHORIZED" }), { status: 401 });
    }

    let payload: any = {};
    const contentType = request.headers.get('content-type') || '';
    
    if (contentType.includes('application/json')) {
      payload = await request.json();
    } else {
      const formData = await request.formData();
      payload = Object.fromEntries(formData.entries());
    }

    const loginStr = String(payload.login || payload.accountId || '').trim();

    // INSTITUTIONAL DEBUG: Log raw payload as requested for diagnostic verification
    console.log("[MT5_DEBUG_RAW_PAYLOAD]", JSON.stringify(payload));

    // HARD BLOCK: Silently ignore deleted legacy account to stop log noise
    if (loginStr === "757003491") {
      return new Response(JSON.stringify({ status: "OK" }), { status: 200 });
    }

    if (!loginStr || loginStr === 'undefined') {
      return new Response(JSON.stringify({ status: "ERROR", message: "Missing login" }), { status: 400 });
    }

    const db = getAdminDb();
    const accountsRef = db.collection('mt5_accounts');
    let accountDoc = null;
    
    // EXHAUSTIVE DIAGNOSTIC QUERY: Prioritize Document ID and String matches
    const allMatches = await accountsRef.where('login', '==', loginStr).get();
    
    if (allMatches.size > 0) {
      console.log(`[DUPLICATE_CHECK] Login: ${loginStr} | Found ${allMatches.size} string matches:`, allMatches.docs.map(d => ({ id: d.id, dataType: typeof d.data().login })));
      // PRIORITIZATION PROTOCOL: Prefer document where ID matches the login string exactly
      const exactIdMatch = allMatches.docs.find(d => d.id === loginStr);
      accountDoc = exactIdMatch || allMatches.docs[0];
    } 

    // PRIORITY FALLBACK: Check Document ID directly before checking numeric fields
    if (!accountDoc) {
      const d1 = await accountsRef.doc(loginStr).get();
      if (d1.exists) {
        console.log(`[DUPLICATE_CHECK] Found direct ID match for ${loginStr}`);
        accountDoc = d1;
      }
    }

    // LEGACY FALLBACK: Check for numeric login field
    if (!accountDoc && !isNaN(Number(loginStr))) {
      const q2 = await accountsRef.where('login', '==', Number(loginStr)).get();
      if (!q2.empty) {
        console.log(`[DUPLICATE_CHECK] Found ${q2.size} numeric matches for ${loginStr}:`, q2.docs.map(d => d.id));
        accountDoc = q2.docs[0];
      }
    }

    if (!accountDoc) {
      const d2 = await accountsRef.doc(`PF-${loginStr}`).get();
      if (d2.exists) {
        console.log(`[DUPLICATE_CHECK] Found PF- prefixed ID match for ${loginStr}`);
        accountDoc = d2;
      }
    }
    
    if (!accountDoc) {
      return new Response(JSON.stringify({ status: "OK", note: "Account not found" }), { status: 200 });
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

    if (accountData.status !== 'breached') {
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
        liveBalance: currBalance, liveEquity: currEquity,
        lastMT5Update: FieldValue.serverTimestamp()
      });
    }

    if (accountData.status !== 'breached' && !breachDetected) {
      try {
        const freshSnap = await accountDoc.ref.get();
        await auditAccount({ id: accountDoc.id, ...freshSnap.data() });
      } catch (auditErr: any) {
        console.error("[AUDIT_ERROR]", auditErr.message);
      }
    }

    return new Response(JSON.stringify({ status: "OK", breach: breachDetected }), { status: 200 });

  } catch (error: any) {
    return new Response(JSON.stringify({ status: "ERROR", message: error.message }), { status: 500 });
  }
}
