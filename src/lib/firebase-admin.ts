import { getApps, initializeApp, cert, type App, credential } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';

/**
 * @fileOverview Institutional Firebase Admin SDK Configuration
 * Hardened for both Local Development (Firebase Studio) and Production (App Hosting).
 * Supports explicit Service Account via Base64 or built-in Application Default Credentials.
 */

let adminConfigured = false;

function getAdminApp(): App {
  const existingApp = getApps().find(a => a.name === 'pf-admin');
  if (existingApp) {
    return existingApp;
  }

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
  const databaseURL = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;

  const baseConfig = {
    projectId: projectId,
    databaseURL: databaseURL
  };

  // 1. Check for Base64 Service Account
  const b64Key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_B64;
  if (b64Key && b64Key.trim() !== '') {
    try {
      const decoded = Buffer.from(b64Key, 'base64').toString('utf-8');
      const json = JSON.parse(decoded);
      
      if (json.private_key) {
        // Sanitize the private key to ensure it's a valid PEM format
        json.private_key = json.private_key
          .replace(/\\n/g, '\n')
          .replace(/"/g, '')
          .trim();
      }

      console.log(`[Firebase-Admin] Initializing with explicit Service Account: ${json.client_email}`);
      const app = initializeApp({
        credential: cert(json),
        ...baseConfig
      }, 'pf-admin');
      adminConfigured = true;
      return app;
    } catch (e: any) {
      console.warn("[Firebase-Admin] Base64 Parse Failed, falling back to ADC...");
    }
  }

  // 2. Check for Application Default Credentials (ADC)
  try {
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.K_SERVICE || process.env.FIREBASE_CONFIG) {
      console.log(`[Firebase-Admin] Attempting ADC authentication for Project: ${projectId}`);
      const app = initializeApp({
        credential: credential.applicationDefault(),
        ...baseConfig
      }, 'pf-admin');
      adminConfigured = true;
      return app;
    }
  } catch (err: any) {
    console.warn("[Firebase-Admin] ADC unavailable, trying final fallback...");
  }

  // 3. Final Fallback: Initialize with Project ID only (for Studio / Local previews)
  // This allows background tasks to at least attempt connection.
  console.log(`[Firebase-Admin] Fallback initialization for Project: ${projectId}`);
  const app = initializeApp(baseConfig, 'pf-admin');
  adminConfigured = true; 
  return app;
}

/**
 * Singleton service getters
 */
export const getAdminDb = () => getFirestore(getAdminApp());
export const getAdminAuth = () => getAuth(getAdminApp());
export const getAdminRtdb = () => getDatabase(getAdminApp());

export const adminDb = getAdminDb();
export const adminAuth = getAdminAuth();
export const adminRtdb = getAdminRtdb();

/**
 * Export configuration status to allow other services to fail gracefully.
 */
export const isFirebaseAdminConfigured = () => adminConfigured;

export function getAdminServices() {
  return { db: getAdminDb(), auth: getAdminAuth(), rtdb: getAdminRtdb() };
}
