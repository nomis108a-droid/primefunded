import { getApps, initializeApp, cert, type App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

/**
 * @fileOverview Centralized Firebase Admin SDK Initialization
 * Ensures a single instance of the Admin SDK is used across all server-side routes.
 */

const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

function getAdminApp(): App {
  const existingApps = getApps();
  const adminApp = existingApps.find(app => app.name === 'pf-admin');
  if (adminApp) return adminApp;

  if (!serviceAccountKey) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY is missing from environment variables.');
  }

  try {
    const serviceAccount = JSON.parse(
      serviceAccountKey.startsWith("'") 
        ? serviceAccountKey.slice(1, -1) 
        : serviceAccountKey
    );
    
    return initializeApp({
      credential: cert(serviceAccount),
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
    }, 'pf-admin');
  } catch (e: any) {
    throw new Error(`Admin SDK Config Error: ${e.message}`);
  }
}

export const adminApp = getAdminApp();
export const adminDb = getFirestore(adminApp);
export const adminAuth = getAuth(adminApp);
