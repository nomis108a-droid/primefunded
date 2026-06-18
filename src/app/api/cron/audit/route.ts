import { runGlobalAudit } from '@/lib/rulesEngine';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  // SECURITY: Only allow Vercel cron or requests with correct secret
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET || process.env.MT5_API_KEY;
  
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const results = await runGlobalAudit();
    return NextResponse.json({ success: true, ...results });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
