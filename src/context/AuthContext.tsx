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
    const unsubscribeAuth = onAuthStateChanged(auth, (u) => {
      // FIX: Use the 'u' parameter from the callback, not the 'user' state variable
      setUser(u);
      
      // If no user is logged in, we are no longer loading
      if (!u) {
        setUserData(null);
        setLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    let unsubscribeDoc: (() => void) | undefined;

    if (user) {
      const userRef = doc(db, 'users', user.uid);
      unsubscribeDoc = onSnapshot(userRef, (snapshot) => {
        if (snapshot.exists()) {
          setUserData(snapshot.data());
        }
        // Once we have (or fail to have) user data, we are done loading
        setLoading(false);
      }, (err) => {
        console.error("Error fetching user data:", err);
        setLoading(false);
      });
    }

    return () => {
      if (unsubscribeDoc) unsubscribeDoc();
    };
  }, [user]);

  const logout = async () => {
    await signOut(auth);
    router.push('/login');
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
