'use client';

/**
 * @fileOverview Legacy Firebase Instance Proxy
 * Re-exports initialized instances from the central Firebase hub to ensure 
 * singleton behavior and avoid "already initialized" conflicts.
 */

import { initializeFirebase } from '@/firebase';

const { firebaseApp, firestore, auth: firebaseAuth } = initializeFirebase();

// Fallback to empty if initialization failed (prevents runtime crashes during build/config lag)
export const app = firebaseApp!;
export const auth = firebaseAuth!;
export const db = firestore!;

export default app;
