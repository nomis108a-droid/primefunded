'use client';
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { 
  initializeFirestore, 
  getFirestore,
  type Firestore, 
  memoryLocalCache,
} from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import { getDatabase, type Database } from 'firebase/database';
import { firebaseConfig } from './config';

let firebaseApp: FirebaseApp;
let firestoreInstance: Firestore;
let authInstance: Auth;
let storageInstance: FirebaseStorage;
let rtdbInstance: Database;

let isInitializing = false;

/**
 * Initializes the Firebase Client SDK instances.
 * Hardened to log project identity for administrative audit.
 */
export function initializeFirebase() {
  if (isInitializing) {
    return {
      firebaseApp,
      firestore: firestoreInstance,
      auth: authInstance,
      storage: storageInstance,
      rtdb: rtdbInstance,
    };
  }

  isInitializing = true;

  try {
    if (!firebaseApp) {
      firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
      
      // FIREBASE IDENTITY AUDIT
      console.log('==========================================');
      console.log('   FIREBASE IDENTITY AUDIT (CLIENT)       ');
      console.log('==========================================');
      console.log('Active Project ID:', firebaseApp.options.projectId);
      console.log('App Name:         ', firebaseApp.name);
      console.log('Auth Domain:      ', firebaseApp.options.authDomain);
      console.log('Storage Bucket:   ', firebaseApp.options.storageBucket);
      
      const isEmulator = typeof window !== 'undefined' && (window.location.hostname === 'localhost' && !!process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST);
      if (isEmulator) {
        console.warn('⚠️ WARNING: TERMINAL IS CONNECTED TO LOCAL EMULATOR');
      } else {
        console.log('✅ STATUS: CONNECTED TO PRODUCTION DATASET');
      }
      console.log('==========================================');
    }
    
    if (!authInstance) authInstance = getAuth(firebaseApp);
    if (!storageInstance) storageInstance = getStorage(firebaseApp);
    if (!rtdbInstance) rtdbInstance = getDatabase(firebaseApp);
    
    if (!firestoreInstance) {
      try {
        firestoreInstance = initializeFirestore(firebaseApp, {
          localCache: memoryLocalCache(),
        });
      } catch (e) {
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
  } finally {
    isInitializing = false;
  }
}

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

export * from './provider';
export * from './client-provider';
export * from './auth/use-user';
export * from './firestore/use-doc';
export * from './firestore/use-collection';
