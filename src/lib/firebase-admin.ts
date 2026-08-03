import {
  applicationDefault,
  cert,
  getApp,
  getApps,
  initializeApp,
  type App,
  type ServiceAccount,
} from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';

/**
 * @fileOverview Institutional Firebase Admin SDK Initializer
 * Optimized singleton pattern to resolve "Invalid Firebase app options" errors.
 * Supports Base64 keys, individual variables, and Application Default Credentials.
 */

function credentialFromBase64() {
  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_B64?.trim();

  if (!encoded || encoded === 'PASTE_YOUR_LONG_BASE64_STRING_HERE') {
    return null;
  }

  try {
    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    const parsed = JSON.parse(decoded);

    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
      throw new Error('Firebase service account configuration is incomplete.');
    }

    return cert({
      projectId: parsed.project_id,
      clientEmail: parsed.client_email,
      privateKey: parsed.private_key.replace(/\\n/g, '\n'),
    });
  } catch (e: any) {
    console.error('[Admin-Init] Base64 Parse Failed:', e.message);
    return null;
  }
}

function getAdminCredential() {
  // 1. Priority: Base64 Service Account
  const b64 = credentialFromBase64();
  if (b64) return b64;

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

  // 3. Fallback: Application Default (Standard for App Hosting)
  return applicationDefault();
}

/**
 * Retrieves the singleton Firebase Admin App instance.
 * Removed dynamic naming to prevent instance multiplication and invalid options errors.
 */
export function getAdminApp(): App {
  const apps = getApps();
  if (apps.length > 0) {
    return getApp();
  }

  return initializeApp({
    credential: getAdminCredential(),
    projectId: process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  });
}

// Singleton instances for easy export
const adminApp = getAdminApp();

export const adminDb = getFirestore(adminApp);
export const adminAuth = getAuth(adminApp);
export const adminRtdb = getDatabase(adminApp);

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
