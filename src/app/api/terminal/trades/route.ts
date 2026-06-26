import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

const CONTRACT_SIZE: Record<string, number> = {
  XAUUSD: 100, BTCUSD: 1, EURUSD: 100000, GBPUSD: 100000, USDJPY: 100000,
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

    const priceSnap = await db.collection("livePrices").doc(symbol).get();
    if (!priceSnap.exists) return NextResponse.json({ error: "No price for symbol" }, { status: 400 });
    const priceData = priceSnap.data()!;

    // ── Price Freshness Check ─────────────────────────────────
    // Relaxed to 300s (5 minutes) to support Yahoo Finance polling fallback
    const updatedAt = priceData.updatedAt?.toMillis?.() || 0;
    const ageMs = Date.now() - updatedAt;
    if (ageMs > 300 * 1000) {
      return NextResponse.json({ error: "Price feed stale" }, { status: 503 });
    }

    // Use price from client (Yahoo) if provided, otherwise fallback to Firestore bridge
    const openPrice = clientPrice || (type === "buy" ? priceData.ask : priceData.bid);

    const tradeRef = await db.collection("demoTrades").add({
      userId: uid,
      accountId,
      symbol,
      type,
      lots,
      openPrice,
      sl: sl || null,
      tp: tp || null,
      status: "open",
      pnl: 0,
      openedAt: Timestamp.now(),
      closedAt: null,
      closePrice: null,
    });

    return NextResponse.json({ ok: true, tradeId: tradeRef.id, openPrice });
  } catch (error: any) {
    console.error('[Open-Trade-API] Error:', error);
    return NextResponse.json({ error: "Internal Server Error", details: error.message }, { status: 500 });
  }
}
