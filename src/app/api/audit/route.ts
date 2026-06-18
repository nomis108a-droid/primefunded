import { NextResponse } from 'next/server';
import { runGlobalAudit } from '@/lib/rulesEngine';

/**
 * @fileOverview Global Audit API Route
 * Triggers rule verification for all active MT5 nodes.
 */

export async function POST() {
  try {
    const results = await runGlobalAudit();
    return NextResponse.json({ success: true, ...results });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const results = await runGlobalAudit();
    return NextResponse.json({ success: true, ...results });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
