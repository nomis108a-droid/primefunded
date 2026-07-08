'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import {
  doc,
  onSnapshot,
  type DocumentReference,
  type DocumentData,
} from 'firebase/firestore';
import { useFirestore } from '../provider';
import { errorEmitter } from '../error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '../errors';

/**
 * Shared state for circuit breaker
 */
let globalQuotaExhausted = false;

/**
 * useDoc Hook
 * Real-time document listener with automated retry logic and absolute cleanup.
 * Hardened to handle quota exhaustion gracefully.
 */
export function useDoc<T = DocumentData>(path: string | null) {
  const db = useFirestore();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const retryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    if (!path || !db || globalQuotaExhausted) {
      setLoading(false);
      if (!globalQuotaExhausted) setData(null);
      return;
    }

    let unsubscribe: () => void = () => {};

    const subscribe = () => {
      if (!isMountedRef.current || globalQuotaExhausted) return;

      try {
        const docRef = doc(db, path) as DocumentReference<T>;

        unsubscribe = onSnapshot(
          docRef,
          (snapshot) => {
            if (!isMountedRef.current) return;
            setData(snapshot.exists() ? snapshot.data() : null);
            setLoading(false);
            setError(null);
          },
          (serverError: any) => {
            if (!isMountedRef.current) return;
            
            console.error(`[Firestore-Doc-Listener] Path: ${path} | Error:`, serverError.message || serverError);

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
                path: docRef.path,
                operation: 'get',
              } satisfies SecurityRuleContext);

              errorEmitter.emit('permission-error', permissionError);
              setError(permissionError);
            } else {
              setError(serverError);
            }
            
            setLoading(false);

            if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
            if (isAssertionError) unsubscribe();

            retryTimerRef.current = setTimeout(() => {
              if (isMountedRef.current && !globalQuotaExhausted) {
                subscribe();
              }
            }, isAssertionError ? 5000 : 3000);
          }
        );
      } catch (err: any) {
        console.error('[useDoc] Initialization Error:', err);
        if (isMountedRef.current) {
          setError(err);
          setLoading(false);
        }
      }
    };

    const initialDelay = setTimeout(subscribe, 50);

    return () => {
      isMountedRef.current = false;
      clearTimeout(initialDelay);
      if (typeof unsubscribe === 'function') unsubscribe();
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [db, path]);

  return useMemo(() => ({ data, loading, error, isQuotaExhausted: globalQuotaExhausted }), [data, loading, error]);
}
