import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { RULES_CONFIG, getPlanKey } from '@/lib/rulesConfig';

/**
 * @fileOverview Institutional Data Migration
 * Backfills legacy demoAccounts with the required telemetry for the Risk Engine.
 */

export async function GET(req: NextRequest) {
  try {
    // Authorization Check: Master key required for execution
    const isMaster = req.nextUrl.searchParams.get('key') === '93463962569392846256';
    
    if (!isMaster) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = getAdminDb();
    const snap = await db.collection("demoAccounts").get();
    
    const batch = db.batch();
    let updatedCount = 0;

    snap.docs.forEach(doc => {
      const data = doc.data();
      const updates: any = {};
      let needsUpdate = false;

      // 1. Backfill Daily Drawdown Telemetry
      if (data.dailyStartBalance === undefined) {
        updates.dailyStartBalance = data.balance || data.startBalance || 100000;
        needsUpdate = true;
      }

      // 2. Standardize Plan Key for Rules Engine
      if (data.planType === undefined) {
        updates.planType = "1-step-pro"; 
        needsUpdate = true;
      }

      // 3. Initialize Breach Context
      if (data.breachReason === undefined) {
        updates.breachReason = null;
        needsUpdate = true;
      }

      // 4. Set Initial Phase
      if (data.phase === undefined) {
        updates.phase = "evaluation";
        needsUpdate = true;
      }

      // 5. Initialize Reset Timestamp
      if (data.dailyLossResetAt === undefined) {
        updates.dailyLossResetAt = FieldValue.serverTimestamp();
        needsUpdate = true;
      }

      // 6. CORRECT PROFIT TARGET
      const planKey = getPlanKey(updates.planType || data.planType || '1-step-pro');
      const phaseKey = updates.phase || data.phase || 'evaluation';
      const rules = RULES_CONFIG.plans[planKey]?.[phaseKey];
      
      if (rules && rules.profitTarget) {
        const startBalance = parseFloat(String(data.startBalance || 100000));
        const correctTarget = startBalance * (rules.profitTarget / 100);
        if (data.profitTarget !== correctTarget) {
          updates.profitTarget = correctTarget;
          needsUpdate = true;
        }
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

    return NextResponse.json({ 
      success: true, 
      processed: snap.size, 
      updated: updatedCount,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('[Migration] Error:', error);
    return NextResponse.json({ error: "Migration failed", details: error.message }, { status: 500 });
  }
}
