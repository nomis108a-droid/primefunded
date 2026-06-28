import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * @fileOverview Institutional Daily Reset Engine
 * Resets dailyGrossLossUsd at 02:00 AM UTC.
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
      .where('status', 'in', ['active', 'passed']) // Only active/passed need reset
      .get();
    
    if (accountsSnap.empty) return NextResponse.json({ processed: 0 });

    const batch = db.batch();
    
    accountsSnap.docs.forEach(doc => {
      batch.update(doc.ref, {
        dailyGrossLossUsd: 0,
        dailyLossResetAt: FieldValue.serverTimestamp()
      });
    });

    await batch.commit();

    return NextResponse.json({ 
      success: true, 
      processed: accountsSnap.size 
    });

  } catch (error: any) {
    console.error('[Daily-Reset] Fatal Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
