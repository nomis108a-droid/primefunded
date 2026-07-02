'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { onSnapshot, collection, type Unsubscribe } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';

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
 * Listens to the entire livePrices collection and maps to requested symbols.
 * Utilizes the useFirestore context for reliable connection management.
 */
export function useLivePrices(symbols: string[]) {
  const firestore = useFirestore();
  const [prices, setPrices] = useState<Record<string, LivePrice>>({});
  const unsubRef = useRef<Unsubscribe | null>(null);

  // Memoize upper case symbols for comparison
  const upperSymbols = useMemo(() => 
    symbols.map(s => s.toUpperCase())
  , [symbols]);

  // Stable key for symbols to avoid effect re-runs if array reference changes but content is same
  const symbolsKey = useMemo(() => 
    JSON.stringify(upperSymbols)
  , [upperSymbols]);

  useEffect(() => {
    if (!firestore || !upperSymbols.length) {
      setPrices({});
      return;
    }

    /**
     * Set up the Firestore listener. 
     * Subscription to the entire collection is most efficient for a multi-asset terminal.
     */
    const subscribeToLivePrices = () => {
      return onSnapshot(collection(firestore, 'livePrices'), (snap) => {
        const nextPrices: Record<string, LivePrice> = {};
        
        snap.docs.forEach((d) => {
          const docId = d.id.toUpperCase();
          if (upperSymbols.includes(docId)) {
            const data = d.data();
            
            // Robust date parsing for both Server Timestamps and REST ISO strings
            let date = null;
            if (data.updatedAt) {
              if (typeof data.updatedAt.toDate === 'function') {
                date = data.updatedAt.toDate();
              } else {
                date = new Date(data.updatedAt);
              }
            }

            nextPrices[docId] = {
              symbol: docId,
              price: Number(data.price) || 0,
              bid: Number(data.bid) || Number(data.price) || 0,
              ask: Number(data.ask) || Number(data.price) || 0,
              updatedAt: date
            };
          }
        });
        
        setPrices(nextPrices);
      }, (err) => {
        console.error('[useLivePrices] Subscription error:', err);
        if (err.code === 'permission-denied') {
          errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'livePrices',
            operation: 'list'
          } satisfies SecurityRuleContext));
        }
      });
    };

    // 1. Initial subscription
    unsubRef.current = subscribeToLivePrices();

    // 2. Visibility change handler to ensure fresh data after tab suspension
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        unsubRef.current?.();
        unsubRef.current = subscribeToLivePrices();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // 3. Cleanup on unmount or dependency change
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      unsubRef.current?.();
      unsubRef.current = null;
    };
  }, [firestore, symbolsKey, upperSymbols]);

  return prices;
}
