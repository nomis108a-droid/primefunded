import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * @fileOverview Institutional Daily Reset Engine
 * Resets dailyStartBalance at 00:00 UTC and monitors daily drawdown breaches.
 * Triggered via GitHub Actions.
 */

export async function GET(req: NextRequest) {
  const key = req.headers.get('x-api-key');
  if (!process.env.TERMINAL_CRON_KEY || key !== process.env.TERMINAL_CRON_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getAdminDb();
  
  try {
    const accountsSnap = await db.collection('demoAccounts')
      .where('status', '==', 'active')
      .get();
    
    if (accountsSnap.empty) return NextResponse.json({ processed: 0 });

    const batch = db.batch();
    let breaches = 0;

    accountsSnap.docs.forEach(doc => {
      const account = doc.data();
      const currentEquity = account.equity ?? account.balance;
      const dailyStart = account.dailyStartBalance ?? account.startBalance;
      const dailyLimit = account.dailyLoss;

      // 1. Check if account breached daily loss threshold before reset
      if (dailyStart - currentEquity >= dailyLimit) {
        batch.update(doc.ref, { 
          status: 'blown',
          breachReason: `Daily Drawdown Limit Hit ($${dailyLimit})` 
        });
        breaches++;
      } else {
        // 2. Perform midnight reset to current balance
        batch.update(doc.ref, {
          dailyStartBalance: account.balance,
          dailyLossResetAt: FieldValue.serverTimestamp()
        });
      }
    });

    await batch.commit();

    return NextResponse.json({ 
      success: true, 
      processed: accountsSnap.size, 
      breachesDetected: breaches 
    });

  } catch (error: any) {
    console.error('[Daily-Reset] Fatal Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
