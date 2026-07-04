'use client';

import { initializeApp, getApps, type FirebaseApp, getApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { 
  initializeFirestore, 
  getFirestore,
  type Firestore, 
  persistentLocalCache,
  memoryLocalCache
} from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import { firebaseConfig } from './config';

/**
 * Singleton state to ensure Firebase is only initialized once.
 */
let cachedFirebase: {
  firebaseApp: FirebaseApp | null;
  firestore: Firestore | null;
  auth: Auth | null;
  storage: FirebaseStorage | null;
} | null = null;

/**
 * Initializes the Firebase Client App Instance with production services.
 * Uses persistent cache with fallback to memory if multi-tab conflicts occur.
 */
export function initializeFirebase(): {
  firebaseApp: FirebaseApp | null;
  firestore: Firestore | null;
  auth: Auth | null;
  storage: FirebaseStorage | null;
} {
  if (cachedFirebase) return cachedFirebase;

  const isConfigMissing = !firebaseConfig.apiKey || firebaseConfig.apiKey === '';
  
  if (isConfigMissing) {
    return { firebaseApp: null, firestore: null, auth: null, storage: null };
  }

  try {
    const firebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    const auth = getAuth(firebaseApp);
    const storage = getStorage(firebaseApp);
    
    let firestore: Firestore;
    
    // Check if we are in the Cloud Workstations / Firebase Studio environment
    const isStudio = typeof window !== 'undefined' && 
      (window.location.hostname.includes('cloudworkstations.dev') || 
       window.location.hostname.includes('firebase-studio'));

    try {
      // In Studio/Workstations, IndexedDB persistence can sometimes crash due to 
      // how iframes and local storage interact. We use memory cache for stability.
      firestore = initializeFirestore(firebaseApp, {
        localCache: isStudio 
          ? memoryLocalCache() 
          : persistentLocalCache({}) 
      });
    } catch (e) {
      firestore = getFirestore(firebaseApp);
    }

    cachedFirebase = { firebaseApp, firestore, auth, storage };
    return cachedFirebase;
  } catch (error) {
    console.error('[Firebase] Initialization Error:', error);
    return { firebaseApp: null, firestore: null, auth: null, storage: null };
  }
}

export * from './provider';
export * from './client-provider';
export * from './auth/use-user';
export * from './firestore/use-doc';
export * from './firestore/use-collection';
