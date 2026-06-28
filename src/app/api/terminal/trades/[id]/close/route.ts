import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

const CONTRACT_SIZE: Record<string, number> = {
  XAUUSD: 100, BTCUSD: 1, EURUSD: 100000, GBPUSD: 100000, USDJPY: 100000,
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

    const db = getAdminDb();
    const tradeRef = db.collection("demoTrades").doc(id);
    const tradeSnap = await tradeRef.get();
    if (!tradeSnap.exists) return NextResponse.json({ error: "Trade not found" }, { status: 404 });
    const trade = tradeSnap.data()!;
    if (trade.userId !== uid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (trade.status !== "open") return NextResponse.json({ error: "Already closed" }, { status: 400 });

    // MINIMUM HOLD TIME RULE: 2 Minutes before manual close
    const openTime = trade.openedAt?.toDate?.() || new Date(trade.openedAt);
    const holdTimeMs = Date.now() - openTime.getTime();
    if (holdTimeMs < 2 * 60 * 1000) {
      return NextResponse.json({ 
        error: "Minimum Hold Time Violation", 
        details: "Trades must be held for at least 2 minutes before manual closure." 
      }, { status: 400 });
    }

    const priceSnap = await db.collection("livePrices").doc(trade.symbol).get();
    if (!priceSnap.exists) return NextResponse.json({ error: "No price for symbol" }, { status: 400 });
    const priceData = priceSnap.data()!;
    const closePrice = trade.type === "buy" ? priceData.bid : priceData.ask;

    const diff = trade.type === "buy" ? closePrice - trade.openPrice : trade.openPrice - closePrice;
    const pnl = diff * trade.lots * (CONTRACT_SIZE[trade.symbol] || 100000);

    const accRef = db.collection("demoAccounts").doc(trade.accountId);

    await db.runTransaction(async (tx) => {
      const accSnap = await tx.get(accRef);
      if (!accSnap.exists) throw new Error("Account not found during transaction");
      
      const account = accSnap.data()!;
      const newBalance = account.balance + pnl;

      let newStatus = account.status;
      let breachReason = account.breachReason || null;

      // Rule 1: Max Total Loss (Fixed)
      if (account.startBalance - newBalance >= account.maxLoss) {
        newStatus = "blown";
        breachReason = `Maximum Drawdown Limit Hit ($${account.maxLoss})`;
      } 
      // Rule 2: Single Trade Loss Breach (3% of balance)
      else if (pnl < 0 && Math.abs(pnl) >= (account.balance * 0.03)) {
        newStatus = "blown";
        breachReason = "Single Trade Loss Limit Hit (3% Max)";
      }
      // Rule 3: Profit Target
      else if (newBalance - account.startBalance >= account.profitTarget) {
        newStatus = "passed";
      }

      tx.update(tradeRef, {
        status: "closed",
        closePrice,
        pnl,
        closedAt: Timestamp.now(),
      });

      tx.update(accRef, {
        balance: newBalance,
        equity: newBalance,
        status: newStatus,
        breachReason
      });
    });

    return NextResponse.json({ ok: true, pnl, closePrice });
  } catch (error: any) {
    console.error('[Close-Trade-API] Error:', error);
    return NextResponse.json({ error: "Internal Server Error", details: error.message }, { status: 500 });
  }
}
