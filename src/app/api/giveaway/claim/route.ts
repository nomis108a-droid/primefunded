import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { RULES_CONFIG, getPlanKey } from '@/lib/rulesConfig';

/**
 * @fileOverview Giveaway Claim Engine (V2 - Order Routing)
 * Instead of auto-provisioning, creates a pending order for admin review.
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
        throw new Error("Offer expired: All 500 free slots have been claimed!");
      }

      // Check if user already claimed
      const userClaimSnap = await tx.get(
        db.collection('giveaways').where('userId', '==', uid).limit(1)
      );
      if (!userClaimSnap.empty) {
        throw new Error("You have already claimed this giveaway.");
      }

      // Check if user already has a pending coupon order
      const pendingOrderSnap = await tx.get(
        db.collection('orders')
          .where('userId', '==', uid)
          .where('isCouponOrder', '==', true)
          .where('status', '==', 'pending')
          .limit(1)
      );
      if (!pendingOrderSnap.empty) {
        throw new Error("You already have a claim pending review.");
      }

      // 4. Create Pending Order
      const accountSize = '$5,000';
      const plan = '2-step-pro';
      
      const orderRef = db.collection('orders').doc();
      const claimRef = db.collection('giveaways').doc();

      tx.set(orderRef, {
        userId: uid,
        email: email,
        plan: plan,
        accountSize: accountSize,
        amount: 0,
        amountPaid: 0,
        displayAmount: 'FREE (Coupon: PRIME500)',
        txHash: 'COUPON-PRIME500',
        paymentScreenshot: null,
        status: 'pending',
        couponCode: 'PRIME500',
        isCouponOrder: true,
        submittedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
        date: new Date().toISOString()
      });

      tx.set(claimRef, {
        userId: uid,
        email,
        claimedAt: FieldValue.serverTimestamp(),
        couponCode: code,
        accountGranted: false,
        orderId: orderRef.id
      });

      // Notify User
      const notifRef = db.collection('users').doc(uid).collection('notifications').doc();
      tx.set(notifRef, {
        title: '⏳ Giveaway Claim Received',
        message: 'Your request for a free $5,000 account has been received and is under review. This usually takes less than 24 hours.',
        type: 'order_pending',
        isRead: false,
        createdAt: FieldValue.serverTimestamp()
      });

      return { orderId: orderRef.id };
    });

    return NextResponse.json({ 
      success: true, 
      message: 'Your claim is under review. Admin will approve within 24 hours.',
      ...result 
    });

  } catch (error: any) {
    console.error('[Giveaway-API] Error:', error.message);
    return NextResponse.json({ 
      error: error.message || "Internal server fault" 
    }, { status: 400 });
  }
}
