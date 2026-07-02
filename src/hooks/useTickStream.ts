'use client';

import { useState, useEffect, useRef } from 'react';

/**
 * @fileOverview high-frequency SSE price hook
 * Subscribes to the server-side memory buffer for a single symbol.
 */
export function useTickStream(symbol: string) {
  const [tick, setTick] = useState<{ price: number; bid: number; ask: number } | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!symbol) return;

    const connect = () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      // Native EventSource for near-zero overhead
      const es = new EventSource(`/api/terminal/stream/${symbol}`);

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setTick(data);
        } catch (e) {
          console.error('[TickStream] Parse error:', e);
        }
      };

      es.onerror = () => {
        es.close();
        // Exponential backoff or simple delay
        setTimeout(connect, 2000);
      };

      eventSourceRef.current = es;
    };

    connect();

    // Re-sync on visibility to ensure feed isn't stale after background sleep
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        connect();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [symbol]);

  return tick;
}
