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

    // Check existing status - still process updates but log if already breached
    const isAlreadyBreached = accountData.status === 'breached';

    const currBalance = parseFloat(String(payload.balance)) || 0;
    const currEquity = parseFloat(String(payload.equity)) || 0;
    const initialBalance = parseFloat(String(accountData.accountBalance)) || 100000;

    // --- 1. SESSION RESET LOGIC (2:00 AM UTC Boundary) ---
    const todayKey = getTradingDayKey(new Date());
    let dailyStartBalance = parseFloat(String(accountData.dailyStartBalance)) || initialBalance;
    const existingDateKey = accountData.lastDailyResetDate;

    let sessionWasReset = false;
    if (!existingDateKey || existingDateKey !== todayKey) {
      // Baseline is current equity BEFORE this update (stored in DB)
      dailyStartBalance = parseFloat(String(accountData.equity)) || initialBalance;
      console.log(`[MT5-Sync] SESSION RESET for ${loginStr}. Boundary: ${todayKey}. New Baseline: ${dailyStartBalance}`);
      
      await accountDoc.ref.update({
        dailyStartBalance: dailyStartBalance,
        lastDailyResetDate: todayKey
      });
      sessionWasReset = true;
    }

    // --- 2. RULES EVALUATION ---
    let breachDetected = false;
    let breachReason = "";

    if (!isAlreadyBreached) {
      const planName = accountData.accountPlan || '1-Step Pro';
      const phase = accountData.phase || 'evaluation';
      const planKey = getPlanKey(planName);
      
      // Get plan-specific rules
      const rules: PlanPhaseRules = RULES_CONFIG.plans[planKey]?.[phase] || RULES_CONFIG.plans['1-step-pro']['evaluation'];

      // A. Daily Drawdown Check
      const dailyDrawdownLimit = dailyStartBalance * (rules.dailyDrawdown / 100);
      const dailyThreshold = dailyStartBalance - dailyDrawdownLimit;
      if (currEquity < dailyThreshold) {
        breachDetected = true;
        breachReason = `Daily drawdown: equity $${currEquity.toLocaleString()} fell below day-start threshold of $${dailyThreshold.toLocaleString()} (${rules.dailyDrawdown}% of $${dailyStartBalance.toLocaleString()})`;
      }

      // B. Max Drawdown Check
      if (!breachDetected) {
        const maxDrawdownLimit = initialBalance * (rules.maxDrawdown / 100);
        const maxThreshold = initialBalance - maxDrawdownLimit;
        if (currEquity < maxThreshold) {
          breachDetected = true;
          breachReason = `Maximum drawdown: equity $${currEquity.toLocaleString()} fell below plan limit of $${maxThreshold.toLocaleString()} (${rules.maxDrawdown}% of $${initialBalance.toLocaleString()})`;
        }
      }

      // C. Max Floating Loss Check (Funded Accounts only)
      if (!breachDetected && (phase === 'funded' || phase === 'live') && rules.maxFloatingLoss) {
        const floatingLoss = currBalance > currEquity ? currBalance - currEquity : 0;
        const floatingLimit = initialBalance * (rules.maxFloatingLoss / 100);
        if (floatingLoss > floatingLimit) {
          breachDetected = true;
          breachReason = `Max floating loss: unrealized loss $${floatingLoss.toLocaleString()} exceeded 1% threshold ($${floatingLimit.toLocaleString()}) of initial balance.`;
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
      console.error(`[RISK-ENGINE] Account ${loginStr} BREACHED: ${breachReason}`);
      updates.status = 'breached';
      updates.breachReason = breachReason;
      updates.breachedAt = FieldValue.serverTimestamp();

      // Record breach in ledger
      await db.collection('breaches').add({
        userId,
        login: loginStr,
        userEmail: accountData.email || 'N/A',
        userName: accountData.name || 'N/A',
        plan: accountData.accountPlan || 'N/A',
        phase: accountData.phase || 'N/A',
        breachReason,
        breachedAt: FieldValue.serverTimestamp()
      });

      // Update main user profile status
      if (userId) {
        await db.collection('users').doc(userId).update({
          accountStatus: 'breached',
          breachReason,
          breachedAt: FieldValue.serverTimestamp()
        });
      }
    }

    await accountDoc.ref.update(updates);

    // Sync live metrics to User document for UI visibility
    if (userId) {
      const userUpdates: any = {
        liveBalance: currBalance,
        liveEquity: currEquity,
        lastMT5Update: FieldValue.serverTimestamp(),
      };
      
      // CRITICAL FIX: Always keep User record's dailyStartBalance in sync for Dashboard P&L
      if (sessionWasReset || !accountData.dailyStartBalance) {
        userUpdates.dailyStartBalance = dailyStartBalance;
        userUpdates.dailyStartBalanceDate = todayKey;
      }

      await db.collection('users').doc(userId).update(userUpdates);
    }

    return new Response(JSON.stringify({ status: "OK", breach: breachDetected }), { status: 200 });

  } catch (error: any) {
    console.error('[MT5-API] Global Error:', error.message);
    return new Response(JSON.stringify({ status: "ERROR", message: error.message }), { status: 500 });
  }
}
