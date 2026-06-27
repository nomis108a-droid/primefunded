import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin';
import { ADMIN_EMAILS } from "@/lib/admin";

/**
 * @fileOverview Admin Demo Accounts API
 * Securely retrieves all demo accounts for administrative monitoring.
 */

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    
    if (!token) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    // 1. Verify User Identity
    let decoded;
    try {
      decoded = await getAdminAuth().verifyIdToken(token);
    } catch (err) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    // 2. Authorization Check
    if (!ADMIN_EMAILS.includes(decoded.email || "")) {
      return NextResponse.json({ error: "Access denied: Unauthorized identity" }, { status: 403 });
    }

    const db = getAdminDb();
    
    // 3. Fetch Data
    const snap = await db.collection("demoAccounts")
      .orderBy("createdAt", "desc")
      .get();
    
    const accounts = snap.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        userId: data.userId,
        plan: data.plan,
        label: data.label,
        balance: data.balance,
        equity: data.equity,
        startBalance: data.startBalance,
        status: data.status,
        profitTarget: data.profitTarget,
        maxLoss: data.maxLoss,
        dailyLoss: data.dailyLoss,
        createdAt: data.createdAt?.toDate?.() || data.createdAt,
      };
    });

    // 4. Compute Aggregate Stats
    const stats = {
      total: accounts.length,
      active: accounts.filter(a => a.status === 'active').length,
      blown: accounts.filter(a => a.status === 'blown').length,
      passed: accounts.filter(a => a.status === 'passed').length,
      volume: accounts.reduce((acc, a) => acc + (a.equity || 0), 0)
    };

    return NextResponse.json({ accounts, stats });

  } catch (error: any) {
    console.error('[Admin-Demo-API] Fatal Error:', error);
    return NextResponse.json({ error: "Internal Server Error", details: error.message }, { status: 500 });
  }
}
