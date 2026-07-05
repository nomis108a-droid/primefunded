import { NextRequest, NextResponse } from 'next/server';
import { getLatestOandaTicks } from '@/lib/oandaStream';
import { getLatestCoinbaseTicks } from '@/lib/coinbaseStream';

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
        const tick = getLatestOandaTicks()[target] || getLatestCoinbaseTicks()[target];
        if (tick && tick.price !== lastPrice) {
          lastPrice = tick.price;
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ price: tick.price, bid: tick.bid, ask: tick.ask, time: Date.now() })}\n\n`));
          } catch (e) { clearInterval(interval); }
        }
      }, 100);

      const lifetimeTimeout = setTimeout(() => {
        clearInterval(interval);
        try { controller.close(); } catch (e) {}
      }, 240000);

      req.signal.onabort = () => {
        clearInterval(interval);
        clearTimeout(lifetimeTimeout);
        try { controller.close(); } catch (e) {}
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