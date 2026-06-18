import { runGlobalAudit } from '@/lib/rulesEngine';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const results = await runGlobalAudit();
    return NextResponse.json({ success: true, ...results });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
