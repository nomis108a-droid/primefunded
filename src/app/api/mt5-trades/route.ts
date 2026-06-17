
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getTradeDate, enrichTrades } from '@/lib/tradeUtils';

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

async function evaluateTradeRules(db: any, userId: string, accountDoc: any, tradesFromPayload: any[]) {
  const accountData = accountDoc.data();
  const initialBalance = parseFloat(String(accountData.accountBalance));
  
  // FIX: Explicit field validation, NO silent fallback.
  if (!initialBalance || isNaN(initialBalance)) {
    console.error(`[RiskEngine] CRITICAL: Cannot evaluate risk for account ${accountData.login}. Missing/Invalid 'accountBalance' field.`);
    return { breached: false };
  }

  const tradesRef = db.collection('users').doc(userId).collection('trades');
  
  // Fetch full trade history for matching entry/exit pairs
  const allTradesSnap = await tradesRef.get();
  const allTradesRaw = allTradesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  
  // Use SHARED logic to match deals and calculate duration
  const enriched = enrichTrades(allTradesRaw, accountData.login);
  
  // We evaluate the rules specifically for the trades that just came in
  const incomingTickets = new Set(tradesFromPayload.map(t => String(t.ticket)));
  const relevantTrades = enriched.filter(t => incomingTickets.has(String(t.id)));

  // Collect all trade opens for frequency check
  const sortedOpens = enriched
    .filter(t => t.openTime)
    .sort((a, b) => getTradeDate(a.openTime)!.getTime() - getTradeDate(b.openTime)!.getTime());

  for (const trade of relevantTrades) {
    const profit = trade.pnl || 0;
    const durationSec = trade.durationSeconds;
    const openTimeSec = getTradeDate(trade.openTime)?.getTime() / 1000 || 0;
    const ticket = trade.id;
    const symbol = trade.symbol;
    const volume = trade.lots || 0;

    // 1. Max Single Trade Loss (3% of INITIAL)
    const limit3Pct = initialBalance * 0.03;
    if (profit < 0 && Math.abs(profit) > limit3Pct) {
      return {
        breached: true,
        reason: `Single trade loss violation: -$${Math.abs(profit).toFixed(2)} exceeds 3% max loss limit of $${limit3Pct.toFixed(2)} on $${initialBalance.toLocaleString()} account (Ticket: ${ticket})`
      };
    }

    // 2. Min Trade Duration (120s)
    if (trade.closeTime && trade.matched) {
      if (durationSec < 120 && profit !== 0) {
        return {
          breached: true,
          reason: `Trade duration violation: position closed in ${durationSec} seconds, minimum hold time is 120 seconds (Ticket: ${ticket})`
        };
      }
    }

    // 3. Max Execution Frequency (180s between OPENS)
    const currentIndex = sortedOpens.findIndex(t => String(t.id) === String(ticket));
    if (currentIndex > 0) {
      const prevTrade = sortedOpens[currentIndex - 1];
      const prevOpenTimeSec = getTradeDate(prevTrade.openTime)!.getTime() / 1000;
      const diff = openTimeSec - prevOpenTimeSec;
      if (diff > 0 && diff < 180) {
        return {
          breached: true,
          reason: `Execution frequency violation: ${diff} seconds between trade opens, minimum required is 180 seconds (Ticket: ${ticket})`
        };
      }
    }

    // 4. Martingale Detection (HARD)
    if (trade.matched && profit < 0) {
      const fifteenMinsLater = openTimeSec + 900;
      const martingaleTrigger = sortedOpens.find(t => 
        t.symbol === symbol && 
        String(t.id) !== String(ticket) &&
        (getTradeDate(t.openTime)!.getTime() / 1000) > openTimeSec &&
        (getTradeDate(t.openTime)!.getTime() / 1000) <= fifteenMinsLater &&
        t.lots > volume
      );

      if (martingaleTrigger) {
        return {
          breached: true,
          reason: `Martingale lot scaling detected: lot size increased from ${volume} to ${martingaleTrigger.lots} after a loss on ${symbol} within 15 minutes (Ticket: ${ticket} -> ${martingaleTrigger.id})`
        };
      }
    }
  }

  return { breached: false };
}

export async function POST(request: Request) {
  try {
    const db = getAdminDb();
    const payload = await request.json();
    const loginStr = String(payload.login || '');
    const trades = payload.trades || [];

    if (!loginStr) return new Response(JSON.stringify({ status: "ERROR", message: "Missing login" }), { status: 400 });

    const accountsRef = db.collection('mt5_accounts');
    let snapshot = await accountsRef.where('login', '==', loginStr).limit(1).get();
    if (snapshot.empty && !isNaN(Number(loginStr))) {
      snapshot = await accountsRef.where('login', '==', Number(loginStr)).limit(1).get();
    }

    if (snapshot.empty) return new Response(JSON.stringify({ status: "OK", note: "Account not found" }), { status: 200 });

    const accountDoc = snapshot.docs[0];
    const accountData = accountDoc.data();
    const userId = accountData.userId;

    if (!userId) return new Response(JSON.stringify({ status: "OK", note: "No user linked" }), { status: 200 });

    // 1. Save Trades
    const batch = db.batch();
    for (const trade of trades) {
      const tradeRef = db.collection('users').doc(userId).collection('trades').doc(String(trade.ticket));
      batch.set(tradeRef, {
        ticket: trade.ticket,
        symbol: trade.symbol,
        type: trade.type,
        volume: trade.volume,
        price: trade.price,
        pnl: trade.profit,
        openTime: trade.openTime || null,
        closeTime: trade.time || null,
        date: new Date(trade.time * 1000),
        createdAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    await batch.commit();

    // 2. Recalculate dailyClosedLosses
    const todayKey = getTradingDayKey(new Date());
    const sessionStartTime = Math.floor(new Date(todayKey + 'T02:00:00Z').getTime() / 1000);
    
    const todaysTrades = await db.collection('users').doc(userId).collection('trades')
      .where('closeTime', '>=', sessionStartTime)
      .get();
    
    let dailyLossTotal = 0;
    todaysTrades.docs.forEach((d: any) => {
      const t = d.data();
      const pnl = t.pnl || t.profit || 0;
      if (pnl < 0) dailyLossTotal += Math.abs(pnl);
    });

    await accountDoc.ref.update({ dailyClosedLosses: dailyLossTotal });
    if (userId) {
      await db.collection('users').doc(userId).update({ 
        dailyClosedLosses: dailyLossTotal 
      });
    }

    // 3. Evaluate Risk Rules (Using SHARED matching logic)
    if (accountData.status !== 'breached') {
      const riskCheck = await evaluateTradeRules(db, userId, accountDoc, trades);
      if (riskCheck.breached) {
        await accountDoc.ref.update({ status: 'breached', breachReason: riskCheck.reason, breachedAt: FieldValue.serverTimestamp() });
        await db.collection('users').doc(userId).update({ accountStatus: 'breached', breachReason: riskCheck.reason, breachedAt: FieldValue.serverTimestamp() });
        await db.collection('breaches').add({
          userId,
          login: loginStr,
          userEmail: accountData.email || 'N/A',
          userName: accountData.name || 'N/A',
          breachReason: riskCheck.reason,
          breachType: 'hard',
          breachedAt: FieldValue.serverTimestamp()
        });
      }
    }

    return new Response(JSON.stringify({ status: "OK", saved: trades.length }), { status: 200 });
  } catch (error: any) {
    return new Response(JSON.stringify({ status: "ERROR", message: error.message }), { status: 500 });
  }
}
