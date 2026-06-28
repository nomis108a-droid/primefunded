import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

/**
 * @fileOverview Price Alerts API
 * Securely manages user price conditions and notifications.
 */

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let uid: string;
    try {
      const decoded = await getAdminAuth().verifyIdToken(token);
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const db = getAdminDb();
    const alertsSnap = await db.collection("alerts")
      .where("userId", "==", uid)
      .orderBy("createdAt", "desc")
      .limit(50)
      .get();

    const alerts = alertsSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.().toISOString() || doc.data().createdAt
    }));

    return NextResponse.json(alerts);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let uid: string;
    try {
      const decoded = await getAdminAuth().verifyIdToken(token);
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const { symbol, condition, targetPrice } = await req.json();

    if (!symbol || !condition || !targetPrice) {
      return NextResponse.json({ error: "Missing required alert parameters" }, { status: 400 });
    }

    const db = getAdminDb();
    const alertRef = await db.collection("alerts").add({
      userId: uid,
      symbol,
      condition, // "above" | "below"
      targetPrice: parseFloat(String(targetPrice)),
      status: "active",
      createdAt: Timestamp.now()
    });

    return NextResponse.json({ ok: true, id: alertRef.id });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let uid: string;
    try {
      const decoded = await getAdminAuth().verifyIdToken(token);
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) return NextResponse.json({ error: "Missing alert ID" }, { status: 400 });

    const db = getAdminDb();
    const alertRef = db.collection("alerts").doc(id);
    const alertSnap = await alertRef.get();

    if (!alertSnap.exists) return NextResponse.json({ error: "Alert not found" }, { status: 404 });
    if (alertSnap.data()?.userId !== uid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    await alertRef.delete();

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
