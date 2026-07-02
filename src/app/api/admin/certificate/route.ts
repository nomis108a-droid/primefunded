import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';

/**
 * @fileOverview Institutional Performance Certification API
 * Generates verified credentials for trader achievements.
 */

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const auth = getAdminAuth();
    const decoded = await auth.verifyIdToken(token);
    
    // Check if is authorized admin
    const ADMIN_EMAILS = ["sitarama108a@gmail.com", "sitarama108a-alt@gmail.com"];
    if (!ADMIN_EMAILS.includes(decoded.email || "")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { userId, traderName, amount, payoutId, plan } = await req.json();

    const db = getAdminDb();
    const certRef = db.collection("certificates").doc();
    const certId = certRef.id;

    await db.runTransaction(async (tx) => {
      tx.set(certRef, {
        userId,
        traderName,
        amount: parseFloat(amount),
        plan: plan || 'Elite Payout',
        issuedAt: FieldValue.serverTimestamp(),
        type: 'payout',
        payoutId: payoutId || null,
        status: 'active',
        date: new Date().toISOString()
      });

      // Notify User
      const notifRef = db.collection('users').doc(userId).collection('notifications').doc();
      tx.set(notifRef, {
        title: '🏆 Certificate Issued',
        message: `Your verified performance certificate for $${amount} has been issued and added to your profile.`,
        type: 'certificate_issued',
        isRead: false,
        createdAt: FieldValue.serverTimestamp()
      });
    });

    return NextResponse.json({ success: true, certId });

  } catch (error: any) {
    console.error('[Cert-API] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}