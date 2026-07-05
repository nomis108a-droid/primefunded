'use client';
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import { firebaseConfig } from './config';

let firebaseApp: FirebaseApp;
let firestoreInstance: Firestore;
let authInstance: Auth;
let storageInstance: FirebaseStorage;

/**
 * Initializes the Firebase Client SDK instances using a simplified singleton pattern.
 * This resolves "FIRESTORE INTERNAL ASSERTION FAILED" errors by ensuring
 * Firestore is only initialized once with stable default settings.
 */
export function initializeFirebase() {
  if (!firebaseApp) {
    firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
  }
  if (!authInstance) authInstance = getAuth(firebaseApp);
  if (!storageInstance) storageInstance = getStorage(firebaseApp);
  if (!firestoreInstance) firestoreInstance = getFirestore(firebaseApp);
  
  return {
    firebaseApp,
    firestore: firestoreInstance,
    auth: authInstance,
    storage: storageInstance,
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

// Barrel exports to maintain application-wide compatibility
export * from './provider';
export * from './client-provider';
export * from './auth/use-user';
export * from './firestore/use-doc';
export * from './firestore/use-collection';
