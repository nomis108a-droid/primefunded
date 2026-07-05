'use client';

import { useState, useEffect, useRef } from 'react';

/**
 * @fileOverview high-frequency SSE price hook
 * Subscribes to the server-side memory buffer for a single symbol.
 * Hardened with exponential backoff and connection handshaking.
 */
export function useTickStream(symbol: string) {
  const [tick, setTick] = useState<{ price: number; bid: number; ask: number } | null>(null);
  const [error, setError] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef(0);

  useEffect(() => {
    if (!symbol) return;
    
    console.log(`[TickStream] Initializing subscription for ${symbol}`);
    setTick(null);
    setError(false);
    retryCountRef.current = 0;

    const connect = () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }

      console.log(`[TickStream] Connecting to SSE stream: /api/terminal/stream/${symbol}`);
      const es = new EventSource(`/api/terminal/stream/${symbol}`);

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'connected') {
            console.log(`[TickStream] Connection Handshake Successful for ${symbol}`);
            setError(false);
            retryCountRef.current = 0;
            return;
          }

          if (data.price) {
            // First tick log
            if (!tick) {
              console.log(`[TickStream] First tick received for ${symbol}: ${data.price}`);
            }
            setTick(data);
          }
          setError(false);
          retryCountRef.current = 0;
        } catch (e) {
          console.error('[TickStream] Parse error:', e);
        }
      };

      es.onerror = () => {
        console.warn(`[TickStream] SSE Error for ${symbol}. Current retry: ${retryCountRef.current}`);
        setError(true);
        es.close();
        
        const delay = Math.min(Math.pow(2, retryCountRef.current) * 1000, 30000);
        retryCountRef.current++;
        reconnectTimeoutRef.current = setTimeout(connect, delay);
      };

      eventSourceRef.current = es;
    };

    connect();

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        console.log('[TickStream] Tab visible, refreshing connection...');
        retryCountRef.current = 0;
        connect();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      console.log(`[TickStream] Cleaning up subscription for ${symbol}`);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [symbol]);

  return { tick, error };
}
