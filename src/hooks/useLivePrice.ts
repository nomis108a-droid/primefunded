
'use client';

import { useState, useEffect } from 'react';
import { doc, onSnapshot, collection } from 'firebase/firestore';
import { db } from '@/lib/firebase';

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
          price: d.price || 0,
          bid: d.bid || d.price || 0,
          ask: d.ask || d.price || 0,
          updatedAt: d.updatedAt?.toDate() || null
        });
      }
    });

    return () => unsub();
  }, [symbol]);

  return data;
}

/**
 * Hook for multiple symbols subscription
 */
export function useLivePrices(symbols: string[]) {
  const [prices, setPrices] = useState<Record<string, LivePrice>>({});

  useEffect(() => {
    if (!db || !symbols.length) return;

    // We listen to the whole collection but filter locally to avoid complex query overhead for the bridge
    const unsub = onSnapshot(collection(db, 'livePrices'), (snap) => {
      const next: Record<string, LivePrice> = {};
      snap.docs.forEach((d) => {
        const data = d.data();
        if (symbols.includes(d.id)) {
          next[d.id] = {
            symbol: d.id,
            price: data.price || 0,
            bid: data.bid || data.price || 0,
            ask: data.ask || data.price || 0,
            updatedAt: data.updatedAt?.toDate() || null
          };
        }
      });
      setPrices(prev => ({ ...prev, ...next }));
    });

    return () => unsub();
  }, [JSON.stringify(symbols)]);

  return prices;
}
