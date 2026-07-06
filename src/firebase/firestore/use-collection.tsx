'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import {
  collection,
  onSnapshot,
  query,
  type DocumentData,
  type QueryConstraint,
} from 'firebase/firestore';
import { useFirestore } from '../provider';
import { errorEmitter } from '../error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '../errors';

const DEFAULT_CONSTRAINTS: QueryConstraint[] = [];

/**
 * useCollection Hook
 * Fetches a collection in real-time with optimized query stability and automated retry logic.
 */
export function useCollection<T = DocumentData>(
  path: string | null,
  constraints: QueryConstraint[] = DEFAULT_CONSTRAINTS
) {
  const db = useFirestore();
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const retryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  // Memoize the query object to prevent unnecessary re-subscriptions
  const q = useMemo(() => {
    if (!path || !db) return null;

    // Security collections that MUST have a filter
    const SENSITIVE_COLLECTIONS = ["demoAccounts", "demoTrades", "payouts", "breaches", "orders", "mt5_accounts", "mt5_trades", "referrals", "notifications", "certificates"];
    
    if (SENSITIVE_COLLECTIONS.includes(path) && constraints.length === 0) {
      return null;
    }

    try {
      return query(collection(db, path), ...constraints);
    } catch (e) {
      console.error("[useCollection] Query Construction Error:", e);
      return null;
    }
  }, [db, path, constraints]);

  useEffect(() => {
    isMountedRef.current = true;
    
    if (!q) {
      setLoading(false);
      setData([]);
      return;
    }

    let unsubscribe: () => void = () => {};

    const subscribe = () => {
      if (!isMountedRef.current || !q) return;

      try {
        unsubscribe = onSnapshot(
          q,
          (snapshot) => {
            if (!isMountedRef.current) return;
            const docs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as T));
            setData(docs);
            setLoading(false);
            setError(null);
          },
          (serverError: any) => {
            if (!isMountedRef.current) return;
            
            // Check for critical assertion errors (b815 / ca9)
            const isAssertionError = serverError.message?.includes('INTERNAL ASSERTION FAILED');
            
            if (serverError.code === 'permission-denied') {
              const permissionError = new FirestorePermissionError({
                path: path || 'unknown',
                operation: 'list',
              } satisfies SecurityRuleContext);
              errorEmitter.emit('permission-error', permissionError);
              setError(permissionError);
            } else {
              setError(serverError);
            }
            
            setLoading(false);

            // Retry logic (3s or 5s for assertions) to handle transient failures
            if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
            
            // If it's a critical ca9 error, perform a full clean stop before retrying
            if (isAssertionError) {
              unsubscribe();
            }

            retryTimerRef.current = setTimeout(() => {
              if (isMountedRef.current) {
                subscribe();
              }
            }, isAssertionError ? 5000 : 3000);
          }
        );
      } catch (err) {
        console.error(`[useCollection] Subscription exception for ${path}:`, err);
        if (isMountedRef.current) setLoading(false);
      }
    };

    // Delay initial subscription slightly to avoid race conditions during initialization
    const initialDelay = setTimeout(subscribe, 50);

    return () => {
      isMountedRef.current = false;
      clearTimeout(initialDelay);
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }
    };
  }, [q, path]);

  return useMemo(() => ({ data, loading, error }), [data, loading, error]);
}
