import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * @fileOverview Institutional Breach Detection Engine
 * Algorithmic evaluation of MT5 metrics against plan-specific prop firm rules.
 */

/**
 * Helper to calculate unique trading days based on 7:30 AM IST (2:00 AM UTC) boundary.
 */
const getTradingDayKey = (date: Date) => {
  const adjusted = new Date(date.getTime() - (2 * 60 * 60 * 1000));
  return adjusted.toISOString().split('T')[0];
};

export async function POST(request: Request) {
  try {
    const { userId, mt5Data } = await request.json();
    if (!userId || !mt5Data) return new Response('Missing payload', { status: 400 });

    const db = getAdminDb();
    const userRef = db.collection('users').doc(userId);
    const userSnap = await userRef.get();

    if (!userSnap.exists) return new Response('User not found', { status: 404 });
    const userData = userSnap.data()!;
    
    // Skip if already breached or already marked ready
    if (userData.accountStatus === 'breached') return new Response('Account already breached', { status: 200 });

    const plan = userData.accountPlan || '1-Step Pro';
    const phase = userData.currentPhase || 'evaluation';
    const planKey = plan.toLowerCase();
    
    // Normalize numeric values - accountBalance is the fixed initial size
    const startingBalance = parseFloat(String(userData.accountBalance || 100000));
    const liveBalance = parseFloat(String(userData.liveBalance || startingBalance));
    const liveEquity = parseFloat(String(userData.liveEquity || liveBalance));
    
    // Metrics provided by MT5 EA
    const { 
      dailyDrawdown, 
      maxDrawdown, 
      lastLotSize, 
      prevLotSize,
      lastTradeDuration, 
      lastTradeInterval, 
      lastTradeLossPct   
    } = mt5Data;

    let breachType: 'hard' | 'soft' | null = null;
    let breachReason = '';

    // 1. PROFIT TARGET DETECTION (AUTO-PASS)
    const getTargetPct = () => {
      if (planKey.includes('1-step')) return 10;
      if (planKey.includes('2-step')) {
        return (phase === 'phase1') ? 8 : (phase === 'phase2') ? 5 : 0;
      }
      if (planKey.includes('3-step')) {
        return (phase === 'phase1') ? 10 : (phase === 'phase2') ? 8 : (phase === 'phase3') ? 5 : 0;
      }
      return 0;
    };

    const targetPct = getTargetPct();
    const currentProfitPct = ((liveBalance - startingBalance) / startingBalance) * 100;

    // 2. TRADING DAYS VERIFICATION
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

    if (targetPct > 0 && currentProfitPct >= targetPct && !userData.readyForNextPhase) {
      const tradesSnap = await userRef.collection('trades').get();
      const uniqueDays = new Set();
      tradesSnap.docs.forEach(d => {
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

        await userRef.collection('notifications').add({
          title: "🎯 Phase Pass Requirements Met!",
          message: `Congratulations! You have reached the ${targetPct}% profit target and completed ${uniqueDays.size} trading days. Our desk is preparing your next phase credentials.`,
          type: 'challenge_passed',
          isRead: false,
          createdAt: FieldValue.serverTimestamp()
        });
      }
    }

    // 3. UNIFIED TIMING RULES
    if (lastTradeDuration !== undefined && lastTradeDuration > 0 && lastTradeDuration < 120) {
      breachType = 'hard';
      breachReason = 'Duration violation: Trades must be held for at least 2 minutes';
    } else if (lastTradeInterval !== undefined && lastTradeInterval > 0 && lastTradeInterval < 180) {
      breachType = 'hard';
      breachReason = 'Frequency violation: 1 trade per 3 mins maximum execution speed';
    }

    // 4. FLOATING LOSS CALCULATION (Rule: 1% of FIXED initial balance)
    const currentFloatingLoss = liveBalance > liveEquity ? liveBalance - liveEquity : 0;
    const floatingLossLimit = startingBalance * 0.01;

    // 5. PLAN-SPECIFIC LOGIC
    if (!breachType) {
      if (planKey.includes('1-step')) {
        if (dailyDrawdown > 3) { breachType = 'hard'; breachReason = '1-Step: Daily drawdown exceeded 3%'; }
        else if (maxDrawdown > 6) { breachType = 'hard'; breachReason = '1-Step: Maximum drawdown exceeded 6%'; }
        else if (phase === 'funded' && currentFloatingLoss > floatingLossLimit) { 
          breachType = 'hard'; 
          breachReason = `Funded Stage: Floating loss ($${currentFloatingLoss.toFixed(2)}) exceeded 1% fixed threshold ($${floatingLossLimit.toFixed(2)})`; 
        }
        else if (lastLotSize > prevLotSize * 1.5) { breachType = 'hard'; breachReason = 'Martingale lot scaling detected'; }
      } 
      else if (planKey.includes('2-step')) {
        if (dailyDrawdown > 5) { breachType = 'hard'; breachReason = '2-Step: Daily drawdown exceeded 5%'; }
        else if (maxDrawdown > 10) { breachType = 'hard'; breachReason = '2-Step: Max drawdown exceeded 10%'; }
        else if (lastTradeLossPct > 3) { breachType = 'hard'; breachReason = 'Single trade loss exceeded 3% limit'; }
        else if (phase === 'funded' && currentFloatingLoss > floatingLossLimit) { 
          breachType = 'hard'; 
          breachReason = `Funded Stage: Floating loss ($${currentFloatingLoss.toFixed(2)}) exceeded 1% fixed threshold ($${floatingLossLimit.toFixed(2)})`; 
        }
        else if (lastLotSize > prevLotSize * 1.5) { breachType = 'hard'; breachReason = 'Martingale lot scaling detected'; }
      }
      else if (planKey.includes('3-step')) {
        if (dailyDrawdown > 4) { breachType = 'hard'; breachReason = '3-Step: Daily drawdown exceeded 4%'; }
        else if (maxDrawdown > 8) { breachType = 'hard'; breachReason = '3-Step: Max drawdown exceeded 8%'; }
        else if (lastTradeLossPct > 3) { breachType = 'hard'; breachReason = 'Single trade loss exceeded 3% limit'; }
        else if (phase === 'funded' && currentFloatingLoss > floatingLossLimit) { 
          breachType = 'hard'; 
          breachReason = `Funded Stage: Floating loss ($${currentFloatingLoss.toFixed(2)}) exceeded 1% fixed threshold ($${floatingLossLimit.toFixed(2)})`; 
        }
        else if (lastLotSize > prevLotSize * 1.5) { breachType = 'hard'; breachReason = 'Martingale lot scaling detected'; }
      }
      else if (planKey.includes('instant')) {
        const now = new Date();
        const isFridayEvening = now.getUTCDay() === 5 && now.getUTCHours() >= 21;
        
        if (dailyDrawdown > 3) { breachType = 'hard'; breachReason = 'Instant: Daily drawdown hit 3% limit'; }
        else if (maxDrawdown > 4) { breachType = 'hard'; breachReason = 'Instant: Max drawdown hit 4% limit'; }
        else if (lastTradeLossPct > 3) { breachType = 'hard'; breachReason = 'Instant: Single trade loss exceeded 3%'; }
        else if (currentFloatingLoss > floatingLossLimit) { 
          breachType = 'hard'; 
          breachReason = `Instant: Floating loss ($${currentFloatingLoss.toFixed(2)}) exceeded 1% fixed threshold ($${floatingLossLimit.toFixed(2)})`; 
        }
        else if (isFridayEvening && mt5Data.hasOpenTrades) { breachType = 'soft'; breachReason = 'Holding over the weekend: position closed automatically (Soft Breach)'; }
      }
    }

    if (breachType === 'hard') {
      await userRef.update({
        accountStatus: 'breached',
        accountActive: false,
        breachType: 'hard',
        breachReason,
        breachedAt: FieldValue.serverTimestamp()
      });

      await db.collection('breaches').add({
        userId,
        userEmail: userData.email,
        userName: userData.name,
        plan,
        phase,
        breachType: 'hard',
        breachReason,
        breachedAt: FieldValue.serverTimestamp()
      });

      await userRef.collection('notifications').add({
        title: "🚫 Account Liquidated",
        message: `Your account has been terminated due to an institutional risk breach: ${breachReason}.`,
        type: 'challenge_failed',
        isRead: false,
        createdAt: FieldValue.serverTimestamp()
      });
    } 
    else if (breachType === 'soft') {
      await userRef.update({
        readyForPhaseReset: true,
        breachType: 'soft',
        breachReason
      });

      await db.collection('breaches').add({
        userId,
        userEmail: userData.email,
        userName: userData.name,
        plan,
        phase,
        breachType: 'soft',
        breachReason,
        breachedAt: FieldValue.serverTimestamp()
      });

      await userRef.collection('notifications').add({
        title: "⚠️ Performance Warning",
        message: `Soft breach detected: ${breachReason}. Your phase progress requires a reset to continue.`,
        type: 'soft_breach_warning',
        isRead: false,
        createdAt: FieldValue.serverTimestamp()
      });
    }

    return new Response(JSON.stringify({ 
      status: breachType || 'compliant', 
      reason: breachReason,
      achieved: userData.readyForNextPhase || false 
    }), { status: 200 });

  } catch (error: any) {
    console.error('[Breach-Engine] Critical Failure:', error);
    return new Response(error.message, { status: 500 });
  }
}
