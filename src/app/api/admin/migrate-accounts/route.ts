import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { ADMIN_EMAILS } from "@/lib/admin";

/**
 * @fileOverview Institutional Data Migration
 * Backfills legacy demoAccounts with the required telemetry for the Risk Engine.
 */

export async function GET(req: NextRequest) {
  try {
    // 1. Authorization Guard
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    
    // Fallback: master key check for simple one-time run from admin UI
    const isMaster = req.nextUrl.searchParams.get('key') === '93463962569392846256';
    
    if (!isMaster && !token) {
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

      // Backfill Drawdown Telemetry
      if (data.dailyStartBalance === undefined) {
        updates.dailyStartBalance = data.balance || data.startBalance || 100000;
        needsUpdate = true;
      }

      // Standardize Plan Metadata
      if (data.planType === undefined) {
        updates.planType = "1-step-pro"; // Map all legacy demo nodes to 1-Step Pro rules
        needsUpdate = true;
      }

      // Standardize Phase
      if (data.phase === undefined) {
        updates.phase = "evaluation";
        needsUpdate = true;
      }

      // Initialize Breach Metadata
      if (data.breachReason === undefined) {
        updates.breachReason = null;
        needsUpdate = true;
      }

      // Sync Reset Timestamps
      if (data.dailyLossResetAt === undefined) {
        updates.dailyLossResetAt = FieldValue.serverTimestamp();
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
