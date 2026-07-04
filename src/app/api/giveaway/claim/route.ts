import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { RULES_CONFIG, getPlanKey } from '@/lib/rulesConfig';

/**
 * @fileOverview Giveaway Claim Engine
 * Validates requirements and provisions free Step 2 accounts.
 * Limit: 500 accounts globally.
 */

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Please login first to claim your free account" }, { status: 401 });

    // 1. Authenticate User
    let uid: string;
    let email: string;
    try {
      const decoded = await getAdminAuth().verifyIdToken(token);
      uid = decoded.uid;
      email = decoded.email || "";
    } catch {
      return NextResponse.json({ error: "Please login first to claim your free account" }, { status: 401 });
    }

    const { code } = await req.json();

    // 2. Validate Coupon
    if (code !== 'PRIME500') {
      return NextResponse.json({ error: "Invalid coupon code" }, { status: 400 });
    }

    const db = getAdminDb();
    
    // 3. Execution via Transaction to ensure limit consistency
    const result = await db.runTransaction(async (tx) => {
      // Check total claims
      const giveawaysSnap = await tx.get(db.collection('giveaways'));
      if (giveawaysSnap.size >= 500) {
        throw new Error("Sorry, all 500 accounts have been claimed!");
      }

      // Check if user already claimed
      const userClaimSnap = await tx.get(
        db.collection('giveaways').where('userId', '==', uid).limit(1)
      );
      if (!userClaimSnap.empty) {
        throw new Error("You have already claimed this giveaway.");
      }

      // 4. Provision Node
      const startBalance = 5000;
      const planKey = '2-step-classic';
      const phase = 'verification'; // User specified "Step 2 account"
      const rules = RULES_CONFIG.plans[planKey]?.[phase];

      if (!rules) throw new Error("Configuration Error: Plan not found.");

      const profitTarget = startBalance * (rules.profitTarget || 5) / 100;
      const dailyLossLimitUsd = startBalance * (rules.dailyDrawdown / 100);
      const maxLossLimitUsd = startBalance * (rules.maxDrawdown / 100);

      const accountRef = db.collection('demoAccounts').doc();
      const claimRef = db.collection('giveaways').doc();

      tx.set(accountRef, {
        userId: uid,
        email,
        label: `GIVEAWAY — $5k Verification Account`,
        startBalance,
        balance: startBalance,
        equity: startBalance,
        plan: `5k`,
        planType: planKey,
        phase,
        profitTarget,
        dailyLossLimitUsd,
        dailyGrossLossUsd: 0,
        maxLoss: maxLossLimitUsd,
        status: 'active',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        source: 'giveaway'
      });

      tx.set(claimRef, {
        userId: uid,
        email,
        claimedAt: FieldValue.serverTimestamp(),
        couponCode: code,
        accountGranted: true,
        accountId: accountRef.id
      });

      // Notify User
      const notifRef = db.collection('users').doc(uid).collection('notifications').doc();
      tx.set(notifRef, {
        title: '🎉 Giveaway Claimed!',
        message: 'Your $5,000 Step 2 account has been provisioned. Welcome to the elite community!',
        type: 'account_gifted',
        isRead: false,
        createdAt: FieldValue.serverTimestamp()
      });

      return { accountId: accountRef.id };
    });

    return NextResponse.json({ success: true, ...result });

  } catch (error: any) {
    console.error('[Giveaway-API] Error:', error.message);
    return NextResponse.json({ 
      error: error.message || "Internal server fault" 
    }, { status: 400 });
  }
}
