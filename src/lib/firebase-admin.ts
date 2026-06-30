
import { getApps, initializeApp, cert, type App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

/**
 * @fileOverview Institutional Firebase Admin SDK Configuration
 * Switched to explicit service account credentials to resolve metadata discovery errors
 * in cloud workstation environments.
 */

function getServiceAccount() {
  // 1. Check for individual credential fields (Recommended for Studio/Workstations)
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (projectId && clientEmail && privateKey) {
    return {
      projectId,
      clientEmail,
      // Handle newline escaping in environment variables
      privateKey: privateKey.replace(/\\n/g, '\n'),
    };
  }

  // 2. Fallback to existing JSON/B64 patterns
  const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_B64 || process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  
  if (!key) {
    console.warn("[Firebase-Admin] WARNING: No explicit service account found. Falling back to default (ADC) which may fail in this environment.");
    return null;
  }
  
  try {
    if (key.trim().startsWith('{')) {
      return JSON.parse(key);
    }
    const decoded = Buffer.from(key, 'base64').toString('utf-8');
    return JSON.parse(decoded);
  } catch (e) {
    console.error("[Firebase-Admin] ERROR: Failed to parse service account key string.");
    return null;
  }
}

const serviceAccount = getServiceAccount();

// Initialize Firebase Admin with pf-admin name to prevent conflicts
function getAdminApp(): App {
  const existingApp = getApps().find(a => a.name === 'pf-admin');
  if (existingApp) return existingApp;

  // If we have a service account object, use cert()
  if (serviceAccount) {
    return initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.projectId
    }, 'pf-admin');
  }

  // Fallback to basic project config (Default Credentials / ADC)
  return initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  }, 'pf-admin');
}

/**
 * Ensures singleton instances of services
 */
export const getAdminDb = () => getFirestore(getAdminApp());
export const getAdminAuth = () => getAuth(getAdminApp());

// Re-export for convenience
export const adminDb = getAdminDb();
export const adminAuth = getAdminAuth();

export function getAdminServices() {
  return { db: getAdminDb(), auth: getAdminAuth() };
}
