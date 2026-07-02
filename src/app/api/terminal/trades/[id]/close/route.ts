import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { auditDemoAccount } from '@/lib/rulesEngine';
import { sendEmail } from '@/lib/email';

const CONTRACT_SIZE: Record<string, number> = {
  XAUUSD: 100, BTCUSD: 1, ETHUSD: 1, EURUSD: 100000, GBPUSD: 100000, USDJPY: 100000,
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
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
    const clientClosePrice = body.closePrice ? parseFloat(String(body.closePrice)) : null;
    const closeReason = body.closeReason || "manual";

    const db = getAdminDb();
    const tradeRef = db.collection("demoTrades").doc(id);
    const tradeSnap = await tradeRef.get();
    if (!tradeSnap.exists) return NextResponse.json({ error: "Trade not found" }, { status: 404 });
    const trade = tradeSnap.data()!;
    if (trade.userId !== uid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (trade.status !== "open") return NextResponse.json({ error: "Already closed" }, { status: 400 });

    let closePrice = clientClosePrice;
    if (!closePrice) {
      const snap = await db.collection("livePrices").doc(trade.symbol.toUpperCase()).get();
      if (!snap.exists) return NextResponse.json({ error: "No price feed" }, { status: 400 });
      const pData = snap.data()!;
      closePrice = trade.type === "buy" ? (pData.bid || pData.price) : (pData.ask || pData.price);
    }

    const contractSize = CONTRACT_SIZE[trade.symbol.toUpperCase()] || 100000;
    const pnl = (trade.type === "buy" ? closePrice! - trade.openPrice : trade.openPrice - closePrice!) * trade.lots * contractSize;

    const accRef = db.collection("demoAccounts").doc(trade.accountId);

    await db.runTransaction(async (tx) => {
      const accSnap = await tx.get(accRef);
      if (!accSnap.exists) throw new Error("Account missing");
      const account = accSnap.data()!;
      
      tx.update(tradeRef, {
        status: "closed",
        closeReason,
        closePrice,
        pnl,
        closedAt: Timestamp.now(),
      });

      tx.update(accRef, {
        balance: FieldValue.increment(pnl),
        updatedAt: FieldValue.serverTimestamp()
      });
    });

    // Notify User
    await db.collection('users').doc(uid).collection('notifications').add({
      title: '💼 Position Closed',
      message: `${trade.symbol} closed at ${closePrice?.toFixed(5)}. PnL: $${pnl.toFixed(2)}`,
      type: 'trade_closed',
      isRead: false,
      createdAt: FieldValue.serverTimestamp()
    });

    // RUN AUDIT IMMEDIATELY
    await auditDemoAccount(trade.accountId);

    return NextResponse.json({ ok: true, pnl, closePrice });
  } catch (error: any) {
    console.error('[Close-Trade-API] Error:', error);
    return NextResponse.json({ error: "Internal Server Error", details: error.message }, { status: 500 });
  }
}