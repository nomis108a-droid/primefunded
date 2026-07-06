'use client';

import { useState, useEffect, useRef } from 'react';

/**
 * @fileOverview high-frequency SSE price hook
 * Subscribes to the server-side memory buffer for a single symbol.
 * Hardened with synchronous state reset and exponential backoff.
 * Maintains connection in the background for consistent data collection.
 */
export function useTickStream(symbol: string) {
  const [tick, setTick] = useState<{ price: number; bid: number; ask: number } | null>(null);
  const [error, setError] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef(0);

  // CRITICAL: Synchronously reset tick state when symbol changes to prevent 
  // stale price data from leaking into the new symbol's chart during transition.
  const [lastSymbol, setLastSymbol] = useState(symbol);
  if (lastSymbol !== symbol) {
    setLastSymbol(symbol);
    setTick(null);
  }

  useEffect(() => {
    if (!symbol) return;
    
    // Ensure state is clean for new symbol connection
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
          
          if (data.type === 'connected') {
            setError(false);
            retryCountRef.current = 0;
            return;
          }

          if (data.price) {
            setTick(data);
          }
          setError(false);
          retryCountRef.current = 0;
        } catch (e) {
          console.error('[TickStream] Parse error:', e);
        }
      };

      es.onerror = () => {
        setError(true);
        es.close();
        
        // Exponential backoff only on actual error, not visibility change
        const delay = Math.min(Math.pow(2, retryCountRef.current) * 1000, 30000);
        retryCountRef.current++;
        reconnectTimeoutRef.current = setTimeout(connect, delay);
      };

      eventSourceRef.current = es;
    };

    connect();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [symbol]);

  return { tick, error };
}