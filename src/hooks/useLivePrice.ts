'use client';

import { useState, useEffect, useMemo } from 'react';
import { ref, onValue } from 'firebase/database';
import { useRtdb } from '@/firebase';

export interface LivePrice {
  symbol: string;
  price: number;
  bid: number;
  ask: number;
  updatedAt: Date | null;
}

/**
 * Hook for multiple symbols subscription
 * Optimized for high-frequency trading terminals.
 * Listens to the Realtime Database (RTDB) for sub-second price delivery.
 */
export function useLivePrices(symbols: string[]) {
  const rtdb = useRtdb();
  const [prices, setPrices] = useState<Record<string, LivePrice>>({});

  // Memoize upper case symbols for comparison
  const upperSymbols = useMemo(() => 
    symbols.map(s => s.toUpperCase())
  , [symbols]);

  // Stable key for symbols to avoid effect re-runs
  const symbolsKey = useMemo(() => 
    JSON.stringify(upperSymbols)
  , [upperSymbols]);

  useEffect(() => {
    if (!rtdb || !upperSymbols.length) {
      setPrices({});
      return;
    }

    const pricesRef = ref(rtdb, 'livePrices');

    const subscribe = () => {
      return onValue(pricesRef, (snapshot) => {
        const data = snapshot.val();
        if (!data) return;

        const nextPrices: Record<string, LivePrice> = {};
        
        upperSymbols.forEach((sym) => {
          const tick = data[sym];
          if (tick) {
            nextPrices[sym] = {
              symbol: sym,
              price: Number(tick.price) || 0,
              bid: Number(tick.bid) || Number(tick.price) || 0,
              ask: Number(tick.ask) || Number(tick.price) || 0,
              updatedAt: tick.updatedAt ? new Date(tick.updatedAt) : null
            };
          }
        });
        
        setPrices(nextPrices);
      });
    };

    // Initial subscription
    let unsubscribe = subscribe();

    // Visibility change handler to ensure fresh connection after tab suspension
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        unsubscribe();
        unsubscribe = subscribe();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      unsubscribe();
    };
  }, [rtdb, symbolsKey, upperSymbols]);

  return prices;
}
