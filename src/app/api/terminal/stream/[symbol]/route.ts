import { NextRequest, NextResponse } from 'next/server';
import { getLatestOandaTicks, setLatestOandaTick } from '@/lib/oandaStream';
import { getLatestCoinbaseTicks, setLatestCoinbaseTick } from '@/lib/coinbaseStream';
import { getAdminRtdb, getAdminDb } from '@/lib/firebase-admin';
import { broadcastToRtdb } from '@/lib/rtdbBroadcast';
import { FieldValue } from 'firebase-admin/firestore';

export const dynamic = 'force-dynamic';

/**
 * @fileOverview High-frequency SSE price stream handler (Hardened V2)
 * Optimized for stability and zero-latency delivery using a controlled loop.
 */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol: rawSymbol } = await params;
  const symbol = (rawSymbol || "").split(':')[0].toUpperCase().trim();
  const encoder = new TextEncoder();
  const isCrypto = ['BTCUSD', 'ETHUSD', 'SOLUSD', 'XRPUSD', 'ADAUSD', 'DOGEUSD', 'BNBUSD'].includes(symbol);

  const stream = new ReadableStream({
    async start(controller) {
      let lastPrice = 0;
      let lastManualPoll = 0;
      let isClosed = false;

      // Immediate "connected" signal to UI
      try {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'connected', symbol })}\n\n`));
      } catch (e) {}

      // Heartbeat to prevent proxy timeouts (Vercel/Cloudflare)
      const heartbeat = setInterval(() => {
        if (isClosed) return;
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch (e) {
          clearInterval(heartbeat);
        }
      }, 10000);

      // Recursive loop for stable 150ms intervals without stacking
      const pushTick = async () => {
        if (req.signal.aborted || isClosed) {
          isClosed = true;
          clearInterval(heartbeat);
          try { controller.close(); } catch (e) {}
          return;
        }

        // 1. Check global memory buffer
        let tick = getLatestOandaTicks()[symbol] || getLatestCoinbaseTicks()[symbol];
        
        // 2. SELF-HEALING: If no tick in memory, poll manually (Throttled to 3s)
        if (!tick && (Date.now() - lastManualPoll > 3000)) {
          lastManualPoll = Date.now();
          try {
            if (isCrypto) {
              const kPair = symbol === 'BTCUSD' ? 'XBTUSD' : symbol === 'DOGEUSD' ? 'XDGUSD' : symbol;
              const res = await fetch(`https://api.kraken.com/0/public/Ticker?pair=${kPair}`, { 
                signal: AbortSignal.timeout(2000),
                cache: 'no-store'
              });
              if (res.ok) {
                const d = await res.json();
                if (d.result) {
                  const resKey = Object.keys(d.result)[0];
                  if (resKey) {
                    const item = d.result[resKey];
                    tick = { 
                      price: parseFloat(item.c[0]), 
                      bid: parseFloat(item.b[0]), 
                      ask: parseFloat(item.a[0]),
                      updatedAt: Date.now()
                    };
                  }
                }
              }
            } else if (process.env.OANDA_API_KEY && process.env.OANDA_ACCOUNT_ID) {
              const oMap: Record<string, string> = { 'XAUUSD': 'XAU_USD', 'EURUSD': 'EUR_USD', 'GBPUSD': 'GBP_USD', 'USDJPY': 'USD_JPY' };
              const instr = oMap[symbol] || symbol;
              const res = await fetch(`https://api-fxpractice.oanda.com/v3/instruments/${instr}/candles?price=M&granularity=M1&count=1`, { 
                headers: { 'Authorization': `Bearer ${process.env.OANDA_API_KEY}` },
                signal: AbortSignal.timeout(2000),
                cache: 'no-store'
              });
              if (res.ok) {
                const d = await res.json();
                const p = d.candles?.[0]?.mid;
                if (p) {
                  const o = parseFloat(p.o);
                  const spread = symbol.includes('JPY') ? 0.015 : symbol.includes('XAU') ? 0.25 : 0.00015;
                  tick = { 
                    bid: +(o - spread/2).toFixed(5), 
                    ask: +(o + spread/2).toFixed(5), 
                    price: o,
                    updatedAt: Date.now()
                  };
                }
              }
            }

            // Push manual poll to memory for other instances
            if (tick && tick.price) {
              if (isCrypto) setLatestCoinbaseTick(symbol, tick);
              else setLatestOandaTick(symbol, tick);
              broadcastToRtdb({ [symbol]: tick });
            }
          } catch (e) {
            console.error('[SSE-SelfHealing] Sync error:', e);
          }
        }
        
        // 3. Push to client if price changed
        if (tick && tick.price && Math.abs(tick.price - lastPrice) > 0.0000001) {
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
