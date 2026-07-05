'use client';

import { useState, useEffect, useRef } from 'react';

/**
 * @fileOverview high-frequency SSE price hook
 * Subscribes to the server-side memory buffer for a single symbol.
 * Handles graceful server-side resets with immediate reconnection.
 */
export function useTickStream(symbol: string) {
  const [tick, setTick] = useState<{ price: number; bid: number; ask: number } | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!symbol) return;
    setTick(null);

    const connect = () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
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
        // Distinguish between a graceful closure (after 4 mins) and a genuine error
        if (es.readyState === EventSource.CLOSED) {
          // Connection ended cleanly by server; reconnect immediately for seamless feed
          es.close();
          connect();
        } else {
          // Connection failed or timed out unexpectedly; wait 2s before retry
          es.close();
          reconnectTimeoutRef.current = setTimeout(connect, 2000);
        }
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
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [symbol]);

  return tick;
}
