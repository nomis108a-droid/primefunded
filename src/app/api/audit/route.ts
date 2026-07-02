import { NextResponse } from 'next/server';
import { runDemoAudit } from '@/lib/rulesEngine';

/**
 * @fileOverview Global Audit API Route
 * Triggers rule verification for all active internal trading nodes.
 */

export async function POST() {
  try {
    const results = await runDemoAudit();
    return NextResponse.json({ success: true, ...results });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const results = await runDemoAudit();
    return NextResponse.json({ success: true, ...results });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
