import { getApps, initializeApp, cert, type App, credential } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

/**
 * @fileOverview Institutional Firebase Admin SDK Configuration
 * Optimized for Firebase App Hosting using Application Default Credentials (ADC).
 * Includes robust Base64 fallback for local/Studio development.
 */

function getAdminApp(): App {
  const existingApp = getApps().find(a => a.name === 'pf-admin');
  if (existingApp) return existingApp;

  // 1. Check for Base64 Service Account (Priority for Studio/Dev)
  const b64Key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_B64;
  if (b64Key) {
    try {
      const decoded = Buffer.from(b64Key, 'base64').toString('utf-8');
      const json = JSON.parse(decoded);
      if (json.private_key) {
        json.private_key = json.private_key.replace(/\\n/g, '\n').trim();
      }
      return initializeApp({
        credential: cert(json),
        projectId: json.project_id || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
      }, 'pf-admin');
    } catch (e: any) {
      console.error("[Firebase-Admin] Base64 Parse Failed, falling back to ADC...", e.message);
    }
  }

  // 2. Production: Use Application Default Credentials (ADC)
  // This is handled automatically by Firebase App Hosting and Cloud Run.
  try {
    return initializeApp({
      credential: credential.applicationDefault(),
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID
    }, 'pf-admin');
  } catch (err: any) {
    console.warn("[Firebase-Admin] ADC Initialization Failed. Features requiring Admin SDK may fail if credentials aren't set.");
    // Emergency Fallback to public ID
    return initializeApp({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
    }, 'pf-admin');
  }
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
