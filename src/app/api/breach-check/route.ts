import { runDemoAudit } from '@/lib/rulesEngine';
import { NextResponse } from 'next/server';

/**
 * @fileOverview Universal Risk Audit API
 * Triggers risk evaluation for all active internal trading nodes.
 * Hardened with error checking to prevent 500 crashes.
 */

export async function GET() {
  try {
    const results = await runDemoAudit();
    if (!results || (results as any).error) {
       return NextResponse.json({ success: false, error: (results as any)?.error || "Database connection unavailable" }, { status: 503 });
    }
    return NextResponse.json({ 
      success: true, 
      ...results
    });
  } catch (error: any) {
    console.error('[BreachCheck-API] Fatal Error:', error.message);
    return NextResponse.json({ success: false, error: error.message || "Internal server fault" }, { status: 500 });
  }
}

export async function POST() {
  return GET();
}
