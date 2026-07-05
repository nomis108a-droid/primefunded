import { NextRequest, NextResponse } from 'next/server';
import { getLatestOandaTicks } from '@/lib/oandaStream';
import { getLatestCoinbaseTicks } from '@/lib/coinbaseStream';

/**
 * @fileOverview Institutional SSE Price Stream
 * Provides near-instant price delivery by reading from in-memory modules.
 * Restored to memory-only version to eliminate 500 errors from DB initialization.
 */

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params;
    // Sanitize symbol to handle artifacts like "BTCUSD:1" or query strings
    const target = symbol.split(':')[0].split('?')[0].toUpperCase();
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

          // Read directly from high-speed memory buffers
          const tick = getLatestOandaTicks()[target] || getLatestCoinbaseTicks()[target];

          if (tick && tick.price && tick.price !== lastPrice) {
            lastPrice = tick.price;
            try {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                price: tick.price,
                bid: tick.bid || tick.price,
                ask: tick.ask || tick.price,
                time: Date.now(),
              })}\n\n`));
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
  } catch (err) {
    return NextResponse.json({ error: "Stream initiation failed" }, { status: 500 });
  }
}
