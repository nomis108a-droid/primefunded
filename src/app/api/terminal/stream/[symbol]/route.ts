import { NextRequest, NextResponse } from 'next/server';
import { getLatestOandaTicks } from '@/lib/oandaStream';
import { getLatestCoinbaseTicks } from '@/lib/coinbaseStream';

export const dynamic = 'force-dynamic';

/**
 * @fileOverview High-frequency SSE price stream handler.
 * Sanitized to handle route artifacts and hardened with heartbeats.
 * Fixed: Standardized Kraken symbol mapping for self-healing poller.
 */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol: rawSymbol } = await params;
  const symbol = (rawSymbol || "").split(':')[0].toUpperCase();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let lastPrice = 0;
      let lastManualPoll = 0;

      // Immediate "connected" signal
      try {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'connected', symbol })}\n\n`));
      } catch (e) {}

      // Heartbeat to prevent timeouts
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch (e) {
          clearInterval(heartbeat);
        }
      }, 15000);

      const interval = setInterval(async () => {
        if (req.signal.aborted) {
          clearInterval(interval);
          clearInterval(heartbeat);
          controller.close();
          return;
        }

        // 1. Check global memory buffer (Leader/Follower sync)
        let tick = getLatestOandaTicks()[symbol] || getLatestCoinbaseTicks()[symbol];
        
        // 2. SELF-HEALING: If background sync is inactive, poll manually for this symbol
        if (!tick && (Date.now() - lastManualPoll > 3000)) {
          lastManualPoll = Date.now();
          try {
            const isCrypto = ['BTCUSD', 'ETHUSD', 'SOLUSD', 'XRPUSD', 'ADAUSD', 'DOGEUSD', 'BNBUSD'].includes(symbol);
            if (isCrypto) {
              const kPair = symbol === 'BTCUSD' ? 'XBTUSD' : symbol === 'DOGEUSD' ? 'XDGUSD' : symbol;
              const res = await fetch(`https://api.kraken.com/0/public/Ticker?pair=${kPair}`, { signal: AbortSignal.timeout(2000) });
              if (res.ok) {
                const d = await res.json();
                const resKey = Object.keys(d.result || {})[0];
                if (resKey) {
                  const item = d.result[resKey];
                  tick = { price: parseFloat(item.c[0]), bid: parseFloat(item.b[0]), ask: parseFloat(item.a[0]) };
                }
              } else if (symbol === 'BNBUSD') {
                // BNB Fallback via CoinGecko
                const bnbRes = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=binancecoin&vs_currencies=usd');
                const bnbData = await bnbRes.json();
                const p = bnbData?.binancecoin?.usd;
                if (p) tick = { price: p, bid: p * 0.9999, ask: p * 1.0001 };
              }
            } else if (process.env.OANDA_API_KEY && process.env.OANDA_ACCOUNT_ID) {
              const oMap: Record<string, string> = { 'XAUUSD': 'XAU_USD', 'EURUSD': 'EUR_USD', 'GBPUSD': 'GBP_USD', 'USDJPY': 'USD_JPY' };
              const instr = oMap[symbol] || symbol;
              const res = await fetch(`https://api-fxpractice.oanda.com/v3/accounts/${process.env.OANDA_ACCOUNT_ID}/pricing?instruments=${instr}`, { 
                headers: { 'Authorization': `Bearer ${process.env.OANDA_API_KEY}` },
                signal: AbortSignal.timeout(2000) 
              });
              if (res.ok) {
                const d = await r.json();
                const p = d.prices?.[0];
                if (p) {
                  const b = parseFloat(p.bids[0].price);
                  const a = parseFloat(p.asks[0].price);
                  tick = { bid: b, ask: a, price: (b + a) / 2 };
                }
              }
            }
          } catch (e) {}
        }
        
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
      }, 150);

      // Rotate connection
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
