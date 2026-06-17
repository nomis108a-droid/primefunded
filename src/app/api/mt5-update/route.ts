
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { RULES_CONFIG, getPlanKey, type PlanPhaseRules } from '@/lib/rulesConfig';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Institutional temporal helper: Boundary at 7:30 AM IST (2:00 AM UTC)
 */
const getTradingDayKey = (date: Date) => {
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(date.getTime() + istOffset);
  const hours = istTime.getUTCHours();
  const minutes = istTime.getUTCMinutes();
  if (hours < 7 || (hours === 7 && minutes < 30)) {
    istTime.setUTCDate(istTime.getUTCDate() - 1);
  }
  return istTime.toISOString().split('T')[0];
};

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
    const db = getAdminDb();
    let payload: any = {};
    const contentType = request.headers.get('content-type') || '';
    
    if (contentType.includes('application/json')) {
      payload = await request.json();
    } else {
      const formData = await request.formData();
      payload = Object.fromEntries(formData.entries());
    }

    const loginStr = String(payload.login || payload.accountId || '');
    if (!loginStr || loginStr === 'undefined') {
      return new Response(JSON.stringify({ status: "ERROR", message: "Missing login" }), { status: 400 });
    }
    const loginNum = Number(loginStr);

    const accountsRef = db.collection('mt5_accounts');
    let querySnapshot = await accountsRef.where('login', '==', loginStr).limit(1).get();
    let matchType = 'string';

    if (querySnapshot.empty && !isNaN(loginNum)) {
      querySnapshot = await accountsRef.where('login', '==', loginNum).limit(1).get();
      matchType = 'number';
    }

    if (querySnapshot.empty) {
      console.warn(`[MT5-Sync] No user found with login: ${loginStr} (tried string/number)`);
      return new Response(JSON.stringify({ status: "OK", note: "User not found" }), { status: 200 });
    }

    const userDoc = querySnapshot.docs[0];
    const userData = userDoc.data();
    const userId = userData.userId;

    if (userData.accountStatus === 'breached') {
      return new Response(JSON.stringify({ status: "OK", note: "Account already breached" }), { status: 200 });
    }

    const currBalance = parseFloat(String(payload.balance)) || 0;
    const currEquity = parseFloat(String(payload.equity)) || 0;
    const initialBalance = parseFloat(String(userData.accountBalance)) || 100000;

    // --- SESSION RESET LOGIC (7:30 AM IST) ---
    const todayKey = getTradingDayKey(new Date());
    let dailyStartBalance = parseFloat(String(userData.dailyStartBalance)) || initialBalance;
    const existingDateKey = userData.dailyStartBalanceDate;

    if (!existingDateKey || existingDateKey !== todayKey) {
      console.log(`[MT5-Sync] SESSION RESET for ${loginStr}. New Baseline: ${currBalance}`);
      dailyStartBaselineUpdate(userDoc.ref, currBalance, todayKey);
      dailyStartBalance = currBalance; // Use the reset balance for this cycle's risk check
    }

    // --- REAL-TIME RISK EVALUATION ---
    const planName = userData.accountPlan || '1-Step Pro';
    const phase = userData.currentPhase || 'evaluation';
    const planKey = getPlanKey(planName);
    
    // @ts-ignore
    const rules: PlanPhaseRules = RULES_CONFIG.plans[planKey]?.[phase] || RULES_CONFIG.plans['1-step-pro']['evaluation'];

    let breachDetected = false;
    let breachReason = "";

    // 1. Daily Drawdown Check
    const dailyLossLimit = dailyStartBalance * (rules.dailyDrawdown / 100);
    const currentDailyDrawdown = dailyStartBalance - currEquity;
    if (currEquity < dailyStartBalance - dailyLossLimit) {
      breachDetected = true;
      breachReason = `Daily drawdown: equity $${currEquity.toLocaleString()} fell below daily limit of $${(dailyStartBalance - dailyLossLimit).toLocaleString()} (${rules.dailyDrawdown}% of session start $${dailyStartBalance.toLocaleString()})`;
    }

    // 2. Max Drawdown Check
    const maxLossLimit = initialBalance * (rules.maxDrawdown / 100);
    if (currEquity < initialBalance - maxLossLimit) {
      breachDetected = true;
      breachReason = `Maximum drawdown: equity $${currEquity.toLocaleString()} fell below plan limit of $${(initialBalance - maxLossLimit).toLocaleString()} (${rules.maxDrawdown}% of initial balance $${initialBalance.toLocaleString()})`;
    }

    // 3. Max Floating Loss Check (Funded Accounts)
    if (!breachDetected && phase === 'funded' && rules.maxFloatingLoss) {
      const unrealizedLoss = currBalance > currEquity ? currBalance - currEquity : 0;
      const floatingLimit = initialBalance * (rules.maxFloatingLoss / 100);
      if (unrealizedLoss > floatingLimit) {
        breachDetected = true;
        breachReason = `Max floating loss: current open risk $${unrealizedLoss.toLocaleString()} exceeded 1% threshold ($${floatingLimit.toLocaleString()}) for funded accounts.`;
      }
    }

    const updates: any = {
      balance: currBalance,
      equity: currEquity,
      lastMT5Update: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (breachDetected) {
      console.error(`[RISK-ENGINE] Account ${loginStr} TERMINATED: ${breachReason}`);
      updates.accountStatus = 'breached';
      updates.accountActive = false;
      updates.breachReason = breachReason;
      updates.breachedAt = FieldValue.serverTimestamp();

      await db.collection('breaches').add({
        userId,
        login: loginStr,
        userEmail: userData.email,
        userName: userData.name,
        plan: planName,
        phase,
        breachReason,
        breachedAt: FieldValue.serverTimestamp()
      });

      if (userId) {
        await db.collection('users').doc(userId).update({
          accountStatus: 'breached',
          breachReason,
          breachedAt: FieldValue.serverTimestamp()
        });
      }
    }

    await userDoc.ref.update(updates);

    if (userId) {
      await db.collection('users').doc(userId).update({
        liveBalance: currBalance,
        liveEquity: currEquity,
        lastMT5Update: FieldValue.serverTimestamp(),
      });
    }

    return new Response(JSON.stringify({ status: "OK", breach: breachDetected }), { status: 200 });

  } catch (error: any) {
    console.error('[MT5-API] Global Error:', error.message);
    return new Response(JSON.stringify({ status: "ERROR", message: error.message }), { status: 500 });
  }
}

async function dailyStartBaselineUpdate(docRef: any, balance: number, dateKey: string) {
  await docRef.update({
    dailyStartBalance: balance,
    dailyStartBalanceDate: dateKey
  });
}
