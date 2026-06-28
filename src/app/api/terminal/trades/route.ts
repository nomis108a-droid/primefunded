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
    if (!token) return NextResponse.json({ error: "No auth token provided" }, { status: 401 });

    let uid: string;
    try {
      const decoded = await getAdminAuth().verifyIdToken(token);
      uid = decoded.uid;
    } catch (err) {
      return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });
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
    if (account.userId !== uid) return NextResponse.json({ error: "Permission denied for this account" }, { status: 403 });
    
    const status = (account.status || "").toLowerCase();
    if (status !== "active") return NextResponse.json({ error: `Account is currently ${status} and locked for execution.` }, { status: 400 });

    // EXECUTION FREQUENCY RULE: 3 Minute minimum between trades
    const lastTradesSnap = await db.collection("demoTrades")
      .where("accountId", "==", accountId)
      .limit(5)
      .get();
    
    if (!lastTradesSnap.empty) {
      const latestTrade = lastTradesSnap.docs
        .map(d => d.data())
        .sort((a, b) => {
          const timeA = a.openedAt?.toDate?.()?.getTime() || (a.openedAt?.seconds ? a.openedAt.seconds * 1000 : new Date(a.openedAt).getTime()) || 0;
          const timeB = b.openedAt?.toDate?.()?.getTime() || (b.openedAt?.seconds ? b.openedAt.seconds * 1000 : new Date(b.openedAt).getTime()) || 0;
          return timeB - timeA;
        })[0];

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

    // LOT SIZE VALIDATION (ANTI-CHEAT)
    const rawPlan = String(account.plan || '10k');
    let planKey = rawPlan.toLowerCase().trim();
    
    // Normalize "$10,000" or "10000" to "10k"
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

    // Price Validation (2% Tolerance for high volatility)
    const yahooSymbol = YAHOO_MAP[symbol];
    if (yahooSymbol) {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/spark?symbols=${encodeURIComponent(yahooSymbol)}&range=1d&interval=1m`;
        const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(3000) });
        if (res.ok) {
          const data = await res.json();
          const serverPrice = data.spark?.result?.[0]?.response?.[0]?.meta?.regularMarketPrice;
          if (serverPrice) {
            const diff = Math.abs(executionPrice - serverPrice) / serverPrice;
            if (diff > 0.02) { 
              return NextResponse.json({ 
                error: "Market Data Out of Sync", 
                details: "Terminal pricing variance detected. Please refresh for synchronized institutional feed." 
              }, { status: 400 });
            }
          }
        }
      } catch (e) {
        console.warn("[Price-Validation-Bypassed]", symbol);
      }
    }

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
    console.error('[Open-Trade-API] Critical Error:', error);
    return NextResponse.json({ 
      error: "Internal Terminal Fault", 
      details: error.message || "An unexpected error occurred during execution." 
    }, { status: 500 });
  }
}