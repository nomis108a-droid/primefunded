'use client';

import { useState, useEffect } from 'react';
import { doc, onSnapshot, collection } from 'firebase/firestore';
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
 */
export function useLivePrices(symbols: string[]) {
  const [prices, setPrices] = useState<Record<string, LivePrice>>({});
  const upperSymbols = symbols.map(s => s.toUpperCase());

  useEffect(() => {
    if (!db || !upperSymbols.length) return;

    // Direct collection listener is most efficient for a terminal with multiple active widgets
    const unsub = onSnapshot(collection(db, 'livePrices'), (snap) => {
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

    return () => unsub();
  }, [JSON.stringify(upperSymbols)]);

  return prices;
}
