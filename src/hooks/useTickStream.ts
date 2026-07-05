'use client';

import { useState, useEffect, useRef } from 'react';

/**
 * @fileOverview high-frequency SSE price hook
 * Subscribes to the server-side memory buffer for a single symbol.
 * Hardened with exponential backoff and error tracking.
 */
export function useTickStream(symbol: string) {
  const [tick, setTick] = useState<{ price: number; bid: number; ask: number } | null>(null);
  const [error, setError] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef(0);

  useEffect(() => {
    if (!symbol) return;
    
    // Reset state on symbol change
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

      const es = new EventSource(`/api/terminal/stream/${symbol}`);

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setTick(data);
          setError(false);
          retryCountRef.current = 0; // Success! Reset retry counter
        } catch (e) {
          console.error('[TickStream] Parse error:', e);
        }
      };

      es.onerror = () => {
        setError(true);
        es.close();
        
        // Exponential backoff to avoid 429 Too Many Requests
        // 2s, 4s, 8s, 16s, then max 30s
        const delay = Math.min(Math.pow(2, retryCountRef.current) * 1000, 30000);
        retryCountRef.current++;
        
        console.warn(`[TickStream] connection lost. Retrying in ${delay}ms...`);
        reconnectTimeoutRef.current = setTimeout(connect, delay);
      };

      eventSourceRef.current = es;
    };

    connect();

    // Re-sync on visibility to ensure feed isn't stale
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        retryCountRef.current = 0;
        connect();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
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
