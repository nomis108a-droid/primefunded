import { NextRequest, NextResponse } from "next/server";
import { syncPricesAndAudit } from "@/lib/priceSync";

/**
 * @fileOverview Institutional Automated Price Synchronizer & Risk Engine
 * Triggered via scheduled App Hosting crons to maintain terminal liquidity.
 */

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const cronKey = req.headers.get("x-cron-key") || req.nextUrl.searchParams.get("key");
  
  if (cronKey !== "primefunded_cron_2024") {
    return NextResponse.json({ error: "Unauthorized: Invalid Synchronization Key" }, { status: 401 });
  }

  try {
    const result = await syncPricesAndAudit();
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[PriceSync-Cron] Execution Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message || "Institutional Sync Failed" 
    }, { status: 500 });
  }
}
