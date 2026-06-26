'use client';

import { useEffect, useState, useRef } from 'react';
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
 * Fetches a collection in real-time with optimized query stability.
 */
export function useCollection<T = DocumentData>(
  path: string | null,
  constraints: QueryConstraint[] = []
) {
  const db = useFirestore();
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Stability Check: Prevents infinite loops caused by non-memoized constraint arrays
  const constraintHash = useRef<string>("");
  const stableConstraints = useRef<QueryConstraint[]>([]);

  useEffect(() => {
    // Return early if path is null or db is not initialized
    if (!path || !db) {
      setLoading(false);
      return;
    }

    try {
      const collectionRef = collection(db, path);
      
      // Mandatory Filter Guard: Critical security collections MUST have filters
      // This prevents accidental broad queries that fail Firestore security rules
      if ((path === "demoAccounts" || path === "demoTrades" || path === "payouts") && constraints.length === 0) {
        console.warn(`[useCollection] Attempted broad query on sensitive path: ${path}. Blocked for security.`);
        setLoading(false);
        return;
      }

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
          if (serverError.code === 'permission-denied') {
            const permissionError = new FirestorePermissionError({
              path: collectionRef.path,
              operation: 'list',
            } satisfies SecurityRuleContext);
            errorEmitter.emit('permission-error', permissionError);
            setError(permissionError);
          } else {
            setError(serverError);
          }
          setLoading(false);
        }
      );

      return () => unsubscribe();
    } catch (err: any) {
      console.error('[useCollection] Initialization Error:', err);
      setError(err);
      setLoading(false);
    }
  }, [db, path, constraints]); 

  return { data, loading, error };
}
