import { getApps, initializeApp, cert, type App, credential } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

/**
 * @fileOverview Institutional Firebase Admin SDK Configuration
 * Hardened for both Local Development (Firebase Studio) and Production (App Hosting).
 * Supports explicit Service Account via Base64 or built-in Application Default Credentials.
 */

function getAdminApp(): App {
  const existingApp = getApps().find(a => a.name === 'pf-admin');
  if (existingApp) return existingApp;

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;

  // 1. Check for Base64 Service Account (Used in local .env or Vercel)
  const b64Key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_B64;
  if (b64Key) {
    try {
      const decoded = Buffer.from(b64Key, 'base64').toString('utf-8');
      const json = JSON.parse(decoded);
      
      // Robust PEM newline normalization
      if (json.private_key) {
        json.private_key = json.private_key
          .replace(/\\n/g, '\n')
          .replace(/"/g, '')
          .trim();
      }

      console.log(`[Firebase-Admin] Initializing with explicit Service Account: ${json.client_email}`);
      return initializeApp({
        credential: cert(json),
        projectId: json.project_id || projectId
      }, 'pf-admin');
    } catch (e: any) {
      console.warn("[Firebase-Admin] Base64 Parse Failed, falling back to ADC...");
    }
  }

  // 2. Fallback: Use Application Default Credentials (ADC)
  // Required for Firebase Studio (Cloud Workstations) and Firebase App Hosting.
  try {
    console.log(`[Firebase-Admin] Authenticating with ADC for Project: ${projectId}`);
    
    return initializeApp({
      credential: credential.applicationDefault(),
      projectId: projectId
    }, 'pf-admin');
  } catch (err: any) {
    console.error("[Firebase-Admin] FATAL: Authentication configuration missing.");
    console.error("ACTION REQUIRED: If in Studio, run 'gcloud auth application-default login --no-launch-browser' in the terminal.");
    
    // Emergency minimal initialization to prevent boot-time crash
    return initializeApp({
      projectId: projectId
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
