import { NextRequest, NextResponse } from "next/server";
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const CONTRACT_SIZE: Record<string, number> = {
  XAUUSD: 100, BTCUSD: 1, EURUSD: 100000, GBPUSD: 100000, USDJPY: 100000,
};

function getAdminDb() {
  if (!getApps().length) {
    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (!serviceAccountKey) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_KEY');
    try {
      const serviceAccount = JSON.parse(
        serviceAccountKey.startsWith("'") 
          ? serviceAccountKey.slice(1, -1) 
          : serviceAccountKey
      );
      initializeApp({
        credential: cert(serviceAccount),
      });
    } catch (e: any) {
      throw new Error(`Admin SDK Init Error: ${e.message}`);
    }
  }
  return getFirestore();
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "No auth token" }, { status: 401 });

    let uid: string;
    try {
      const decoded = await getAuth().verifyIdToken(token);
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
      if (account.startBalance - newBalance >= account.maxLoss) {
        newStatus = "blown";
      } else if (newBalance - account.startBalance >= account.profitTarget) {
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
      });
    });

    return NextResponse.json({ ok: true, pnl, closePrice });
  } catch (error: any) {
    console.error('[Close-Trade-API] Error:', error);
    return NextResponse.json({ error: "Internal Server Error", details: error.message }, { status: 500 });
  }
}
