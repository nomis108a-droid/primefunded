import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin';

/**
 * @fileOverview Trade Modification API
 * Allows traders to update SL/TP levels for open positions.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    const { sl, tp } = await req.json();
    const db = getAdminDb();
    const tradeRef = db.collection("demoTrades").doc(id);
    const tradeSnap = await tradeRef.get();

    if (!tradeSnap.exists) return NextResponse.json({ error: "Trade not found" }, { status: 404 });
    const trade = tradeSnap.data()!;
    
    if (trade.userId !== uid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (trade.status !== "open") return NextResponse.json({ error: "Trade is already closed" }, { status: 400 });

    const updates: any = {};
    if (sl !== undefined) updates.sl = sl === "" || sl === null ? null : parseFloat(String(sl));
    if (tp !== undefined) updates.tp = tp === "" || tp === null ? null : parseFloat(String(tp));

    await tradeRef.update(updates);

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('[Update-Trade-API] Error:', error);
    return NextResponse.json({ error: "Internal Server Error", details: error.message }, { status: 500 });
  }
}
