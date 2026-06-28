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

    const body = await req.json().catch(() => ({}));
    const { accountId, symbol, type, lots: rawLots, sl, tp, price: clientPrice } = body;

    if (!accountId || !symbol || !type || !rawLots || !clientPrice) {
      return NextResponse.json({ error: "Missing required order parameters" }, { status: 400 });
    }

    const lots = parseFloat(String(rawLots));
    const executionPrice = parseFloat(String(clientPrice));

    const db = getAdminDb();
    const accSnap = await db.collection("demoAccounts").doc(accountId).get();
    
    if (!accSnap.exists) return NextResponse.json({ error: "Account not found" }, { status: 404 });
    const account = accSnap.data()!;
    if (account.userId !== uid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    
    const status = (account.status || "").toLowerCase();
    if (status !== "active") return NextResponse.json({ error: `Account is ${status}` }, { status: 400 });

    // EXECUTION FREQUENCY RULE: 3 Minute minimum between trades
    // Optimization: Fetch the most recent trades for this account and sort in memory to avoid index requirement
    const lastTradesSnap = await db.collection("demoTrades")
      .where("accountId", "==", accountId)
      .limit(5)
      .get();
    
    if (!lastTradesSnap.empty) {
      const latestTrade = lastTradesSnap.docs
        .map(d => d.data())
        .sort((a, b) => {
          const timeA = a.openedAt?.toDate?.()?.getTime() || new Date(a.openedAt).getTime() || 0;
          const timeB = b.openedAt?.toDate?.()?.getTime() || new Date(b.openedAt).getTime() || 0;
          return timeB - timeA;
        })[0];

      if (latestTrade) {
        const lastOpened = latestTrade.openedAt?.toDate?.() || new Date(latestTrade.openedAt);
        const diffMs = Date.now() - lastOpened.getTime();
        if (diffMs < 3 * 60 * 1000) {
          const remainingSecs = Math.ceil((3 * 60 * 1000 - diffMs) / 1000);
          return NextResponse.json({ 
            error: "Execution Frequency Violation", 
            details: `Institutional spacing active. Please wait ${remainingSecs}s before next order.` 
          }, { status: 400 });
        }
      }
    }

    // LOT SIZE VALIDATION (ANTI-CHEAT)
    const rawPlan = account.plan || '10k';
    const planKey = rawPlan.toLowerCase().includes('k') 
      ? rawPlan.toLowerCase().trim() 
      : `${parseInt(rawPlan.replace(/[^0-9]/g, '')) / 1000}k`;
    
    const maxAllowed = MAX_LOTS[planKey] || 0.5;
    
    if (lots > maxAllowed) {
      return NextResponse.json({ 
        error: `Institutional Violation`, 
        details: `Max lot size for ${rawPlan} plan is ${maxAllowed}. Requested: ${lots}` 
      }, { status: 400 });
    }

    // Price Validation (1% Tolerance)
    const yahooSymbol = YAHOO_MAP[symbol];
    if (yahooSymbol) {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/spark?symbols=${encodeURIComponent(yahooSymbol)}&range=1d&interval=1m`;
        const res = await fetch(url, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          const serverPrice = data.spark?.result?.[0]?.response?.[0]?.meta?.regularMarketPrice;
          if (serverPrice) {
            const diff = Math.abs(executionPrice - serverPrice) / serverPrice;
            if (diff > 0.015) { // Relaxed to 1.5% for high volatility crypto/gold
              return NextResponse.json({ 
                error: "Execution Price Out of Sync", 
                details: "Market variance detected. Please refresh terminal for latest pricing." 
              }, { status: 400 });
            }
          }
        }
      } catch (e) {
        // Log price validation failure but allow trade if market APIs are down
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
    console.error('[Open-Trade-API] Fatal Error:', error);
    return NextResponse.json({ error: "Internal Server Error", details: error.message }, { status: 500 });
  }
}
