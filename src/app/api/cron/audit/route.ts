import { runDemoAudit } from '@/lib/rulesEngine';
import { NextResponse } from 'next/server';

/**
 * @fileOverview Automated Risk Engine Cron
 * Verifies rule compliance for all active internal accounts.
 * Hardened with error checking to prevent 500 crashes.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.TERMINAL_CRON_KEY || "primefunded_cron_2024";
  
  if (authHeader !== `Bearer ${cronSecret}` && request.headers.get('x-cron-key') !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const results = await runDemoAudit();
    if (!results || (results as any).error) {
      return NextResponse.json({ success: false, error: (results as any)?.error || "Service Unavailable" }, { status: 503 });
    }
    return NextResponse.json({ success: true, ...results });
  } catch (error: any) {
    console.error('[CronAudit-API] Fatal Error:', error.message);
    return NextResponse.json({ success: false, error: error.message || "Internal server fault" }, { status: 500 });
  }
}
