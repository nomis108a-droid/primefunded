import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { RULES_CONFIG, getPlanKey } from '@/lib/rulesConfig';

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
 * Target is checked against BALANCE (Realized only)
 */
async function checkPhasePassing(db: any, userId: string, accountData: any, currentBalance: number) {
  const planName = accountData.accountPlan || '1-Step Pro';
  const phase = accountData.phase || 'evaluation';
  const planKey = getPlanKey(planName);
  
  const startingBalance = parseFloat(String(accountData.accountBalance || 100000));
  const currentProfitAmount = currentBalance - startingBalance;
  const currentProfitPct = (currentProfitAmount / startingBalance) * 100;

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

    if (querySnapshot.empty) return new Response(JSON.stringify({ status: "OK", note: "Account not found" }), { status: 200 });

    const accountDoc = querySnapshot.docs[0];
    const accountData = accountDoc.data();
    const userId = accountData.userId;

    const isAlreadyBreached = accountData.status === 'breached';
    const currBalance = parseFloat(String(payload.balance)) || 0;
    const currEquity = parseFloat(String(payload.equity)) || 0;
    
    // Fixed initial balance for risk calculations
    const initialBalance = parseFloat(String(accountData.accountBalance)) || 100000;

    // 1. Session Reset & dailyClosedLosses tracking
    const todayKey = getTradingDayKey(new Date());
    let dailyClosedLosses = parseFloat(String(accountData.dailyClosedLosses)) || 0;
    const existingDateKey = accountData.lastDailyResetDate;

    if (!existingDateKey || existingDateKey !== todayKey) {
      dailyClosedLosses = 0;
      await accountDoc.ref.update({
        dailyClosedLosses: 0,
        lastDailyResetDate: todayKey
      });

      // Synchronize session reset to User document
      if (userId) {
        await db.collection('users').doc(userId).update({
          dailyClosedLosses: 0,
          dailyStartBalance: currBalance,
          dailyStartBalanceDate: todayKey
        });
      }
    }

    // 2. Rules Evaluation (Mid-Trade / Real-Time)
    let breachDetected = false;
    let breachReason = "";

    if (!isAlreadyBreached) {
      const planKey = getPlanKey(accountData.accountPlan || '1-Step Pro');
      const phase = accountData.phase || 'evaluation';
      const rules = RULES_CONFIG.plans[planKey]?.[phase] || RULES_CONFIG.plans['1-step-pro']['evaluation'];

      // A. Corrected Daily Drawdown (Gross Loss Counter)
      // dailyGrossLoss = Sum of closed losses today + current floating loss (if negative)
      const currentFloatingPnL = currEquity - currBalance;
      const currentFloatingLoss = currentFloatingPnL < 0 ? Math.abs(currentFloatingPnL) : 0;
      
      const totalDailyGrossLoss = dailyClosedLosses + currentFloatingLoss;
      const dailyLimit = initialBalance * (rules.dailyDrawdown / 100);

      if (totalDailyGrossLoss > dailyLimit) {
        breachDetected = true;
        breachReason = `Daily Drawdown (Gross Loss): Total loss of $${totalDailyGrossLoss.toFixed(2)} ($${dailyClosedLosses.toFixed(2)} closed + $${currentFloatingLoss.toFixed(2)} floating) exceeded fixed limit of $${dailyLimit.toFixed(2)} (3% of $${initialBalance.toLocaleString()})`;
      }

      // B. Max Drawdown (Real-Time Equity Floor)
      if (!breachDetected) {
        const maxLimitPct = rules.maxDrawdown;
        const maxLossAllowed = initialBalance * (maxLimitPct / 100);
        const equityFloor = initialBalance - maxLossAllowed;
        
        if (currEquity < equityFloor) {
          breachDetected = true;
          breachReason = `Maximum Drawdown: Equity $${currEquity.toLocaleString()} fell below the fixed floor of $${equityFloor.toLocaleString()} (${maxLimitPct}% of initial balance)`;
        }
      }

      // C. Max Floating Loss (Funded)
      if (!breachDetected && phase === 'funded' && rules.maxFloatingLoss) {
        const floatingLoss = currBalance > currEquity ? currBalance - currEquity : 0;
        const threshold = initialBalance * (rules.maxFloatingLoss / 100);
        if (floatingLoss > threshold) {
          breachDetected = true;
          breachReason = `Max Floating Loss (Funded): Unrealized loss of $${floatingLoss.toFixed(2)} exceeded the 1% fixed threshold ($${threshold.toFixed(2)})`;
        }
      }

      // D. Phase Passing (Realized Balance only)
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
      await db.collection('users').doc(userId).update({
        liveBalance: currBalance,
        liveEquity: currEquity,
        lastMT5Update: FieldValue.serverTimestamp(),
        // Also sync realized losses for dashboard display
        dailyClosedLosses: dailyClosedLosses
      });

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
