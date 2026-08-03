import { getApps, initializeApp, cert, type App, applicationDefault, getApp, type ServiceAccount } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';

/**
 * @fileOverview Institutional Firebase Admin SDK Initializer
 * Optimized singleton pattern to resolve "Invalid Firebase app options" errors.
 * Supports Base64 keys, individual variables, and Application Default Credentials.
 */

function getAdminCredential() {
  // 1. Priority: Base64 Service Account
  const b64Key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_B64;
  if (b64Key && b64Key.trim() !== '') {
    try {
      const decoded = JSON.parse(Buffer.from(b64Key, 'base64').toString('utf-8'));
      if (decoded.private_key) {
        decoded.private_key = decoded.private_key.replace(/\\n/g, '\n').trim();
      }
      return cert(decoded);
    } catch (e: any) {
      console.error("[Admin-Init] B64 Parse Failed:", e.message);
    }
  }

  // 2. Secondary: Discrete Environment Variables
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/^["']|["']$/g, '').replace(/\\n/g, '\n');

  if (projectId && clientEmail && privateKey) {
    const serviceAccount: ServiceAccount = {
      projectId,
      clientEmail,
      privateKey,
    };
    return cert(serviceAccount);
  }

  // 3. Fallback: Application Default (Standard for GCP / App Hosting)
  try {
    return applicationDefault();
  } catch (e) {
    return null;
  }
}

/**
 * Retrieves the singleton Firebase Admin App instance.
 * Removed dynamic naming (Date.now()) to prevent instance multiplication and invalid options errors.
 */
export function getAdminApp(): App {
  const apps = getApps();
  if (apps.length > 0) {
    // Return the default app or the first available one
    return apps[0];
  }

  const credential = getAdminCredential();
  if (!credential) {
    // This state usually happens in local dev without service account env vars
    throw new Error("Firebase Admin Credential resolution failed. Ensure FIREBASE_SERVICE_ACCOUNT_KEY_B64 or individual ENV variables are set.");
  }

  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  return initializeApp({
    credential,
    projectId,
    databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  });
}

/**
 * Synchronized Service Getters
 * These functions ensure consistent singleton access across the entire server runtime.
 */
export const getAdminDb = () => getFirestore(getAdminApp());
export const getAdminAuth = () => getAuth(getAdminApp());
export const getAdminRtdb = () => getDatabase(getAdminApp());

/**
 * Returns all admin services in a single context object.
 * Used for complex server-side transactions.
 */
export const getAdminServices = () => {
  try {
    const app = getAdminApp();
    return {
      app,
      db: getFirestore(app),
      auth: getAuth(app),
      rtdb: getDatabase(app)
    };
  } catch (e) {
    console.warn("[Admin-Init] Services unavailable:", (e as Error).message);
    return null;
  }
};

/**
 * Verification helper for background tasks.
 */
export const isFirebaseAdminConfigured = () => {
  try {
    getAdminApp();
    return true;
  } catch (e) {
    return false;
  }
};
