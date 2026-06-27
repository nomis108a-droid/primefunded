'use client';

import { useEffect, useState, useMemo } from 'react';
import {
  doc,
  onSnapshot,
  type DocumentReference,
  type DocumentData,
} from 'firebase/firestore';
import { useFirestore } from '../provider';
import { errorEmitter } from '../error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '../errors';

export function useDoc<T = DocumentData>(path: string | null) {
  const db = useFirestore();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!path || !db) {
      setLoading(false);
      setData(null);
      return;
    }

    let isMounted = true;

    try {
      const docRef = doc(db, path) as DocumentReference<T>;

      const unsubscribe = onSnapshot(
        docRef,
        (snapshot) => {
          if (!isMounted) return;
          setData(snapshot.exists() ? snapshot.data() : null);
          setLoading(false);
          setError(null);
        },
        async (serverError: any) => {
          if (!isMounted) return;
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
        }
      );

      return () => {
        isMounted = false;
        unsubscribe();
      };
    } catch (err: any) {
      console.error('[useDoc] Initialization Error:', err);
      setError(err);
      setLoading(false);
    }
  }, [db, path]);

  return useMemo(() => ({ data, loading, error }), [data, loading, error]);
}