
import { getApps, initializeApp, cert, type App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

/**
 * @fileOverview Institutional Firebase Admin SDK Configuration
 * Hardened PEM key parsing to handle environment variable mangling in cloud workstations.
 */

function getServiceAccount() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (projectId && clientEmail && privateKey) {
    // Robust parsing for PEM keys often mangled by environment variable transport
    const formattedKey = privateKey
      .replace(/\\n/g, '\n')      // Convert literal \n to real newlines
      .replace(/^"(.*)"$/, '$1') // Remove wrapping quotes if present
      .trim();

    return {
      projectId,
      clientEmail,
      privateKey: formattedKey,
    };
  }

  // Fallback to JSON/B64 patterns if individual fields are missing
  const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_B64 || process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  
  if (!key) {
    console.warn("[Firebase-Admin] WARNING: No explicit service account found. Falling back to default (ADC).");
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

/**
 * Initializes the Admin App with an explicit name 'pf-admin' to prevent
 * conflicts with other Firebase processes.
 */
function getAdminApp(): App {
  const existingApp = getApps().find(a => a.name === 'pf-admin');
  if (existingApp) return existingApp;

  if (serviceAccount) {
    try {
      return initializeApp({
        credential: cert(serviceAccount),
        projectId: serviceAccount.projectId
      }, 'pf-admin');
    } catch (err: any) {
      console.error("[Firebase-Admin] Initialization Failed:", err.message);
      // Fallback attempt with basic config
      return initializeApp({
        projectId: serviceAccount.projectId
      }, 'pf-admin');
    }
  }

  // Fallback to basic project config (ADC/Default)
  return initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  }, 'pf-admin');
}

/**
 * Singleton service getters
 */
export const getAdminDb = () => getFirestore(getAdminApp());
export const getAdminAuth = () => getAuth(getAdminApp());

export const adminDb = getAdminDb();
export const adminAuth = getAdminAuth();

export function getAdminServices() {
  return { db: getAdminDb(), auth: getAdminAuth() };
}
