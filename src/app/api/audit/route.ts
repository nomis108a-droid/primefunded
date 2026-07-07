import { NextResponse } from 'next/server';
import { runDemoAudit } from '@/lib/rulesEngine';

/**
 * @fileOverview Global Audit API Route
 * Triggers rule verification for all active internal trading nodes.
 * Hardened with error checking to prevent 500 crashes.
 */

export async function POST() {
  try {
    const results = await runDemoAudit();
    if (!results || (results as any).error) {
      return NextResponse.json({ success: false, error: (results as any)?.error || "Audit failed to execute" }, { status: 503 });
    }
    return NextResponse.json({ success: true, ...results });
  } catch (error: any) {
    console.error('[Audit-API] Fatal Error:', error.message);
    return NextResponse.json({ success: false, error: error.message || "Internal server fault" }, { status: 500 });
  }
}

export async function GET() {
  return POST();
}
