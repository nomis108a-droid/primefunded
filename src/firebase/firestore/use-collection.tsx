
'use client';

import { useEffect, useState } from 'react';
import {
  collection,
  onSnapshot,
  query,
  where,
  type DocumentData,
  type QueryConstraint,
} from 'firebase/firestore';
import { useFirestore } from '../provider';
import { errorEmitter } from '../error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '../errors';

/**
 * useCollection Hook
 * Fetches a collection in real-time with optimized query stability and security enforcement.
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
    // Return early if path is null or db is not initialized
    if (!path || !db) {
      setLoading(false);
      return;
    }

    try {
      const collectionRef = collection(db, path);
      
      // CRITICAL SECURITY GUARD: Verify that sensitive collections have a mandatory filter
      // This prevents permission errors triggered by accidental broad queries before auth state resolves.
      const SENSITIVE_COLLECTIONS = ["demoAccounts", "demoTrades", "payouts", "breaches", "orders"];
      const isSensitive = SENSITIVE_COLLECTIONS.includes(path);
      
      if (isSensitive && constraints.length === 0) {
        console.warn(`[useCollection] Security Guard: Path "${path}" requires filtering. Query blocked.`);
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
              requestResourceData: { 
                note: "Permission denied on collection fetch. Ensure query filters match security rules.",
                collection: path
              }
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
      console.error('[useCollection] Execution Error:', err);
      setError(err);
      setLoading(false);
    }
  }, [db, path, JSON.stringify(constraints)]); // Serialize constraints for effect stability

  return { data, loading, error };
}
