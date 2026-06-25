import { getApps, initializeApp, cert, type App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

/**
 * @fileOverview Centralized Firebase Admin SDK Initialization
 * Ensures a single instance of the Admin SDK is used across all server-side routes.
 */

function getAdminApp(): App {
  const existingApps = getApps();
  const adminApp = existingApps.find(app => app.name === 'pf-admin');
  if (adminApp) return adminApp;

  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!serviceAccountKey) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY is missing from environment variables.');
  }

  let serviceAccount;
  try {
    const cleaned = serviceAccountKey.replace(/^['"]|['"]$/g, '').trim();
    serviceAccount = JSON.parse(cleaned);
  } catch (e) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY is not valid JSON. Check your .env file.');
  }

  try {
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
