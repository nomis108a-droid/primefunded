import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

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

async function evaluateTradeRules(db: any, userId: string, accountDoc: any, trades: any[]) {
  const accountData = accountDoc.data();
  const initialBalance = parseFloat(String(accountData.accountBalance || 100000));
  const tradesRef = db.collection('users').doc(userId).collection('trades');
  
  const sortedNewTrades = [...trades].sort((a, b) => (a.openTime || 0) - (b.openTime || 0));

  for (const trade of sortedNewTrades) {
    const profit = trade.profit || 0;
    const duration = trade.duration || (trade.time && trade.openTime ? trade.time - trade.openTime : null);
    const openTime = trade.openTime || 0;
    const ticket = trade.ticket;
    const symbol = trade.symbol;
    const volume = trade.volume || 0;

    // 1. Max Single Trade Loss (3%)
    if (profit < 0 && Math.abs(profit) > initialBalance * 0.03) {
      return {
        breached: true,
        reason: `Single trade loss violation: -$${Math.abs(profit).toFixed(2)} exceeds 3% max loss limit of $${(initialBalance * 0.03).toFixed(2)} (Ticket: ${ticket})`
      };
    }

    // 2. Min Trade Duration (120s)
    if (duration !== null && duration < 120 && profit !== 0) {
      return {
        breached: true,
        reason: `Trade duration violation: position closed in ${duration} seconds, minimum hold time is 120 seconds (Ticket: ${ticket})`
      };
    }

    // 3. Max Execution Frequency (180s)
    const prevTradeQuery = await tradesRef
      .where('openTime', '<', openTime)
      .orderBy('openTime', 'desc')
      .limit(1)
      .get();

    if (!prevTradeQuery.empty) {
      const prevData = prevTradeQuery.docs[0].data();
      const diff = openTime - prevData.openTime;
      if (diff > 0 && diff < 180) {
        return {
          breached: true,
          reason: `Execution frequency violation: ${diff} seconds between trade opens, minimum required is 180 seconds (Ticket: ${ticket})`
        };
      }
    }

    // 4. Martingale Detection (HARD Breach)
    const fifteenMinsAgo = openTime - 900;
    const sameSymbolQuery = await tradesRef
      .where('symbol', '==', symbol)
      .where('openTime', '>=', fifteenMinsAgo)
      .where('openTime', '<', openTime)
      .orderBy('openTime', 'desc')
      .limit(1)
      .get();

    if (!sameSymbolQuery.empty) {
      const prevSymbolData = sameSymbolQuery.docs[0].data();
      if ((prevSymbolData.pnl || prevSymbolData.profit || 0) < 0 && volume > prevSymbolData.volume) {
        return {
          breached: true,
          reason: `Martingale lot scaling detected: lot size increased after a loss on ${symbol} within 15 minutes`
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

    // 2. Recalculate dailyClosedLosses for the session
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

    // 3. Evaluate Risk Rules
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
