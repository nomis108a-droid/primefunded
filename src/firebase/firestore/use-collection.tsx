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

const DEFAULT_CONSTRAINTS: QueryConstraint[] = [];

/**
 * useCollection Hook
 * Fetches a collection in real-time with optimized query stability and security guards.
 * 
 * CRITICAL: The constraints array MUST be memoized by the caller using useMemo.
 * If not memoized, this hook will trigger a re-subscription loop.
 */
export function useCollection<T = DocumentData>(
  path: string | null,
  constraints: QueryConstraint[] = DEFAULT_CONSTRAINTS
) {
  const db = useFirestore();
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Security collections that MUST have a filter to prevent unauthorized scans
  const SENSITIVE_COLLECTIONS = ["demoAccounts", "demoTrades", "payouts", "breaches", "orders", "mt5_accounts", "mt5_trades", "referrals", "notifications", "certificates"];

  useEffect(() => {
    if (!path || !db) {
      setLoading(false);
      setData([]);
      return;
    }

    // Rule Guard: Enforce mandatory filtering on sensitive collections
    // This protects against "Permission Denied" errors from wide-open scans
    if (SENSITIVE_COLLECTIONS.includes(path) && constraints.length === 0) {
      console.warn(`[useCollection] Security Guard: Query on "${path}" blocked. Missing required filters.`);
      setLoading(false);
      setData([]);
      return;
    }

    let unsubscribe: () => void = () => {};

    try {
      const collectionRef = collection(db, path);
      const q = query(collectionRef, ...constraints);

      unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const docs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as T));
          setData(docs);
          setLoading(false);
          setError(null);
        },
        async (serverError: any) => {
          if (serverError.code === 'permission-denied') {
            const permissionError = new FirestorePermissionError({
              path: collectionRef.path,
              operation: 'list',
              requestResourceData: { path, constraintsCount: constraints.length }
            } satisfies SecurityRuleContext);
            errorEmitter.emit('permission-error', permissionError);
            setError(permissionError);
          } else {
            console.error(`[useCollection] Firestore Error (${path}):`, serverError.message);
            setError(serverError);
          }
          setLoading(false);
        }
      );
    } catch (err: any) {
      console.error('[useCollection] Execution Error:', err);
      setError(err);
      setLoading(false);
    }

    return () => {
      unsubscribe();
    };
  }, [db, path, constraints]); // constraints must be stable reference (memoized)

  return { data, loading, error };
}
