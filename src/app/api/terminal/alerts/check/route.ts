import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

/**
 * @fileOverview Price Alert Monitoring Engine
 * Evaluates active user alerts against live market prices and triggers notifications.
 * Designed to be triggered via Cron every 1 minute.
 */

export async function GET(req: NextRequest) {
  const key = req.headers.get('x-api-key');
  if (!process.env.TERMINAL_CRON_KEY || key !== process.env.TERMINAL_CRON_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getAdminDb();
  
  try {
    // 1. Fetch all active alerts
    const alertsSnap = await db.collection('alerts')
      .where('status', '==', 'active')
      .get();
    
    if (alertsSnap.empty) {
      return NextResponse.json({ checked: 0, triggered: 0 });
    }

    // 2. Fetch all live prices to avoid N+1 queries
    const pricesSnap = await db.collection('livePrices').get();
    const prices: Record<string, number> = {};
    pricesSnap.docs.forEach(doc => {
      prices[doc.id] = doc.data().price;
    });

    const batch = db.batch();
    let triggeredCount = 0;

    // 3. Evaluate conditions
    alertsSnap.docs.forEach(alertDoc => {
      const alert = alertDoc.data();
      const currentPrice = prices[alert.symbol];

      if (!currentPrice) return;

      let isTriggered = false;
      if (alert.condition === 'above' && currentPrice >= alert.targetPrice) {
        isTriggered = true;
      } else if (alert.condition === 'below' && currentPrice <= alert.targetPrice) {
        isTriggered = true;
      }

      if (isTriggered) {
        triggeredCount++;

        // Update alert status
        batch.update(alertDoc.ref, {
          status: 'triggered',
          triggeredAt: FieldValue.serverTimestamp(),
          triggerPrice: currentPrice
        });

        // Create notification in the user's secure subcollection (Single Source of Truth)
        const notificationRef = db.collection('users')
          .doc(alert.userId)
          .collection('notifications')
          .doc();

        batch.set(notificationRef, {
          title: '🔔 Price Alert Triggered',
          message: `${alert.symbol} reached ${alert.targetPrice.toLocaleString()} (Current: ${currentPrice.toLocaleString()})`,
          type: 'price_alert',
          isRead: false,
          createdAt: FieldValue.serverTimestamp()
        });
      }
    });

    if (triggeredCount > 0) {
      await batch.commit();
    }

    return NextResponse.json({ 
      success: true, 
      checked: alertsSnap.size, 
      triggered: triggeredCount 
    });

  } catch (error: any) {
    console.error('[Alert-Check] Fatal Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
