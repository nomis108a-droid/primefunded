
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

    const unsub = onSnapshot(doc(db, 'livePrices', symbol), (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        setData({
          symbol: d.symbol || symbol,
          price: Number(d.price) || 0,
          bid: Number(d.bid) || Number(d.price) || 0,
          ask: Number(d.ask) || Number(d.price) || 0,
          updatedAt: d.updatedAt?.toDate() || null
        });
      }
    }, (err) => {
      if (err.code === 'permission-denied') {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: `livePrices/${symbol}`,
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
 * Listens to all symbols in the provided list simultaneously.
 */
export function useLivePrices(symbols: string[]) {
  const [prices, setPrices] = useState<Record<string, LivePrice>>({});

  useEffect(() => {
    if (!db || !symbols.length) return;

    const unsub = onSnapshot(collection(db, 'livePrices'), (snap) => {
      // Diagnostic log to confirm Firestore connectivity
      console.log(`[useLivePrices] Feed update received at ${new Date().toLocaleTimeString()}. Docs in snapshot: ${snap.docs.length}`);
      
      const next: Record<string, LivePrice> = { ...prices };
      snap.docs.forEach((d) => {
        if (symbols.includes(d.id)) {
          const data = d.data();
          next[d.id] = {
            symbol: d.id,
            price: Number(data.price) || 0,
            bid: Number(data.bid) || Number(data.price) || 0,
            ask: Number(data.ask) || Number(data.price) || 0,
            updatedAt: data.updatedAt?.toDate() || null
          };
        }
      });
      // Replace state with a fresh object to trigger React re-render
      setPrices({ ...next });
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
  }, [JSON.stringify(symbols)]);

  return prices;
}
