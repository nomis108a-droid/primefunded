import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { RULES_CONFIG, getPlanKey, type PlanPhaseRules } from '@/lib/rulesConfig';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Institutional temporal helper: Boundary at 2:00 AM UTC (7:30 AM IST)
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

/**
 * Internal logic for phase passing (Profit Target + Trading Days)
 */
async function checkPhasePassing(db: any, userId: string, accountData: any, currentBalance: number) {
  const planName = accountData.accountPlan || '1-Step Pro';
  const phase = accountData.phase || 'evaluation';
  const planKey = getPlanKey(planName);
  
  const startingBalance = parseFloat(String(accountData.accountBalance || 100000));
  const currentProfitPct = ((currentBalance - startingBalance) / startingBalance) * 100;

  // 1. Get Targets from Config
  const getTargetPct = () => {
    if (planKey.includes('1-step')) return 10;
    if (planKey.includes('2-step')) return (phase === 'phase1') ? 8 : (phase === 'phase2') ? 5 : 0;
    if (planKey.includes('3-step')) {
      if (phase === 'phase1') return 10;
      if (phase === 'phase2') return 8;
      if (phase === 'phase3') return 5;
      return 0;
    }
    return 0;
  };

  const targetPct = getTargetPct();
  if (targetPct <= 0 || currentProfitPct < targetPct) return;

  // 2. Verify Minimum Trading Days
  const getRequiredDays = () => {
    if (planKey.includes('1-step')) return 5;
    if (planKey.includes('2-step')) return 5;
    if (planKey.includes('3-step')) {
      if (phase === 'phase1') return 7;
      if (phase === 'phase2') return 6;
      return 5;
    }
    return 1;
  };

  const userRef = db.collection('users').doc(userId);
  const tradesSnap = await userRef.collection('trades').get();
  const uniqueDays = new Set();
  tradesSnap.docs.forEach((d: any) => {
    const trade = d.data();
    const tDate = trade.date?.toDate?.() || new Date(trade.date);
    if (tDate) uniqueDays.add(getTradingDayKey(tDate));
  });

  const requiredDays = getRequiredDays();
  if (uniqueDays.size >= requiredDays) {
    await userRef.update({
      readyForNextPhase: true,
      passedAt: FieldValue.serverTimestamp()
    });

    const accountsRef = db.collection('mt5_accounts');
    const accSnap = await accountsRef.where('userId', '==', userId).where('status', '==', 'active').limit(1).get();
    if (!accSnap.empty) {
      await accSnap.docs[0].ref.update({ readyForNextPhase: true });
    }

    await userRef.collection('notifications').add({
      title: "🎯 Phase Target Reached!",
      message: `Congratulations! You hit your ${targetPct}% profit target and completed ${uniqueDays.size} trading days. Admin review is pending for your next phase credentials.`,
      type: 'challenge_passed',
      isRead: false,
      createdAt: FieldValue.serverTimestamp()
    });
  }
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

    const accountsRef = db.collection('mt5_accounts');
    let querySnapshot = await accountsRef.where('login', '==', loginStr).limit(1).get();
    if (querySnapshot.empty && !isNaN(Number(loginStr))) {
      querySnapshot = await accountsRef.where('login', '==', Number(loginStr)).limit(1).get();
    }

    if (querySnapshot.empty) {
      return new Response(JSON.stringify({ status: "OK", note: "Account not found" }), { status: 200 });
    }

    const accountDoc = querySnapshot.docs[0];
    const accountData = accountDoc.data();
    const userId = accountData.userId;

    const isAlreadyBreached = accountData.status === 'breached';
    const currBalance = parseFloat(String(payload.balance)) || 0;
    const currEquity = parseFloat(String(payload.equity)) || 0;
    
    // Fixed initial balance for risk calculations (e.g. 100000)
    // Field 'accountBalance' is set once during provisioning and never changes.
    const initialBalance = parseFloat(String(accountData.accountBalance)) || 100000;

    // 1. Session Reset (2:00 AM UTC Boundary)
    const todayKey = getTradingDayKey(new Date());
    let dailyStartBalance = parseFloat(String(accountData.dailyStartBalance)) || initialBalance;
    const existingDateKey = accountData.lastDailyResetDate;

    let sessionWasReset = false;
    if (!existingDateKey || existingDateKey !== todayKey) {
      dailyStartBalance = currEquity; // New session starts at current equity
      await accountDoc.ref.update({
        dailyStartBalance: dailyStartBalance,
        lastDailyResetDate: todayKey
      });
      sessionWasReset = true;
    }

    // 2. Rules Evaluation
    let breachDetected = false;
    let breachReason = "";

    if (!isAlreadyBreached) {
      const planKey = getPlanKey(accountData.accountPlan || '1-Step Pro');
      const phase = accountData.phase || 'evaluation';
      const rules = RULES_CONFIG.plans[planKey]?.[phase] || RULES_CONFIG.plans['1-step-pro']['evaluation'];

      // Daily Drawdown
      const dailyLimit = dailyStartBalance * (rules.dailyDrawdown / 100);
      if (currEquity < (dailyStartBalance - dailyLimit)) {
        breachDetected = true;
        breachReason = `Daily drawdown: equity $${currEquity.toLocaleString()} fell below threshold (${rules.dailyDrawdown}% of $${dailyStartBalance.toLocaleString()})`;
      }

      // Max Drawdown
      if (!breachDetected) {
        const maxLimit = initialBalance * (rules.maxDrawdown / 100);
        if (currEquity < (initialBalance - maxLimit)) {
          breachDetected = true;
          breachReason = `Max drawdown: equity $${currEquity.toLocaleString()} fell below plan limit (${rules.maxDrawdown}% of initial balance)`;
        }
      }

      // Max Floating Loss (Funded) - Rule: 1% of FIXED initial balance
      if (!breachDetected && phase === 'funded' && rules.maxFloatingLoss) {
        const floatingLoss = currBalance > currEquity ? currBalance - currEquity : 0;
        const threshold = initialBalance * (rules.maxFloatingLoss / 100);
        if (floatingLoss > threshold) {
          breachDetected = true;
          breachReason = `Max floating loss: unrealized loss of $${floatingLoss.toFixed(2)} exceeded the 1% fixed threshold ($${threshold.toFixed(2)}) of initial balance ($${initialBalance.toLocaleString()})`;
        }
      }

      // Phase Passing
      if (!breachDetected && userId) {
        await checkPhasePassing(db, userId, accountData, currBalance);
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

      await db.collection('breaches').add({
        userId,
        login: loginStr,
        userEmail: accountData.email || 'N/A',
        userName: accountData.name || 'N/A',
        plan: accountData.accountPlan || 'N/A',
        phase: accountData.phase || 'N/A',
        breachReason,
        breachType: 'hard',
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

    if (userId) {
      const userUpdates: any = {
        liveBalance: currBalance,
        liveEquity: currEquity,
        lastMT5Update: FieldValue.serverTimestamp(),
      };
      if (sessionWasReset) {
        userUpdates.dailyStartBalance = dailyStartBalance;
        userUpdates.dailyStartBalanceDate = todayKey;
      }
      await db.collection('users').doc(userId).update(userUpdates);

      const perfRef = db.collection('users').doc(userId).collection('performance').doc(todayKey);
      await perfRef.set({
        date: todayKey,
        balance: currBalance,
        equity: currEquity,
        cumulativePnL: currBalance - initialBalance,
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
    }

    return new Response(JSON.stringify({ status: "OK", breach: breachDetected }), { status: 200 });
  } catch (error: any) {
    return new Response(JSON.stringify({ status: "ERROR", message: error.message }), { status: 500 });
  }
}
