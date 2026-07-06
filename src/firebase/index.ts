'use client';
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { 
  initializeFirestore, 
  getFirestore,
  type Firestore, 
  memoryLocalCache 
} from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import { getDatabase, type Database } from 'firebase/database';
import { firebaseConfig } from './config';

let firebaseApp: FirebaseApp;
let firestoreInstance: Firestore;
let authInstance: Auth;
let storageInstance: FirebaseStorage;
let rtdbInstance: Database;

/**
 * Initializes the Firebase Client SDK instances using a simplified singleton pattern.
 * This resolves "FIRESTORE INTERNAL ASSERTION FAILED" errors by ensuring
 * Firestore is initialized idempotently with memory-based caching.
 */
export function initializeFirebase() {
  if (!firebaseApp) {
    firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
  }
  
  if (!authInstance) authInstance = getAuth(firebaseApp);
  if (!storageInstance) storageInstance = getStorage(firebaseApp);
  if (!rtdbInstance) rtdbInstance = getDatabase(firebaseApp);
  
  if (!firestoreInstance) {
    try {
      // Explicitly using memoryLocalCache prevents conflicting states in IndexedDB
      // that lead to the 'Unexpected state' assertion failure during hot-reloading.
      firestoreInstance = initializeFirestore(firebaseApp, {
        localCache: memoryLocalCache(),
      });
    } catch (e) {
      // If already initialized (common in HMR), retrieve the existing instance.
      firestoreInstance = getFirestore(firebaseApp);
    }
  }
  
  return {
    firebaseApp,
    firestore: firestoreInstance,
    auth: authInstance,
    storage: storageInstance,
    rtdb: rtdbInstance,
  };
}

/**
 * Direct instance getters for use outside of React Context when necessary.
 */
export function useFirestore(): Firestore {
  if (!firestoreInstance) initializeFirebase();
  return firestoreInstance;
}

export function useAuth(): Auth {
  if (!authInstance) initializeFirebase();
  return authInstance;
}

export function useRtdb(): Database {
  if (!rtdbInstance) initializeFirebase();
  return rtdbInstance;
}

// Barrel exports to maintain application-wide compatibility
export * from './provider';
export * from './client-provider';
export * from './auth/use-user';
export * from './firestore/use-doc';
export * from './firestore/use-collection';
