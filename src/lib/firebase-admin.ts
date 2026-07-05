import { getApps, initializeApp, cert, type App, credential } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

/**
 * @fileOverview Institutional Firebase Admin SDK Configuration
 * Hardened for both Local Development (Firebase Studio) and Production (App Hosting).
 * Supports explicit Service Account via Base64 or built-in Application Default Credentials.
 */

let adminConfigured = false;

function getAdminApp(): App {
  const existingApp = getApps().find(a => a.name === 'pf-admin');
  if (existingApp) {
    // If it was already initialized with a projectId but no credentials, 
    // we might need to re-check if we can actually use it.
    return existingApp;
  }

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;

  // 1. Check for Base64 Service Account (Used in local .env or Vercel)
  const b64Key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_B64;
  if (b64Key && b64Key.trim() !== '') {
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
      const app = initializeApp({
        credential: cert(json),
        projectId: json.project_id || projectId
      }, 'pf-admin');
      adminConfigured = true;
      return app;
    } catch (e: any) {
      console.warn("[Firebase-Admin] Base64 Parse Failed, falling back to ADC...");
    }
  }

  // 2. Fallback: Use Application Default Credentials (ADC)
  // Required for Firebase Studio (Cloud Workstations) and Firebase App Hosting.
  try {
    // Check if we are in an environment that likely has ADC (GCP) or explicit env var
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.K_SERVICE || process.env.FIREBASE_CONFIG) {
      console.log(`[Firebase-Admin] Attempting ADC authentication for Project: ${projectId}`);
      const app = initializeApp({
        credential: credential.applicationDefault(),
        projectId: projectId
      }, 'pf-admin');
      adminConfigured = true;
      return app;
    }
    throw new Error("No credential environment variables found.");
  } catch (err: any) {
    console.warn("[Firebase-Admin] Authentication configuration missing or ADC unavailable.");
    
    // Minimal initialization to prevent immediate boot-time crash, 
    // but adminConfigured stays false.
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

/**
 * Export configuration status to allow other services to fail gracefully.
 */
export const isFirebaseAdminConfigured = () => adminConfigured;

export function getAdminServices() {
  return { db: getAdminDb(), auth: getAdminAuth() };
}
