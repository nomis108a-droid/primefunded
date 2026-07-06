import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { syncPricesAndAudit } from '@/lib/priceSync';

/**
 * @fileOverview Institutional SL/TP & Risk Engine Endpoint
 * Continuous monitoring of open positions using strict Bid/Ask exit logic.
 * Primarily used by cron jobs to keep the risk engine active.
 */

export async function GET(req: NextRequest) {
  const key = req.headers.get('x-api-key');
  if (!process.env.TERMINAL_CRON_KEY || key !== process.env.TERMINAL_CRON_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // This now triggers the hardened logic in lib/priceSync
    const result = await syncPricesAndAudit();

    return NextResponse.json({ 
      success: true, 
      checked: result.totalOpenPositionAccounts, 
      breaches: result.breachesDetected,
      passed: result.passed
    });
  } catch (error: any) {
    console.error('[RiskEngine] API Endpoint Failure:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
