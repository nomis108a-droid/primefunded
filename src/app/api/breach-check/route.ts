import { getAdminDb } from '@/lib/firebase-admin';
import { runDemoAudit } from '@/lib/rulesEngine';
import { NextResponse } from 'next/server';

/**
 * @fileOverview Universal Risk Audit API
 * Triggers risk evaluation for all active internal trading nodes.
 */

export async function GET(req: Request) {
  try {
    const results = await runDemoAudit();
    return NextResponse.json({ 
      success: true, 
      ...results
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return GET(req);
}
