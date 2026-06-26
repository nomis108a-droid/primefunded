import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

const YAHOO_MAP: Record<string, string> = {
  'XAUUSD': 'GC=F',
  'BTCUSD': 'BTC-USD',
  'ETHUSD': 'ETH-USD',
  'EURUSD': 'EURUSD=X',
  'GBPUSD': 'GBPUSD=X',
  'USDJPY': 'JPY=X',
};

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "No auth token" }, { status: 401 });

    let uid: string;
    try {
      const decoded = await getAdminAuth().verifyIdToken(token);
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const { accountId, symbol, type, lots, sl, tp, price: clientPrice } = await req.json();

    const db = getAdminDb();
    const accSnap = await db.collection("demoAccounts").doc(accountId).get();
    if (!accSnap.exists) return NextResponse.json({ error: "Account not found" }, { status: 404 });
    const account = accSnap.data()!;
    if (account.userId !== uid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (account.status !== "active") return NextResponse.json({ error: "Account is locked" }, { status: 400 });

    /**
     * SERVER-SIDE PRICE VALIDATION (1% THRESHOLD)
     * We fetch fresh data from Yahoo to prevent spoofing.
     */
    const yahooSymbol = YAHOO_MAP[symbol];
    if (!yahooSymbol) return NextResponse.json({ error: "Unsupported symbol" }, { status: 400 });

    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/spark?symbols=${encodeURIComponent(yahooSymbol)}&range=1d&interval=1m`;
      const res = await fetch(url, { cache: 'no-store' });
      const data = await res.json();
      const serverPrice = data.spark?.result?.[0]?.response?.[0]?.meta?.regularMarketPrice;

      if (!serverPrice) throw new Error("Price feed unavailable");

      const executionPrice = parseFloat(String(clientPrice));
      const diff = Math.abs(executionPrice - serverPrice) / serverPrice;

      if (diff > 0.01) { // 1% mismatch tolerance
        return NextResponse.json({ 
          error: "Price mismatch", 
          details: `Client: ${executionPrice}, Server: ${serverPrice}. Mismatch: ${(diff * 100).toFixed(2)}%` 
        }, { status: 400 });
      }
    } catch (e: any) {
      console.error("[Price-Validation-Error]", e.message);
      // Fallback: If price feed fails during check, we allow the trade but log it
    }

    const tradeRef = await db.collection("demoTrades").add({
      userId: uid,
      accountId,
      symbol,
      type,
      lots,
      openPrice: parseFloat(String(clientPrice)),
      sl: sl || null,
      tp: tp || null,
      status: "open",
      pnl: 0,
      openedAt: Timestamp.now(),
      closedAt: null,
      closePrice: null,
    });

    return NextResponse.json({ ok: true, tradeId: tradeRef.id, openPrice: clientPrice });
  } catch (error: any) {
    console.error('[Open-Trade-API] Error:', error);
    return NextResponse.json({ error: "Internal Server Error", details: error.message }, { status: 500 });
  }
}
