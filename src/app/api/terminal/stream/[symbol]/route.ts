import { NextRequest, NextResponse } from 'next/server';
import { getLatestOandaTicks, setLatestOandaTick } from '@/lib/oandaStream';
import { getLatestCoinbaseTicks, setLatestCoinbaseTick } from '@/lib/coinbaseStream';
import { broadcastToRtdb } from '@/lib/rtdbBroadcast';
import { getAuthoritativePrice } from '@/lib/priceSync';

export const dynamic = 'force-dynamic';

/**
 * @fileOverview high-frequency SSE price stream handler
 * Optimized for Metals, Crypto, and Forex with a stable 150ms delivery loop.
 * Hardened to use getAuthoritativePrice for zero-latency cross-node sync.
 */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol: rawSymbol } = await params;
  const symbol = (rawSymbol || "").split(':')[0].toUpperCase().trim();
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      let lastPrice = 0;
      let isClosed = false;

      // Connection confirmation
      try {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'connected', symbol })}\n\n`));
      } catch (e) {
        return;
      }

      const heartbeat = setInterval(() => {
        if (isClosed) return;
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch (e) {
          clearInterval(heartbeat);
        }
      }, 10000);

      const pushTick = async () => {
        if (req.signal.aborted || isClosed) {
          isClosed = true;
          clearInterval(heartbeat);
          try { controller.close(); } catch (e) {}
          return;
        }

        // Use the multi-layered authoritative price source (Memory -> RTDB -> REST Poll)
        const tick = await getAuthoritativePrice(symbol);
        
        if (tick && tick.price && Math.abs(tick.price - lastPrice) > 0.000000001) {
          lastPrice = tick.price;
          try {
            const data = JSON.stringify({ 
              price: tick.price, 
              bid: tick.bid, 
              ask: tick.ask, 
              time: tick.updatedAt || Date.now() 
            });
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          } catch (e) { 
            isClosed = true;
          }
        }

        if (!isClosed) setTimeout(pushTick, 150);
      };

      pushTick();

      req.signal.onabort = () => {
        isClosed = true;
        clearInterval(heartbeat);
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
