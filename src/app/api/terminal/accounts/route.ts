import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

const PLANS: Record<string, { balance: number; maxLoss: number; dailyLoss: number; profitTarget: number; label: string }> = {
  "10k": { balance: 10000, maxLoss: 500, dailyLoss: 500, profitTarget: 800, label: "$10,000" },
  "25k": { balance: 25000, maxLoss: 1250, dailyLoss: 1250, profitTarget: 2000, label: "$25,000" },
  "50k": { balance: 50000, maxLoss: 2500, dailyLoss: 2500, profitTarget: 4000, label: "$50,000" },
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
    } catch (err) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const { plan } = await req.json();
    const p = PLANS[plan];
    if (!p) return NextResponse.json({ error: "Invalid plan" }, { status: 400 });

    const db = getAdminDb();
    const docRef = await db.collection("demoAccounts").add({
      userId: uid,
      plan,
      label: `Phase 1 — ${p.label} Challenge`,
      balance: p.balance,
      equity: p.balance,
      startBalance: p.balance,
      maxLoss: p.maxLoss,
      dailyLoss: p.dailyLoss,
      profitTarget: p.profitTarget,
      status: "active",
      createdAt: Timestamp.now(),
    });

    return NextResponse.json({ ok: true, accountId: docRef.id });
  } catch (error: any) {
    console.error('[Demo-Account-API] Fatal Error:', error);
    return NextResponse.json({ error: "Internal Server Error", details: error.message }, { status: 500 });
  }
}
