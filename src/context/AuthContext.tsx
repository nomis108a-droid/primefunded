
"use client";

import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
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

  useEffect(() => {
    // DEFENSIVE: Prevent crash if firebase auth is not initialized
    if (!auth) {
      console.warn('[AuthProvider] Firebase Auth instance is not available.');
      setLoading(false);
      return;
    }

    try {
      const unsubscribeAuth = onAuthStateChanged(auth, (u) => {
        setUser(u);
        
        // If no user is logged in, we are no longer loading profile data
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

    if (user && db) {
      try {
        const userRef = doc(db, 'users', user.uid);
        unsubscribeDoc = onSnapshot(userRef, (snapshot) => {
          if (snapshot.exists()) {
            setUserData(snapshot.data());
          }
          setLoading(false);
        }, (err) => {
          console.error("[AuthProvider] Profile sync error:", err);
          setLoading(false);
        });
      } catch (e) {
        setLoading(false);
      }
    } else if (!user) {
      setUserData(null);
    }

    return () => {
      if (unsubscribeDoc) unsubscribeDoc();
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
