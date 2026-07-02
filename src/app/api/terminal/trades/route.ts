import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

/**
 * @fileOverview Institutional Order Execution API
 * Processes market orders for demo environments with strict risk guardrails.
 */

const MAX_LOTS: Record<string, number> = {
  '10k': 0.5,
  '25k': 1.25,
  '50k': 2.5,
  '100k': 5.0,
  '200k': 10.0,
};

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "No auth token provided" }, { status: 401 });

    let uid: string;
    try {
      // 1. Verify User Identity
      const decoded = await getAdminAuth().verifyIdToken(token);
      uid = decoded.uid;
    } catch (err: any) {
      console.error('[Trade-API] Token verification failed:', err.code || 'UNKNOWN_ERROR', err.message);
      return NextResponse.json({ 
        error: "Execution Failed: Invalid or expired session", 
        details: `${err.code}: ${err.message}`,
        code: err.code 
      }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { accountId, symbol, type, lots: rawLots, sl, tp, price: clientPrice } = body;

    if (!accountId || !symbol || !type || !rawLots || !clientPrice) {
      return NextResponse.json({ error: "Missing required order parameters (symbol, type, lots, price)" }, { status: 400 });
    }

    const lots = parseFloat(String(rawLots));
    const executionPrice = parseFloat(String(clientPrice));

    const db = getAdminDb();
    const accSnap = await db.collection("demoAccounts").doc(accountId).get();
    
    if (!accSnap.exists) return NextResponse.json({ error: "Trading account not found" }, { status: 404 });
    const account = accSnap.data()!;
    if (account.userId !== uid) return NextResponse.json({ error: "Permission denied: Account ownership mismatch" }, { status: 403 });
    
    const status = (account.status || "").toLowerCase();
    if (status !== "active") return NextResponse.json({ error: `Account is currently ${status} and locked for execution.` }, { status: 400 });

    // 2. EXECUTION FREQUENCY RULE: 3 Minute minimum between trades
    // Simplified: Fetch and sort in memory to avoid missing composite index errors
    const lastTradesSnap = await db.collection("demoTrades")
      .where("accountId", "==", accountId)
      .get();
    
    if (!lastTradesSnap.empty) {
      const sortedTrades = lastTradesSnap.docs
        .map(d => d.data())
        .sort((a: any, b: any) => {
          const dateA = a.openedAt?.toDate?.() || (a.openedAt?.seconds ? new Date(a.openedAt.seconds * 1000) : new Date(a.openedAt));
          const dateB = b.openedAt?.toDate?.() || (b.openedAt?.seconds ? new Date(b.openedAt.seconds * 1000) : new Date(b.openedAt));
          return dateB.getTime() - dateA.getTime();
        });

      const latestTrade = sortedTrades[0];
      if (latestTrade && latestTrade.openedAt) {
        const timeVal = latestTrade.openedAt.toDate ? latestTrade.openedAt.toDate().getTime() : (latestTrade.openedAt.seconds ? latestTrade.openedAt.seconds * 1000 : new Date(latestTrade.openedAt).getTime());
        const diffMs = Date.now() - timeVal;
        if (diffMs < 3 * 60 * 1000) {
          const remainingSecs = Math.ceil((3 * 60 * 1000 - diffMs) / 1000);
          return NextResponse.json({ 
            error: "Execution Frequency Violation", 
            details: `Institutional spacing protocol active. Please wait ${remainingSecs}s before placing your next order.` 
          }, { status: 400 });
        }
      }
    }

    // 3. LOT SIZE VALIDATION (ANTI-CHEAT)
    const rawPlan = String(account.plan || '10k');
    let planKey = rawPlan.toLowerCase().trim();
    if (!planKey.includes('k')) {
      const numericPart = parseInt(rawPlan.replace(/[^0-9]/g, ''));
      if (!isNaN(numericPart)) {
        planKey = `${numericPart / 1000}k`;
      }
    }
    const maxAllowed = MAX_LOTS[planKey] || 0.5;
    if (lots > maxAllowed) {
      return NextResponse.json({ 
        error: `Institutional Lot Violation`, 
        details: `Maximum allowable lot size for ${rawPlan} accounts is ${maxAllowed}. Requested: ${lots}` 
      }, { status: 400 });
    }

    // 4. Record Trade
    const tradeRef = await db.collection("demoTrades").add({
      userId: uid,
      accountId,
      symbol,
      type,
      lots,
      openPrice: executionPrice,
      sl: sl ? parseFloat(String(sl)) : null,
      tp: tp ? parseFloat(String(tp)) : null,
      status: "open",
      pnl: 0,
      openedAt: Timestamp.now(),
      closedAt: null,
      closePrice: null,
      ip: req.headers.get('x-forwarded-for')?.split(',')[0] || req.headers.get('x-real-ip') || 'unknown',
      userAgent: req.headers.get('user-agent') || 'unknown',
    });

    return NextResponse.json({ ok: true, tradeId: tradeRef.id, openPrice: executionPrice });
  } catch (error: any) {
    console.error('[Trade-API] Critical Terminal Error:', error);
    return NextResponse.json({ 
      error: "Internal Terminal Fault", 
      details: error.message || "An unexpected error occurred during execution." 
    }, { status: 500 });
  }
}
