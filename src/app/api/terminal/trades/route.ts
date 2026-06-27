
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
    
    // Case-insensitive status check
    if (account.status?.toLowerCase() !== "active") return NextResponse.json({ error: "Account is locked" }, { status: 400 });

    // LOT SIZE VALIDATION (ANTI-CHEAT)
    const plan = account.plan || '10k';
    const planKey = plan.replace('$', '').replace(',', '').toLowerCase();
    const maxAllowed = MAX_LOTS[planKey] || 0.5;
    
    if (lots > maxAllowed) {
      return NextResponse.json({ 
        error: `Institutional Violation`, 
        details: `Max lot size for ${plan} plan is ${maxAllowed}. Requested: ${lots}` 
      }, { status: 400 });
    }

    /**
     * SERVER-SIDE PRICE VALIDATION (1% THRESHOLD)
     */
    const yahooSymbol = YAHOO_MAP[symbol];
    if (!yahooSymbol) return NextResponse.json({ error: "Unsupported symbol" }, { status: 400 });

    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/spark?symbols=${encodeURIComponent(yahooSymbol)}&range=1d&interval=1m`;
      const res = await fetch(url, { cache: 'no-store' });
      const data = await res.json();
      const serverPrice = data.spark?.result?.[0]?.response?.[0]?.meta?.regularMarketPrice;

      if (serverPrice) {
        const executionPrice = parseFloat(String(clientPrice));
        const diff = Math.abs(executionPrice - serverPrice) / serverPrice;

        if (diff > 0.01) { 
          return NextResponse.json({ 
            error: "Execution Price Out of Sync", 
            details: `Market variance detected. Please refresh terminal.` 
          }, { status: 400 });
        }
      }
    } catch (e: any) {
      console.error("[Price-Validation-Error]", e.message);
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
      ip: req.headers.get('x-forwarded-for')?.split(',')[0] || req.headers.get('x-real-ip') || 'unknown',
      userAgent: req.headers.get('user-agent') || 'unknown',
    });

    return NextResponse.json({ ok: true, tradeId: tradeRef.id, openPrice: clientPrice });
  } catch (error: any) {
    console.error('[Open-Trade-API] Error:', error);
    return NextResponse.json({ error: "Internal Server Error", details: error.message }, { status: 500 });
  }
}
