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
 * Fetches a collection in real-time with optimized query stability and security guards.
 */
export function useCollection<T = DocumentData>(
  path: string | null,
  constraints: QueryConstraint[] = []
) {
  const db = useFirestore();
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Security collections that MUST have a where("userId", "==", ...) filter
  const SENSITIVE_COLLECTIONS = ["demoAccounts", "demoTrades", "payouts", "breaches", "orders", "mt5_accounts", "mt5_trades", "referrals", "notifications", "certificates"];

  useEffect(() => {
    // Rule B Guard: Do not execute if path is null or db is not initialized
    if (!path || !db) {
      setLoading(false);
      return;
    }

    try {
      const collectionRef = collection(db, path);
      
      // Rule A Guard: Enforce mandatory filtering on sensitive collections
      if (SENSITIVE_COLLECTIONS.includes(path) && constraints.length === 0) {
        console.warn(`[useCollection] Security Guard: Query on "${path}" blocked. Missing required filters.`);
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
          // FIXED: Do not log "Permission denied" blindly. Log the actual error.
          if (serverError.code === 'permission-denied') {
            console.error(`[useCollection] Permission denied on path: ${path}. Ensure query filters match rules.`);
            const permissionError = new FirestorePermissionError({
              path: collectionRef.path,
              operation: 'list',
              requestResourceData: { 
                note: "Permission denied. Ensure query filters match collection security rules.",
                path 
              }
            } satisfies SecurityRuleContext);
            errorEmitter.emit('permission-error', permissionError);
            setError(permissionError);
          } else {
            // This will now correctly log "The query requires an index" if that is the case
            console.error(`[useCollection] Error on path: ${path} (${serverError.code}):`, serverError.message);
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
  }, [db, path, JSON.stringify(constraints)]);

  return { data, loading, error };
}