"use client";

import React, { createContext, useContext, useEffect, useState, useMemo, useRef } from 'react';
import { 
  onAuthStateChanged, 
  User, 
  signOut 
} from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useRouter } from 'next/navigation';

interface AuthContextType {
  user: User | null;
  userData: any | null;
  loading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userData: null,
  loading: true,
  logout: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const retryTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }

    try {
      const unsubscribeAuth = onAuthStateChanged(auth, (u) => {
        setUser(u);
        if (!u) {
          setUserData(null);
          setLoading(false);
        }
      });

      return () => {
        if (typeof unsubscribeAuth === 'function') {
          unsubscribeAuth();
        }
      };
    } catch (err) {
      console.error('[AuthProvider] Auth subscription error:', err);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let unsubscribeDoc: (() => void) | undefined;
    let isMounted = true;

    const subscribeProfile = () => {
      if (!isMounted) return;

      if (user && db) {
        try {
          const userRef = doc(db, 'users', user.uid);
          unsubscribeDoc = onSnapshot(userRef, (snapshot) => {
            if (isMounted) {
              if (snapshot.exists()) {
                setUserData(snapshot.data());
              }
              setLoading(false);
            }
          }, (err) => {
            console.error("[AuthProvider] Profile sync error:", err);
            if (isMounted) {
              setLoading(false);
              // Retry profile listener after 3 seconds if it fails (robustness against b815)
              if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
              retryTimerRef.current = setTimeout(subscribeProfile, 3000);
            }
          });
        } catch (e) {
          if (isMounted) setLoading(false);
        }
      } else if (!user && isMounted) {
        setUserData(null);
      }
    };

    subscribeProfile();

    return () => {
      isMounted = false;
      if (unsubscribeDoc) unsubscribeDoc();
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [user]);

  const logout = async () => {
    if (!auth) return;
    try {
      await signOut(auth);
      router.push('/login');
    } catch (e) {}
  };

  const contextValue = useMemo(() => ({
    user,
    userData,
    loading,
    logout
  }), [user, userData, loading]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};
