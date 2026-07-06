import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { auditDemoAccount } from '@/lib/rulesEngine';

/**
 * @fileOverview Institutional Order Execution API
 * Processes market orders for demo environments with strict risk guardrails and commission engine.
 * Enforces unified pricing: BUY opens at ASK, SELL opens at BID.
 */

const MAX_LOTS: Record<string, number> = {
  '5k': 0.25,
  '10k': 0.5,
  '25k': 1.25,
  '50k': 2.5,
  '100k': 5.0,
  '200k': 10.0,
  '300k': 15.0,
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
      return NextResponse.json({ 
        error: "Execution Failed: Invalid or expired session", 
        code: err.code 
      }, { status: 401 });
    }

    const db = getAdminDb();

    // ── BLOCK TRADING IF PAYOUT IS PENDING ──
    const pendingPayouts = await db.collection('payouts')
      .where('userId', '==', uid)
      .where('status', '==', 'pending')
      .limit(1)
      .get();

    if (!pendingPayouts.empty) {
      return NextResponse.json({ error: "Trading suspended: You have a pending payout request" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const { accountId, symbol, type, lots: rawLots, sl, tp, orderType } = body;

    if (!accountId || !symbol || !type || !rawLots) {
      return NextResponse.json({ error: "Missing required order parameters" }, { status: 400 });
    }

    const lots = parseFloat(String(rawLots));
    
    // Fetch unified feed price for verification and logging
    const symUpper = symbol.toUpperCase().trim();
    const marketSnap = await db.collection('market').doc(symUpper).get();
    const feed = marketSnap.exists ? marketSnap.data() : (await db.collection('livePrices').doc(symUpper).get()).data();

    if (!feed) {
      return NextResponse.json({ error: "No market feed available for execution" }, { status: 400 });
    }

    // ── UNIFIED EXECUTION LOGIC ──
    // BUY opens at ASK, SELL opens at BID
    const executionPrice = type === 'buy' ? feed.ask : feed.bid;

    const accRef = db.collection("demoAccounts").doc(accountId);
    const accSnap = await accRef.get();
    
    if (!accSnap.exists) return NextResponse.json({ error: "Trading account not found" }, { status: 404 });
    const account = accSnap.data()!;
    if (account.userId !== uid) return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    
    if (account.status === 'blown' || account.status === 'breach' || account.status === 'terminated') {
      return NextResponse.json({ error: 'Account breached: Trading is permanently disabled on this node.' }, { status: 403 });
    }
    
    if (account.status !== "active") return NextResponse.json({ error: `Account is ${account.status}` }, { status: 400 });

    // 1. Lot Size Validation
    const rawPlan = String(account.plan || '10k');
    let planKey = rawPlan.toLowerCase().trim().replace('$', '');
    if (!planKey.includes('k')) {
      const num = parseInt(rawPlan.replace(/[^0-9]/g, ''));
      if (!isNaN(num)) planKey = `${num / 1000}k`;
    }
    const maxAllowed = MAX_LOTS[planKey] || 0.5;
    if (lots > maxAllowed) {
      return NextResponse.json({ error: `Institutional Lot Violation: Max ${maxAllowed} for ${rawPlan}` }, { status: 400 });
    }

    // 2. Commission Engine
    const commission = (() => {
      const sym = symUpper;
      const isForex = !['XAUUSD','BTCUSD','ETHUSD','XRPUSD','SOLUSD','DOGEUSD','ADAUSD','BNBUSD','XAGUSD','XPTUSD'].includes(sym);
      const isGold = sym === 'XAUUSD';
      const isCrypto = ['BTCUSD','ETHUSD','XRPUSD','SOLUSD','DOGEUSD','ADAUSD','BNBUSD'].includes(sym);
      
      if (isForex) return lots * 5; 
      if (isGold) return lots * 0.30; 
      if (isCrypto) return (lots * executionPrice) * 0.0005; 
      return 0;
    })();

    // 3. Atomic Order Entry with Snapshotted Ticks
    const tradeRef = db.collection("demoTrades").doc();
    await db.runTransaction(async (tx) => {
      tx.set(tradeRef, {
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
        orderType: orderType || 'market',
        openedAt: Timestamp.now(),
        closedAt: null,
        closePrice: null,
      });

      tx.update(accRef, {
        balance: FieldValue.increment(-commission),
        updatedAt: FieldValue.serverTimestamp()
      });
    });

    await db.collection('users').doc(uid).collection('notifications').add({
      title: '📈 Trade Opened',
      message: `${type.toUpperCase()} ${lots} ${symUpper} @ ${executionPrice.toFixed(5)}`,
      type: 'trade_opened',
      isRead: false,
      createdAt: FieldValue.serverTimestamp()
    });

    await auditDemoAccount(accountId);

    return NextResponse.json({ ok: true, tradeId: tradeRef.id, openPrice: executionPrice });
  } catch (error: any) {
    console.error('[Trade-API] Critical Terminal Error:', error);
    return NextResponse.json({ error: "Internal Terminal Fault", details: error.message }, { status: 500 });
  }
}
