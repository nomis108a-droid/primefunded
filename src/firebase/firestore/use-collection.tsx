'use client';

import { useEffect, useState } from 'react';
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

/**
 * useCollection Hook
 * Fetches a collection in real-time.
 * path: The collection path, or null if the query should not be established yet.
 * constraints: Firestore QueryConstraints (must be memoized for stability).
 */
export function useCollection<T = DocumentData>(
  path: string | null,
  constraints: QueryConstraint[] = []
) {
  const db = useFirestore();
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // FIXED: Return early if path is null or db is not initialized.
    // components should pass null if user authentication is not yet confirmed.
    if (!path || !db) {
      setLoading(false);
      return;
    }

    try {
      const collectionRef = collection(db, path);
      
      // If path is sensitive (like demoAccounts), and constraints are empty,
      // it may trigger a permission error. The calling component is responsible
      // for providing correct filters before enabling the path.
      const q = query(collectionRef, ...constraints);

      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          setData(
            snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as T))
          );
          setLoading(false);
          setError(null);
        },
        async (serverError: any) => {
          const permissionError = new FirestorePermissionError({
            path: collectionRef.path,
            operation: 'list',
          } satisfies SecurityRuleContext);

          if (serverError.code === 'permission-denied') {
            errorEmitter.emit('permission-error', permissionError);
          }
          
          setError(serverError);
          setLoading(false);
        }
      );

      return () => unsubscribe();
    } catch (err: any) {
      console.error('[useCollection] Critical Initialization Error:', err);
      setError(err);
      setLoading(false);
    }
  }, [db, path, constraints]); // FIXED: Removed JSON.stringify(constraints) for stability with class instances

  return { data, loading, error };
}
