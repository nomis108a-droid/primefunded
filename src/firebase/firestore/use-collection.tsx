'use client';

import { useEffect, useState, useMemo } from 'react';
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
 */
export function useCollection<T = DocumentData>(
  path: string | null,
  constraints: QueryConstraint[] = DEFAULT_CONSTRAINTS
) {
  const db = useFirestore();
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

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
    if (!q) {
      setLoading(false);
      setData([]);
      return;
    }

    let isMounted = true;

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (!isMounted) return;
        const docs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as T));
        setData(docs);
        setLoading(false);
        setError(null);
      },
      async (serverError: any) => {
        if (!isMounted) return;
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
      }
    );

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [q, path]);

  return useMemo(() => ({ data, loading, error }), [data, loading, error]);
}