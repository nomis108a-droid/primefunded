import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { RULES_CONFIG, getPlanKey } from '@/lib/rulesConfig';

/**
 * @fileOverview Institutional Data Migration (Fixed Dollar & Gross Loss Update)
 * Backfills accounts with the required fixed-dollar thresholds and reset counters.
 */

export async function GET(req: NextRequest) {
  try {
    const isMaster = req.nextUrl.searchParams.get('key') === '93463962569392846256';
    if (!isMaster) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const db = getAdminDb();
    const snap = await db.collection("demoAccounts").get();
    
    const batch = db.batch();
    let updatedCount = 0;

    snap.docs.forEach(doc => {
      const data = doc.data();
      const updates: any = {};
      let needsUpdate = false;

      const planKey = getPlanKey(data.planType || data.plan || '1-step-pro');
      const phaseKey = data.phase || 'evaluation';
      const rules = RULES_CONFIG.plans[planKey]?.[phaseKey] || RULES_CONFIG.plans['1-step-pro']['evaluation'];
      const startBalance = parseFloat(String(data.startBalance || 100000));

      // 1. Initialize Gross Loss Counter
      if (data.dailyGrossLossUsd === undefined) {
        updates.dailyGrossLossUsd = 0;
        needsUpdate = true;
      }

      // 2. Set FIXED Dollar Daily Loss Limit
      if (data.dailyLossLimitUsd === undefined) {
        updates.dailyLossLimitUsd = startBalance * (rules.dailyDrawdown / 100);
        needsUpdate = true;
      }

      // 3. Set FIXED Dollar Max Loss Limit
      if (data.maxLoss === undefined || data.maxLoss !== (startBalance * (rules.maxDrawdown / 100))) {
        updates.maxLoss = startBalance * (rules.maxDrawdown / 100);
        needsUpdate = true;
      }

      // 4. Calibrate Profit Target
      const correctTarget = startBalance * (rules.profitTarget / 100);
      if (data.profitTarget !== correctTarget) {
        updates.profitTarget = correctTarget;
        needsUpdate = true;
      }

      if (needsUpdate) {
        batch.update(doc.ref, {
          ...updates,
          migratedAt: FieldValue.serverTimestamp()
        });
        updatedCount++;
      }
    });

    if (updatedCount > 0) {
      await batch.commit();
    }

    return NextResponse.json({ success: true, updated: updatedCount });
  } catch (error: any) {
    console.error('[Migration] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
