'use client';

import { useState, useEffect, useRef } from 'react';
import { onSnapshot, collection, type Unsubscribe } from 'firebase/firestore';
import { db } from '@/lib/firebase';
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
 * Automatically re-subscribes when tab visibility returns to ensure fresh data.
 */
export function useLivePrices(symbols: string[]) {
  const [prices, setPrices] = useState<Record<string, LivePrice>>({});
  const unsubRef = useRef<Unsubscribe | null>(null);

  // Use a string representation of symbols for the dependency array to ensure
  // we only re-run when the list of symbols actually changes.
  const symbolsKey = JSON.stringify(symbols.map(s => s.toUpperCase()));

  useEffect(() => {
    if (!db || !symbols.length) {
      setPrices({});
      return;
    }

    const upperSymbols = symbols.map(s => s.toUpperCase());

    /**
     * Set up the Firestore listener and return the unsubscribe function.
     */
    const subscribeToLivePrices = () => {
      // Direct collection listener is most efficient for a terminal with multiple active widgets
      return onSnapshot(collection(db, 'livePrices'), (snap) => {
        const updatedPrices: Record<string, LivePrice> = {};
        
        snap.docs.forEach((d) => {
          const docId = d.id.toUpperCase();
          if (upperSymbols.includes(docId)) {
            const data = d.data();
            updatedPrices[docId] = {
              symbol: docId,
              price: Number(data.price) || 0,
              bid: Number(data.bid) || Number(data.price) || 0,
              ask: Number(data.ask) || Number(data.price) || 0,
              updatedAt: data.updatedAt?.toDate() || null
            };
          }
        });
        
        // Atomic update of the entire state object to trigger a single re-render
        setPrices(prev => ({ ...prev, ...updatedPrices }));
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

    // 2. Visibility change handler
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Tear down the old listener and re-subscribe fresh
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
  }, [symbolsKey]);

  return prices;
}
