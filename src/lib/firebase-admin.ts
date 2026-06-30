import { getApps, initializeApp, cert, type App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

/**
 * @fileOverview Institutional Firebase Admin SDK Configuration
 * Hardened to handle Base64-encoded JSON blobs for maximum portability
 * and resistance to environment variable mangling.
 */

function getServiceAccount() {
  // 1. Primary Strategy: Base64 JSON Blob (The most robust method)
  const b64Key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_B64;
  if (b64Key) {
    try {
      const decoded = Buffer.from(b64Key, 'base64').toString('utf-8');
      const json = JSON.parse(decoded);
      
      // PEM keys need real newlines. Handle double-escaped or literal \n characters.
      if (json.private_key) {
        let key = json.private_key;
        
        // Remove literal "\n" strings and ensure real newlines
        key = key.replace(/\\n/g, '\n');
        
        // Strip any accidental wrapping quotes
        key = key.trim().replace(/^"/, '').replace(/"$/, '');
        
        // Re-assign sanitized key
        json.private_key = key;
      }
      
      return json;
    } catch (e: any) {
      console.error("[Firebase-Admin] FATAL: Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY_B64.", e.message);
    }
  }

  // 2. Secondary Strategy: Individual PEM Variables (Fallback)
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (projectId && clientEmail && privateKey) {
    const formattedKey = privateKey
      .replace(/\\n/g, '\n')
      .replace(/^"(.*)"$/, '$1')
      .trim();

    return {
      projectId,
      clientEmail,
      privateKey: formattedKey,
    };
  }

  console.warn("[Firebase-Admin] WARNING: No valid service account found. Administrative features may fail.");
  return null;
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
      return initializeApp({
        projectId: serviceAccount?.projectId || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
      }, 'pf-admin');
    }
  }

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
