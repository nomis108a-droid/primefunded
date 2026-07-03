import { NextRequest, NextResponse } from 'next/server';
import { getLatestOandaTicks } from '@/lib/oandaStream';
import { getLatestCoinbaseTicks } from '@/lib/coinbaseStream';

/**
 * @fileOverview Institutional SSE Price Stream
 * Provides near-instant price delivery by reading directly from in-memory modules.
 * Refreshes every 4 minutes to prevent gateway timeouts (App Hosting/Cloud Run).
 */

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const target = symbol.toUpperCase();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let lastPrice = 0;

      const interval = setInterval(() => {
        if (req.signal.aborted) {
          clearInterval(interval);
          controller.close();
          return;
        }

        // Bypasses Firestore entirely for speed
        const oanda = getLatestOandaTicks();
        const coinbase = getLatestCoinbaseTicks();
        const tick = oanda[target] || coinbase[target];

        if (tick && tick.price !== lastPrice) {
          lastPrice = tick.price;
          const payload = {
            price: tick.price,
            bid: tick.bid,
            ask: tick.ask,
            time: Date.now(),
          };
          
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
          } catch (e) {
            clearInterval(interval);
          }
        }
      }, 100);

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
