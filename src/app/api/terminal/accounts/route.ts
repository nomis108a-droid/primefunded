import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { RULES_CONFIG } from '@/lib/rulesConfig';

const PLANS: Record<string, { balance: number; label: string }> = {
  "10k": { balance: 10000, label: "$10,000" },
  "25k": { balance: 25000, label: "$25,000" },
  "50k": { balance: 50000, label: "$50,000" },
  "100k": { balance: 100000, label: "$100,000" },
  "200k": { balance: 200000, label: "$200,000" },
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

    const planType = "1-step-pro";
    const phase = "evaluation";
    const rules = RULES_CONFIG.plans[planType]?.[phase];

    if (!rules) {
      return NextResponse.json({ error: "Configuration Error: Plan rules not found" }, { status: 500 });
    }

    // Dynamic calculation based on Institutional Rules
    // profitTarget for 1-step-pro evaluation is 10%
    const targetPct = rules.profitTarget || 10;
    const profitTarget = p.balance * (targetPct / 100);
    const dailyLoss = p.balance * (rules.dailyDrawdown / 100);
    const maxLoss = p.balance * (rules.maxDrawdown / 100);

    const db = getAdminDb();
    const docRef = await db.collection("demoAccounts").add({
      userId: uid,
      plan,
      planType,
      phase,
      label: `Phase 1 — ${p.label} Challenge`,
      balance: p.balance,
      equity: p.balance,
      startBalance: p.balance,
      dailyStartBalance: p.balance,
      profitTarget,
      dailyLoss,
      maxLoss,
      status: "active",
      breachReason: null,
      createdAt: Timestamp.now(),
      dailyLossResetAt: Timestamp.now(),
    });

    return NextResponse.json({ ok: true, accountId: docRef.id });
  } catch (error: any) {
    console.error('[Demo-Account-API] Fatal Error:', error);
    return NextResponse.json({ error: "Internal Server Error", details: error.message }, { status: 500 });
  }
}
