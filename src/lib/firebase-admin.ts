import { getApps, initializeApp, cert, type App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

/**
 * @fileOverview Institutional Firebase Admin SDK Configuration
 * Hardened initialization with environment variable safety checks.
 */

function getServiceAccount() {
  const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_B64 || process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  
  if (!key) {
    console.warn("[Firebase-Admin] CRITICAL: No service account key found in environment. verifyIdToken will fail.");
    return null;
  }
  
  try {
    if (key.trim().startsWith('{')) {
      return JSON.parse(key);
    }
    const decoded = Buffer.from(key, 'base64').toString('utf-8');
    return JSON.parse(decoded);
  } catch (e) {
    console.error("[Firebase-Admin] ERROR: Failed to parse service account key. Check B64/JSON format.");
    return null;
  }
}

const serviceAccount = getServiceAccount();

// Initialize Firebase Admin only once
const adminApp: App = getApps().find(a => a.name === 'pf-admin') || initializeApp(
  serviceAccount ? { credential: cert(serviceAccount) } : {}, 
  'pf-admin'
);

export const adminDb = getFirestore(adminApp);
export const adminAuth = getAuth(adminApp);

export function getAdminDb() {
  return adminDb;
}

export function getAdminAuth() {
  return adminAuth;
}

export function getAdminServices() {
  return { db: adminDb, auth: adminAuth };
}
