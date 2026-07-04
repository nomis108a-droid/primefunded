import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { RULES_CONFIG, getPlanKey } from '@/lib/rulesConfig';
import { ADMIN_EMAILS } from '@/lib/admin';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    
    const decoded = await getAdminAuth().verifyIdToken(token);
    if (!decoded.email || !ADMIN_EMAILS.includes(decoded.email)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    
    const { userId, email, label, amount, plan, phase } = await req.json();
    const db = getAdminDb();
    const planKey = getPlanKey(plan);
    const rules = RULES_CONFIG.plans[planKey]?.[phase] || RULES_CONFIG.plans['1-step-pro']['evaluation'];
    const startBalance = amount;
    const profitTarget = startBalance * (rules.profitTarget || 10) / 100;
    const dailyLossLimitUsd = startBalance * (rules.dailyDrawdown / 100);
    const maxLossLimitUsd = startBalance * (rules.maxDrawdown / 100);
    
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const nodeId = Array.from({length: 10}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    
    await db.collection('demoAccounts').add({
      userId, email, label,
      startBalance, balance: startBalance, equity: startBalance,
      plan: `${startBalance / 1000}k`, planType: planKey, phase,
      profitTarget, dailyLossLimitUsd, dailyGrossLossUsd: 0,
      maxLoss: maxLossLimitUsd, status: 'active', breachReason: null,
      nodeId, isGifted: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      lastResetAt: FieldValue.serverTimestamp(),
    });
    
    await db.collection('users').doc(userId).collection('notifications').add({
      title: '🎁 Free Account Granted!',
      message: `You have been granted a free ${label} account!`,
      type: 'gift', isRead: false,
      createdAt: FieldValue.serverTimestamp()
    });
    
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
