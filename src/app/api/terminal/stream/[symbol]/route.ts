import { NextRequest, NextResponse } from 'next/server';
import { getLatestOandaTicks } from '@/lib/oandaStream';
import { getLatestCoinbaseTicks } from '@/lib/coinbaseStream';
import { getAdminDb } from '@/lib/firebase-admin';

/**
 * @fileOverview Institutional SSE Price Stream
 * Provides near-instant price delivery by reading from in-memory modules (Leader)
 * or Firestore (Standby instances). Refreshes every 4 minutes to prevent 
 * gateway timeouts (App Hosting/Cloud Run).
 */

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const target = symbol.toUpperCase();
  const encoder = new TextEncoder();
  const db = getAdminDb();

  const stream = new ReadableStream({
    start(controller) {
      let lastPrice = 0;

      const sendPrice = (tick: any) => {
        if (tick && tick.price && tick.price !== lastPrice) {
          lastPrice = tick.price;
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              price: tick.price,
              bid: tick.bid || tick.price,
              ask: tick.ask || tick.price,
              time: Date.now(),
            })}\n\n`));
          } catch (e) {}
        }
      };

      const interval = setInterval(async () => {
        if (req.signal.aborted) {
          clearInterval(interval);
          controller.close();
          return;
        }

        // 1. Fast Path: Try local memory (Works on Leader instance)
        const oanda = getLatestOandaTicks();
        const coinbase = getLatestCoinbaseTicks();
        const memTick = oanda[target] || coinbase[target];

        if (memTick && memTick.price) {
          sendPrice(memTick);
        } else {
          // 2. Reliable Path: Read from Firestore (Works on any instance)
          try {
            const snap = await db.collection('livePrices').doc(target).get();
            if (snap.exists) {
              sendPrice(snap.data());
            }
          } catch (e) {}
        }
      }, 500);

      // Graceful termination after 240s to avoid 504 Gateway Timeouts
      const lifetimeTimeout = setTimeout(() => {
        clearInterval(interval);
        try {
          controller.close();
        } catch (e) {}
      }, 240000);

      req.signal.onabort = () => {
        clearInterval(interval);
        clearTimeout(lifetimeTimeout);
        try {
          controller.close();
        } catch (e) {}
      };
    }
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
