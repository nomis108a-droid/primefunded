import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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
 * Algorithmic evaluation of trade-level risk rules.
 */
async function evaluateTradeRules(db: any, userId: string, accountDoc: any, trades: any[]) {
  const accountData = accountDoc.data();
  const initialBalance = parseFloat(String(accountData.accountBalance || 100000));
  
  // Sort incoming trades by open time to check frequency
  const sortedNewTrades = [...trades].sort((a, b) => (a.openTime || 0) - (b.openTime || 0));

  for (const trade of sortedNewTrades) {
    const profit = trade.profit || 0;
    const duration = trade.duration || (trade.time && trade.openTime ? trade.time - trade.openTime : null);
    const openTime = trade.openTime || 0;
    const ticket = trade.ticket;
    const symbol = trade.symbol;
    const volume = trade.volume || 0;

    // 1. Max Single Trade Loss (3% of initial balance)
    if (profit < 0 && Math.abs(profit) > initialBalance * 0.03) {
      const limit = initialBalance * 0.03;
      return {
        breached: true,
        reason: `Single trade loss violation: -$${Math.abs(profit).toFixed(2)} exceeds 3% max loss limit of $${limit.toFixed(2)} on $${initialBalance.toLocaleString()} account (Ticket: ${ticket})`
      };
    }

    // 2. Min Trade Duration (120 seconds)
    if (duration !== null && duration < 120 && profit !== 0) {
      return {
        breached: true,
        reason: `Trade duration violation: position closed in ${duration} seconds, minimum hold time is 120 seconds (Ticket: ${ticket})`
      };
    }

    // 3. Max Execution Frequency (180 seconds between opens)
    const tradesRef = db.collection('users').doc(userId).collection('trades');
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

    // 4. Martingale Detection (Lot increase after loss on same symbol within 15 mins)
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
          reason: `Martingale lot scaling detected: lot size increased to ${volume} after a loss on ${symbol} within 15 minutes`
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
    const loginNum = Number(loginStr);

    const accountsRef = db.collection('mt5_accounts');
    let snapshot = await accountsRef.where('login', '==', loginStr).limit(1).get();

    if (snapshot.empty && !isNaN(loginNum)) {
      snapshot = await accountsRef.where('login', '==', loginNum).limit(1).get();
    }

    if (snapshot.empty) {
      return new Response(JSON.stringify({ status: "OK", note: "User not found" }), { status: 200 });
    }

    const accountDoc = snapshot.docs[0];
    const accountData = accountDoc.data();
    const userId = accountData.userId;

    if (!userId) return new Response(JSON.stringify({ status: "OK", note: "No userId linked" }), { status: 200 });

    // 1. Save trades to database
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
        duration: trade.duration || (trade.time && trade.openTime ? trade.time - trade.openTime : null),
        date: new Date(trade.time * 1000),
        createdAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    await batch.commit();

    // 2. Evaluate Risk Rules (Skip if already breached)
    if (accountData.status !== 'breached') {
      const riskCheck = await evaluateTradeRules(db, userId, accountDoc, trades);
      
      if (riskCheck.breached) {
        const breachReason = riskCheck.reason;
        
        await accountDoc.ref.update({
          status: 'breached',
          breachReason: breachReason,
          breachedAt: FieldValue.serverTimestamp()
        });

        await db.collection('users').doc(userId).update({
          accountStatus: 'breached',
          breachReason: breachReason,
          breachedAt: FieldValue.serverTimestamp()
        });

        await db.collection('breaches').add({
          userId,
          userEmail: accountData.email || 'N/A',
          userName: accountData.name || 'N/A',
          login: loginStr,
          breachType: 'hard',
          breachReason: breachReason,
          breachedAt: FieldValue.serverTimestamp()
        });

        await db.collection('users').doc(userId).collection('notifications').add({
          title: "🚫 Account Liquidated",
          message: `Risk Engine detected a violation: ${breachReason}`,
          type: 'challenge_failed',
          isRead: false,
          createdAt: FieldValue.serverTimestamp()
        });
      }
    }

    return new Response(JSON.stringify({ status: "OK", saved: trades.length }), { status: 200 });
  } catch (error: any) {
    console.error('[MT5-Trades] Error:', error.message);
    return new Response(JSON.stringify({ status: "ERROR", message: error.message }), { status: 500 });
  }
}