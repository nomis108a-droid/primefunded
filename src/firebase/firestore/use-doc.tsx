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
 * useDoc Hook
 * Real-time document listener with automated retry logic and absolute cleanup.
 */
export function useDoc<T = DocumentData>(path: string | null) {
  const db = useFirestore();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const retryTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!path || !db) {
      setLoading(false);
      setData(null);
      return;
    }

    let isMounted = true;
    let unsubscribe: () => void = () => {};

    const subscribe = () => {
      if (!isMounted) return;

      try {
        const docRef = doc(db, path) as DocumentReference<T>;

        unsubscribe = onSnapshot(
          docRef,
          (snapshot) => {
            if (!isMounted) return;
            setData(snapshot.exists() ? snapshot.data() : null);
            setLoading(false);
            setError(null);
          },
          async (serverError: any) => {
            if (!isMounted) return;
            console.error(`[useDoc] Error for path ${path}:`, serverError);

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

            // Retry logic (3s)
            if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
            retryTimerRef.current = setTimeout(() => {
              if (isMounted) {
                console.log(`[useDoc] Attempting to re-establish listener for ${path}...`);
                subscribe();
              }
            }, 3000);
          }
        );
      } catch (err: any) {
        console.error('[useDoc] Initialization Error:', err);
        setError(err);
        setLoading(false);
      }
    };

    subscribe();

    return () => {
      isMounted = false;
      if (unsubscribe) unsubscribe();
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [db, path]);

  return useMemo(() => ({ data, loading, error }), [data, loading, error]);
}
