import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * @fileOverview Institutional Order Cleanup Engine
 * Identifies and expires orders that have exceeded the 20-minute payment window.
 * Triggered via Cron every 1 minute.
 */

const PAYMENT_WINDOW_MS = 20 * 60 * 1000;

export async function GET(req: NextRequest) {
  const key = req.headers.get('x-api-key');
  if (!process.env.TERMINAL_CRON_KEY || key !== process.env.TERMINAL_CRON_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  try {
    const waitingOrdersSnap = await db.collection('orders')
      .where('status', '==', 'waiting')
      .get();
    
    if (waitingOrdersSnap.empty) {
      return NextResponse.json({ success: true, expired: 0 });
    }

    const batch = db.batch();
    const now = Date.now();
    let expiredCount = 0;

    for (const orderDoc of waitingOrdersSnap.docs) {
      const order = orderDoc.data();
      const createdAt = order.createdAt?.toDate?.() || (order.createdAt ? new Date(order.createdAt) : null);
      
      if (!createdAt) continue;

      const age = now - createdAt.getTime();

      if (age > PAYMENT_WINDOW_MS) {
        expiredCount++;
        
        batch.update(orderDoc.ref, {
          status: 'expired',
          expiredAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        });

        // Notify User Server-Side
        const notifRef = db.collection('users').doc(order.userId).collection('notifications').doc();
        batch.set(notifRef, {
          title: '⏳ Payment Window Expired',
          message: `Your payment window for the ${order.accountSize} challenge has ended. Please generate a fresh request.`,
          type: 'order_failed',
          isRead: false,
          createdAt: FieldValue.serverTimestamp()
        });
      }
    }

    if (expiredCount > 0) {
      await batch.commit();
    }

    return NextResponse.json({ 
      success: true, 
      checked: waitingOrdersSnap.size, 
      expired: expiredCount 
    });

  } catch (error: any) {
    console.error('[Order-Cleanup] Fatal Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
