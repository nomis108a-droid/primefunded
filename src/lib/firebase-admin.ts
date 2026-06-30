import { getApps, initializeApp, cert, type App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

/**
 * @fileOverview Institutional Firebase Admin SDK Configuration
 * Hardened initialization with environment variable safety checks and Studio-resilience.
 */

function getServiceAccount() {
  const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_B64 || process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  
  if (!key) {
    console.warn("[Firebase-Admin] WARNING: No service account key found in environment. The SDK will attempt to use default credentials.");
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
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;

// Initialize Firebase Admin with pf-admin name to prevent conflicts
function getAdminApp(): App {
  const existingApp = getApps().find(a => a.name === 'pf-admin');
  if (existingApp) return existingApp;

  return initializeApp(
    serviceAccount 
      ? { credential: cert(serviceAccount), projectId } 
      : { projectId }, 
    'pf-admin'
  );
}

/**
 * Ensures singleton instances of services
 */
export const getAdminDb = () => getFirestore(getAdminApp());
export const getAdminAuth = () => getAuth(getAdminApp());

// Re-export for convenience but recommend using getters
export const adminDb = getAdminDb();
export const adminAuth = getAdminAuth();

export function getAdminServices() {
  return { db: getAdminDb(), auth: getAdminAuth() };
}
