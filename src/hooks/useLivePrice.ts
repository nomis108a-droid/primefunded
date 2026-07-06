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
 * Maintains connection even when the tab is inactive for persistent risk monitoring.
 */
export function useLivePrices(symbols: string[]) {
  const rtdb = useRtdb();
  const [prices, setPrices] = useState<Record<string, LivePrice>>({});

  const upperSymbols = useMemo(() => 
    symbols.map(s => s.toUpperCase())
  , [symbols]);

  const symbolsKey = useMemo(() => 
    JSON.stringify(upperSymbols)
  , [upperSymbols]);

  useEffect(() => {
    if (!rtdb || !upperSymbols.length) {
      setPrices({});
      return;
    }

    const pricesRef = ref(rtdb, 'livePrices');

    const unsubscribe = onValue(pricesRef, (snapshot) => {
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

    return () => {
      unsubscribe();
    };
  }, [rtdb, symbolsKey, upperSymbols]);

  return prices;
}