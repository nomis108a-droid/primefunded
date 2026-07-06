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
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    if (!auth) {
      setLoading(false);
      return;
    }

    try {
      const unsubscribeAuth = onAuthStateChanged(auth, (u) => {
        if (!isMountedRef.current) return;
        setUser(u);
        if (!u) {
          setUserData(null);
          setLoading(false);
        }
      });

      return () => {
        isMountedRef.current = false;
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

    const subscribeProfile = () => {
      if (!isMountedRef.current) return;

      if (user && db) {
        try {
          const userRef = doc(db, 'users', user.uid);
          unsubscribeDoc = onSnapshot(userRef, (snapshot) => {
            if (isMountedRef.current) {
              if (snapshot.exists()) {
                setUserData(snapshot.data());
              }
              setLoading(false);
            }
          }, (err) => {
            console.error("[AuthProvider] Profile sync error:", err);
            
            const isAssertionError = err.message?.includes('INTERNAL ASSERTION FAILED');
            
            if (isMountedRef.current) {
              setLoading(false);
              // Retry profile listener after 3 or 5 seconds if it fails
              if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
              
              if (isAssertionError && typeof unsubscribeDoc === 'function') {
                unsubscribeDoc();
              }
              
              retryTimerRef.current = setTimeout(subscribeProfile, isAssertionError ? 5000 : 3000);
            }
          });
        } catch (e) {
          if (isMountedRef.current) setLoading(false);
        }
      } else if (!user && isMountedRef.current) {
        setUserData(null);
      }
    };

    subscribeProfile();

    return () => {
      if (typeof unsubscribeDoc === 'function') {
        unsubscribeDoc();
      }
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }
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
