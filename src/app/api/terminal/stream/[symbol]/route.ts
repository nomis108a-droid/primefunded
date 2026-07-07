import { NextRequest, NextResponse } from 'next/server';
import { getLatestOandaTicks, setLatestOandaTick } from '@/lib/oandaStream';
import { getLatestCoinbaseTicks, setLatestCoinbaseTick } from '@/lib/coinbaseStream';
import { broadcastToRtdb } from '@/lib/rtdbBroadcast';

export const dynamic = 'force-dynamic';

/**
 * @fileOverview Generic high-frequency SSE price stream handler
 * Optimized for Metals, Crypto, and Forex with a stable 150ms delivery loop.
 * Hardened with explicit error signaling and self-healing REST fallbacks.
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
      let failureCount = 0;

      // Connection confirmation
      try {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'connected', symbol })}\n\n`));
      } catch (e) {}

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

        // 1. Primary Source: High-frequency memory buffer (Populated by background workers)
        let tick = getLatestOandaTicks()[symbol] || getLatestCoinbaseTicks()[symbol];
        
        // 2. Self-Healing: Trigger manual poll if memory is empty or stale (> 3s)
        if (!tick || (Date.now() - (tick.updatedAt || 0) > 3000)) {
          if (Date.now() - lastManualPoll > 3000) {
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
              } else {
                const oMap: Record<string, string> = { 'XAUUSD': 'XAU_USD', 'XAGUSD': 'XAG_USD', 'EURUSD': 'EUR_USD', 'GBPUSD': 'GBP_USD', 'USDJPY': 'USD_JPY' };
                const instr = oMap[symbol] || symbol;
                if (process.env.OANDA_API_KEY && process.env.OANDA_ACCOUNT_ID) {
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
                      const spread = symbol.includes('JPY') ? 0.015 : (symbol.includes('XAU') ? 0.25 : 0.00015);
                      tick = { 
                        bid: +(o - spread/2).toFixed(5), 
                        ask: +(o + spread/2).toFixed(5), 
                        price: o,
                        updatedAt: Date.now()
                      };
                    }
                  }
                }
              }

              if (tick && tick.price) {
                failureCount = 0;
                if (isCrypto) setLatestCoinbaseTick(symbol, tick);
                else setLatestOandaTick(symbol, tick);
                broadcastToRtdb({ [symbol]: tick });
              } else {
                failureCount++;
              }
            } catch (e: any) {
              failureCount++;
              console.warn(`[SSE-Stream] Manual recovery poll failed for ${symbol}:`, e.message);
            }
          }
        }
        
        // 3. Emit if price changed
        if (tick && tick.price && Math.abs(tick.price - lastPrice) > 0.00000001) {
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
