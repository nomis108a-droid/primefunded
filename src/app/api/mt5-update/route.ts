
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { RULES_CONFIG, getPlanKey, type PlanPhaseRules } from '@/lib/rulesConfig';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Institutional temporal helper: Boundary at 2:00 AM UTC (7:30 AM IST)
 * Subtracting 2 hours from UTC time effectively moves the "date break" to 02:00 UTC.
 */
const getTradingDayKey = (date: Date) => {
  const adjusted = new Date(date.getTime() - (2 * 60 * 60 * 1000));
  return adjusted.toISOString().split('T')[0];
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
    
    if (querySnapshot.empty && !isNaN(loginNum)) {
      querySnapshot = await accountsRef.where('login', '==', loginNum).limit(1).get();
    }

    if (querySnapshot.empty) {
      console.warn(`[MT5-Sync] No account found with login: ${loginStr}`);
      return new Response(JSON.stringify({ status: "OK", note: "Account not found" }), { status: 200 });
    }

    const accountDoc = querySnapshot.docs[0];
    const accountData = accountDoc.data();
    const userId = accountData.userId;

    // Check existing status
    if (accountData.status === 'breached') {
      return new Response(JSON.stringify({ status: "OK", note: "Account already breached" }), { status: 200 });
    }

    const currBalance = parseFloat(String(payload.balance)) || 0;
    const currEquity = parseFloat(String(payload.equity)) || 0;
    const initialBalance = parseFloat(String(accountData.accountBalance)) || 100000;

    // --- 1. SESSION RESET LOGIC (2:00 AM UTC Boundary) ---
    const todayKey = getTradingDayKey(new Date());
    let dailyStartBalance = parseFloat(String(accountData.dailyStartBalance)) || initialBalance;
    const existingDateKey = accountData.lastDailyResetDate;

    if (!existingDateKey || existingDateKey !== todayKey) {
      console.log(`[MT5-Sync] SESSION RESET for ${loginStr}. Boundary: ${todayKey}. New Baseline: ${currBalance}`);
      await accountDoc.ref.update({
        dailyStartBalance: currBalance,
        lastDailyResetDate: todayKey
      });
      dailyStartBalance = currBalance;
    }

    // --- 2. RULES EVALUATION ---
    const planName = accountData.accountPlan || '1-Step Pro';
    const phase = accountData.phase || 'evaluation';
    const planKey = getPlanKey(planName);
    
    // Get plan-specific rules
    const rules: PlanPhaseRules = RULES_CONFIG.plans[planKey]?.[phase] || RULES_CONFIG.plans['1-step-pro']['evaluation'];

    let breachDetected = false;
    let breachReason = "";

    // A. Daily Drawdown Check
    const dailyLossLimit = dailyStartBalance * (rules.dailyDrawdown / 100);
    if (currEquity < dailyStartBalance - dailyLossLimit) {
      breachDetected = true;
      breachReason = `Daily drawdown: equity $${currEquity.toLocaleString()} fell below limit of $${(dailyStartBalance - dailyLossLimit).toLocaleString()} (allowed ${rules.dailyDrawdown}% of day-start $${dailyStartBalance.toLocaleString()})`;
    }

    // B. Max Drawdown Check
    const maxLossLimit = initialBalance * (rules.maxDrawdown / 100);
    if (!breachDetected && currEquity < initialBalance - maxLossLimit) {
      breachDetected = true;
      breachReason = `Maximum drawdown: equity $${currEquity.toLocaleString()} fell below plan limit of $${(initialBalance - maxLossLimit).toLocaleString()} (allowed ${rules.maxDrawdown}% of initial balance $${initialBalance.toLocaleString()})`;
    }

    // C. Max Floating Loss Check (Funded Accounts)
    if (!breachDetected && phase === 'funded' && rules.maxFloatingLoss) {
      const unrealizedLoss = currBalance > currEquity ? currBalance - currEquity : 0;
      const floatingLimit = initialBalance * (rules.maxFloatingLoss / 100);
      if (unrealizedLoss > floatingLimit) {
        breachDetected = true;
        breachReason = `Max floating loss: unrealized loss $${unrealizedLoss.toLocaleString()} exceeded 1% threshold ($${floatingLimit.toLocaleString()}) of initial balance.`;
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
      updates.status = 'breached';
      updates.breachReason = breachReason;
      updates.breachedAt = FieldValue.serverTimestamp();

      await db.collection('breaches').add({
        userId,
        login: loginStr,
        userEmail: accountData.email || 'N/A',
        userName: accountData.name || 'N/A',
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

    await accountDoc.ref.update(updates);

    // Sync live metrics to User document for UI
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
