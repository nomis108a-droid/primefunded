import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { RULES_CONFIG, getPlanKey } from '@/lib/rulesConfig';

/**
 * @fileOverview Institutional Gift Account API (Bypass)
 * This endpoint uses the Admin SDK to provision accounts for any user,
 * bypassing Firestore security rules entirely.
 */

export async function POST(req: NextRequest) {
  try {
    const { email, accountSize, planType } = await req.json();
    const db = getAdminDb();
    const auth = getAdminAuth();
    
    if (!db || !auth) {
      return NextResponse.json({ success: false, error: 'Admin services offline' }, { status: 503 });
    }
    
    const targetEmail = (email || "").trim().toLowerCase();
    if (!targetEmail) {
      return NextResponse.json({ success: false, error: 'Target email is required' }, { status: 400 });
    }

    // 1. Resolve target user identity
    let userId = "";
    try {
      const authUser = await auth.getUserByEmail(targetEmail);
      userId = authUser.uid;
    } catch (e) {
      const emailSnap = await db.collection('users').where('email', '==', targetEmail).limit(1).get();
      if (!emailSnap.empty) {
        userId = emailSnap.docs[0].id;
      } else {
        return NextResponse.json({ success: false, error: 'No trader found with this email. Ensure they have signed up.' }, { status: 404 });
      }
    }

    // 2. Resolve plan parameters
    const planKey = getPlanKey(planType);
    const balance = parseInt(accountSize.replace(/[^0-9]/g, '')) || 100000;
    const rules = RULES_CONFIG.plans[planKey]?.['evaluation'] || RULES_CONFIG.plans['1-step-pro']['evaluation'];
    
    const profitTarget = balance * (rules.profitTarget || 10) / 100;
    const dailyLossLimitUsd = balance * (rules.dailyDrawdown / 100);
    const maxLossLimitUsd = balance * (rules.maxDrawdown / 100);

    const batch = db.batch();
    const userRef = db.collection('users').doc(userId);

    // 3. Provisioning Cycle
    
    // A. Update Global Profile Status
    batch.set(userRef, {
      accountSize,
      planType: planKey,
      accountStatus: 'active',
      grantedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });

    // B. Create Sub-collection Challenge Entry
    batch.set(userRef.collection('challenges').doc(), {
      status: 'active',
      accountSize,
      planType: planKey,
      balance,
      createdAt: FieldValue.serverTimestamp()
    });

    // C. Create Terminal Trading Node
    batch.set(db.collection('demoAccounts').doc(), {
      userId,
      email: targetEmail,
      label: `${planType.toUpperCase()} — $${(balance/1000)}k Challenge`,
      startBalance: balance,
      balance: balance,
      equity: balance,
      plan: `${balance/1000}k`,
      planType: planKey,
      phase: 'evaluation',
      profitTarget,
      dailyLossLimitUsd,
      dailyGrossLossUsd: 0,
      maxLoss: maxLossLimitUsd,
      status: 'active',
      isGifted: true,
      grantedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });

    // D. Send Institutional Notification
    batch.set(userRef.collection('notifications').doc(), {
      title: '🎁 Account Provisioned',
      message: `Your ${accountSize} ${planType} challenge node is now live in your dashboard.`,
      type: 'account_gifted',
      isRead: false,
      createdAt: FieldValue.serverTimestamp()
    });

    await batch.commit();
    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('[Grant-Account-API] Fatal Error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Internal Provisioning Fault' }, { status: 500 });
  }
}
