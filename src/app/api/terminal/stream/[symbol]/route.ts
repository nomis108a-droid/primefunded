import { NextRequest, NextResponse } from 'next/server';
import { getLatestOandaTicks } from '@/lib/oandaStream';
import { getLatestCoinbaseTicks } from '@/lib/coinbaseStream';

export const dynamic = 'force-dynamic';

/**
 * @fileOverview High-frequency SSE price stream handler.
 * Sanitized to handle route artifacts and hardened with heartbeats.
 */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol: rawSymbol } = await params;
  // Sanitize: strip route artifacts like :1 and normalize to uppercase
  const symbol = (rawSymbol || "").split(':')[0].toUpperCase();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let lastPrice = 0;

      // Immediate "connected" signal to allow client to reset retry counters
      try {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'connected', symbol })}\n\n`));
      } catch (e) {}

      // Heartbeat to prevent 504/500 timeouts from edge proxies (Vercel/Cloudflare)
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch (e) {
          clearInterval(heartbeat);
        }
      }, 15000);

      const interval = setInterval(() => {
        if (req.signal.aborted) {
          clearInterval(interval);
          clearInterval(heartbeat);
          controller.close();
          return;
        }

        const tick = getLatestOandaTicks()[symbol] || getLatestCoinbaseTicks()[symbol];
        
        if (tick && tick.price && tick.price !== lastPrice) {
          lastPrice = tick.price;
          try {
            const data = JSON.stringify({ 
              price: tick.price, 
              bid: tick.bid, 
              ask: tick.ask, 
              time: Date.now() 
            });
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          } catch (e) { 
            clearInterval(interval);
            clearInterval(heartbeat);
          }
        }
      }, 100);

      // Rotate connection every 4 minutes to stay within Cloud Run / Vercel limits
      const lifetimeTimeout = setTimeout(() => {
        clearInterval(interval);
        clearInterval(heartbeat);
        try { controller.close(); } catch (e) {}
      }, 240000);

      req.signal.onabort = () => {
        clearInterval(interval);
        clearInterval(heartbeat);
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
