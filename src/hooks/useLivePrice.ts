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
 * Hook for a single symbol subscription
 */
export function useLivePrice(symbol: string) {
  const [data, setData] = useState<LivePrice | null>(null);

  useEffect(() => {
    if (!db || !symbol) return;

    const unsub = onSnapshot(doc(db, 'livePrices', symbol.toUpperCase()), (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        setData({
          symbol: d.symbol || symbol.toUpperCase(),
          price: Number(d.price) || 0,
          bid: Number(d.bid) || Number(d.price) || 0,
          ask: Number(d.ask) || Number(d.price) || 0,
          updatedAt: d.updatedAt?.toDate() || null
        });
      }
    }, (err) => {
      if (err.code === 'permission-denied') {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: `livePrices/${symbol.toUpperCase()}`,
          operation: 'get'
        } satisfies SecurityRuleContext));
      }
    });

    return () => unsub();
  }, [symbol]);

  return data;
}

/**
 * Hook for multiple symbols subscription
 * Optimized for high-frequency trading terminals.
 */
export function useLivePrices(symbols: string[]) {
  const [prices, setPrices] = useState<Record<string, LivePrice>>({});
  const upperSymbols = symbols.map(s => s.toUpperCase());

  useEffect(() => {
    if (!db || !upperSymbols.length) return;

    // Listen to entire collection for efficiency and map to requested symbols
    const unsub = onSnapshot(collection(db, 'livePrices'), (snap) => {
      setPrices((prev) => {
        const next = { ...prev };
        let updatedCount = 0;
        
        snap.docs.forEach((d) => {
          const docId = d.id.toUpperCase();
          if (upperSymbols.includes(docId)) {
            const data = d.data();
            next[docId] = {
              symbol: docId,
              price: Number(data.price) || 0,
              bid: Number(data.bid) || Number(data.price) || 0,
              ask: Number(data.ask) || Number(data.price) || 0,
              updatedAt: data.updatedAt?.toDate() || null
            };
            updatedCount++;
          }
        });
        
        return next;
      });
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
