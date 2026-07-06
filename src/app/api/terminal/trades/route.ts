import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { auditDemoAccount } from '@/lib/rulesEngine';

/**
 * @fileOverview Institutional Order Execution API
 * Hardened with server-side execution locks and atomic transactions.
 * Enforces unified pricing: BUY opens at ASK, SELL opens at BID.
 */

const MAX_LOTS: Record<string, number> = {
  '5k': 0.25, '10k': 0.5, '25k': 1.25, '50k': 2.5, '100k': 5.0, '200k': 10.0, '300k': 15.0,
};

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "No auth token provided" }, { status: 401 });

    let uid: string;
    try {
      const decoded = await getAdminAuth().verifyIdToken(token);
      uid = decoded.uid;
    } catch (err: any) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const db = getAdminDb();
    const body = await req.json().catch(() => ({}));
    const { accountId, symbol, type, lots: rawLots, sl, tp } = body;

    if (!accountId || !symbol || !type || !rawLots) {
      return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
    }

    const symUpper = symbol.toUpperCase().trim();
    const lots = parseFloat(String(rawLots));

    // 1. GLOBAL EXECUTION LOCK: Prevent Duplicate Positions
    const activeLockRef = db.collection('_locks').doc(uid);
    const lockSnap = await activeLockRef.get();
    if (lockSnap.exists) {
      const lockData = lockSnap.data()!;
      if (Date.now() - lockData.timestamp < 3000) {
        return NextResponse.json({ error: "Execution already in progress. Please wait." }, { status: 429 });
      }
    }
    await activeLockRef.set({ timestamp: Date.now(), accountId });

    // 2. FETCH权威FEED
    const marketRef = db.collection('market').doc(symUpper);
    const marketSnap = await marketRef.get();
    const feed = marketSnap.exists ? marketSnap.data() : (await db.collection('livePrices').doc(symUpper).get()).data();

    if (!feed || !feed.bid || !feed.ask) {
      await activeLockRef.delete();
      return NextResponse.json({ error: "Market source offline" }, { status: 400 });
    }

    // ── UNIFIED EXECUTION LOGIC ──
    // BUY opens at ASK, SELL opens at BID
    const executionPrice = type === 'buy' ? feed.ask : feed.bid;

    const accRef = db.collection("demoAccounts").doc(accountId);
    const accSnap = await accRef.get();
    
    if (!accSnap.exists) {
      await activeLockRef.delete();
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }
    
    const account = accSnap.data()!;
    if (account.userId !== uid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (account.status !== "active") return NextResponse.json({ error: `Account is ${account.status}` }, { status: 400 });

    // 3. COMMISSION & LOT CHECK
    const rawPlan = String(account.plan || '10k');
    const planKey = rawPlan.toLowerCase().trim().replace('$', '');
    const maxAllowed = MAX_LOTS[planKey] || 0.5;
    if (lots > maxAllowed) {
      await activeLockRef.delete();
      return NextResponse.json({ error: `Lot Violation: Max ${maxAllowed} for ${rawPlan}` }, { status: 400 });
    }

    const commission = (() => {
      const isForex = !['XAUUSD','BTCUSD','ETHUSD','XRPUSD','SOLUSD','DOGEUSD','ADAUSD','BNBUSD','XAGUSD','XPTUSD'].includes(symUpper);
      if (isForex) return lots * 5; 
      if (symUpper === 'XAUUSD') return lots * 0.30; 
      return (lots * executionPrice) * 0.0005; 
    })();

    // 4. ATOMIC ORDER ENTRY
    const tradeRef = db.collection("demoTrades").doc();
    await db.runTransaction(async (tx) => {
      tx.set(tradeRef, {
        id: tradeRef.id,
        userId: uid,
        accountId,
        symbol: symUpper,
        type,
        lots,
        openPrice: executionPrice,
        openBid: feed.bid,
        openAsk: feed.ask,
        commission,
        sl: sl ? parseFloat(String(sl)) : null,
        tp: tp ? parseFloat(String(tp)) : null,
        status: "open",
        pnl: 0,
        openedAt: Timestamp.now(),
      });

      tx.update(accRef, {
        balance: FieldValue.increment(-commission),
        updatedAt: FieldValue.serverTimestamp()
      });
    });

    // 5. Cleanup
    await activeLockRef.delete();
    await auditDemoAccount(accountId);

    return NextResponse.json({ ok: true, tradeId: tradeRef.id, openPrice: executionPrice });
  } catch (error: any) {
    console.error('[Trade-API] Fatal Error:', error);
    return NextResponse.json({ error: "Internal Error", details: error.message }, { status: 500 });
  }
}
