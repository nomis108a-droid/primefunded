
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
 * Global Circuit Breaker to prevent listener storms after quota failure
 */
let globalQuotaExhausted = false;

/**
 * useCollection Hook
 * Fetches a collection in real-time with optimized query stability and automated retry logic.
 * Hardened to handle quota exhaustion and permission errors gracefully.
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

  const q = useMemo(() => {
    if (!path || !db || globalQuotaExhausted) return null;

    // Protection: Prevent expensive global collection scans for high-volume paths
    const SENSITIVE_COLLECTIONS = ["demoAccounts", "demoTrades", "payouts", "breaches", "orders", "referrals", "notifications"];
    if (SENSITIVE_COLLECTIONS.includes(path) && constraints.length === 0) {
      console.warn(`[useCollection] Blocked global listen on sensitive path: ${path}. Use limits/orderBy.`);
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
    
    if (!q || globalQuotaExhausted) {
      setLoading(false);
      if (!globalQuotaExhausted) setData([]);
      return;
    }

    let unsubscribe: () => void = () => {};

    const subscribe = () => {
      if (!isMountedRef.current || !q || globalQuotaExhausted) return;

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
            
            console.error(`[Firestore-Listener] Path: ${path} | Error:`, serverError.message || serverError);
            
            // GLOBAL CIRCUIT BREAKER
            if (serverError.code === 'resource-exhausted') {
              globalQuotaExhausted = true;
              setError(serverError);
              setLoading(false);
              return;
            }

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

            if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
            if (isAssertionError) unsubscribe();

            // Exponential backoff for transport errors
            const backoff = isAssertionError ? 10000 : 5000;
            retryTimerRef.current = setTimeout(() => {
              if (isMountedRef.current && !globalQuotaExhausted) subscribe();
            }, backoff);
          }
        );
      } catch (err) {
        console.error(`[useCollection] Subscription exception for ${path}:`, err);
        if (isMountedRef.current) setLoading(false);
      }
    };

    const initialDelay = setTimeout(subscribe, 100);

    return () => {
      isMountedRef.current = false;
      clearTimeout(initialDelay);
      if (typeof unsubscribe === 'function') unsubscribe();
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [q, path]);

  return useMemo(() => ({ data, loading, error, isQuotaExhausted: globalQuotaExhausted }), [data, loading, error]);
}
