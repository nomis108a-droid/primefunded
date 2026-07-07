import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { RULES_CONFIG, getPlanKey } from '@/lib/rulesConfig';

const PLANS: Record<string, { balance: number; label: string }> = {
  "5k": { balance: 5000, label: "$5,000" },
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

    const auth = getAdminAuth();
    if (!auth) return NextResponse.json({ error: "Authentication service unavailable" }, { status: 503 });

    let uid: string;
    let email: string | null = null;
    try {
      const decoded = await auth.verifyIdToken(token);
      uid = decoded.uid;
      email = decoded.email || null;
    } catch (err) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const { plan, planType: requestedPlanType } = await req.json();
    const p = PLANS[plan];
    if (!p) return NextResponse.json({ error: "Invalid plan" }, { status: 400 });

    const planType = requestedPlanType || "1-step-pro";
    const phase = planType.startsWith('instant') ? "funded" : "evaluation";
    const rules = RULES_CONFIG.plans[planType]?.[phase];

    if (!rules) {
      return NextResponse.json({ error: "Configuration Error: Plan rules not found" }, { status: 500 });
    }

    const db = getAdminDb();
    if (!db) return NextResponse.json({ error: "Database service unavailable" }, { status: 503 });

    // FIXED DOLLAR LIMITS - Calculated ONCE at creation
    const targetPct = rules.profitTarget || 10;
    const profitTarget = p.balance * (targetPct / 100);
    const dailyLossLimitUsd = p.balance * (rules.dailyDrawdown / 100);
    const maxLossLimitUsd = p.balance * (rules.maxDrawdown / 100);

    const docRef = await db.collection("demoAccounts").add({
      userId: uid,
      email,
      plan,
      planType,
      phase,
      label: `${planType.toUpperCase()} — ${p.label} Challenge`,
      balance: p.balance,
      equity: p.balance,
      startBalance: p.balance,
      profitTarget,
      dailyLossLimitUsd, 
      dailyGrossLossUsd: 0, 
      maxLoss: maxLossLimitUsd, 
      status: "active",
      breachReason: null,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      lastResetAt: Timestamp.now(),
    });

    return NextResponse.json({ ok: true, accountId: docRef.id });
  } catch (error: any) {
    console.error('[Demo-Account-API] Fatal Error:', error);
    return NextResponse.json({ error: "Internal Server Error", details: error.message }, { status: 500 });
  }
}