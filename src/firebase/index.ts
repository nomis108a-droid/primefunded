'use client';

import { initializeApp, getApps, type FirebaseApp, getApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { 
  initializeFirestore, 
  getFirestore,
  type Firestore, 
  persistentLocalCache, 
  persistentSingleTabManager 
} from 'firebase/firestore';
import { firebaseConfig } from './config';

/**
 * Singleton state to ensure Firebase is only initialized once.
 */
let cachedFirebase: {
  firebaseApp: FirebaseApp | null;
  firestore: Firestore | null;
  auth: Auth | null;
} | null = null;

/**
 * Initializes the Firebase Client App Instance with production services.
 * Modern configuration with experimentalForceOwningTab support to prevent multi-tab errors.
 * Includes idempotency guard to prevent "already initialized" errors.
 */
export function initializeFirebase(): {
  firebaseApp: FirebaseApp | null;
  firestore: Firestore | null;
  auth: Auth | null;
} {
  // Return cached instance if it exists
  if (cachedFirebase) return cachedFirebase;

  const isConfigMissing = !firebaseConfig.apiKey || firebaseConfig.apiKey === '';
  
  if (isConfigMissing) {
    return { firebaseApp: null, firestore: null, auth: null };
  }

  try {
    const firebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    const auth = getAuth(firebaseApp);
    
    // Modern initialization with multi-tab conflict resolution
    // Wrapped in try/catch to handle cases where it's already initialized (e.g. by another module)
    let firestore: Firestore;
    try {
      firestore = initializeFirestore(firebaseApp, {
        localCache: persistentLocalCache({
          tabManager: persistentSingleTabManager({ forceOwnership: true })
        })
      });
    } catch (e) {
      // If initializeFirestore fails (usually because it was already called), 
      // return the existing instance.
      firestore = getFirestore(firebaseApp);
    }

    cachedFirebase = { firebaseApp, firestore, auth };
    return cachedFirebase;
  } catch (error) {
    console.error('[Firebase] Initialization Error:', error);
    return { firebaseApp: null, firestore: null, auth: null };
  }
}

export * from './provider';
export * from './client-provider';
export * from './auth/use-user';
export * from './firestore/use-doc';
export * from './firestore/use-collection';
