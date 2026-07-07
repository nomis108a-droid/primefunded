import { getApps, initializeApp, cert, type App, credential } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';

/**
 * @fileOverview Institutional Firebase Admin SDK Configuration
 * Hardened for both Local Development (Firebase Studio) and Production (App Hosting).
 * Supports explicit Service Account via Base64 or built-in Application Default Credentials.
 */

let adminApp: App | null = null;
let adminConfigured = false;

function getAdminApp(): App | null {
  if (adminApp) return adminApp;

  // Check if already initialized by another module
  const existingApp = getApps().find(a => a.name === 'pf-admin');
  if (existingApp) {
    adminApp = existingApp;
    adminConfigured = true;
    return adminApp;
  }

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
  const databaseURL = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;

  if (!projectId) {
    console.warn("[Firebase-Admin] WARNING: Project ID missing. Admin SDK limited.");
    return null;
  }

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
        json.private_key = json.private_key
          .replace(/\\n/g, '\n')
          .replace(/"/g, '')
          .trim();
      }

      console.log(`[Firebase-Admin] Initializing with explicit Service Account: ${json.client_email}`);
      adminApp = initializeApp({
        credential: cert(json),
        ...baseConfig
      }, 'pf-admin');
      adminConfigured = true;
      return adminApp;
    } catch (e: any) {
      console.warn("[Firebase-Admin] Base64 Parse Failed, falling back to ADC...");
    }
  }

  // 2. Check for Application Default Credentials (ADC) or Environment built-ins
  try {
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.K_SERVICE || process.env.FIREBASE_CONFIG) {
      console.log(`[Firebase-Admin] Attempting ADC authentication for Project: ${projectId}`);
      adminApp = initializeApp({
        credential: credential.applicationDefault(),
        ...baseConfig
      }, 'pf-admin');
      adminConfigured = true;
      return adminApp;
    }
  } catch (err: any) {
    console.warn("[Firebase-Admin] ADC unavailable, trying final fallback...");
  }

  // 3. Final Fallback: Initialize with Project ID only (for Studio / Local previews)
  try {
    console.log(`[Firebase-Admin] Fallback initialization for Project: ${projectId}`);
    adminApp = initializeApp(baseConfig, 'pf-admin');
    adminConfigured = true; 
    return adminApp;
  } catch (e) {
    console.error("[Firebase-Admin] FATAL: Initialization failed even with fallback.");
    return null;
  }
}

/**
 * Singleton service getters
 */
export const getAdminDb = () => {
  const app = getAdminApp();
  if (!app) return null;
  try {
    return getFirestore(app);
  } catch (e) {
    return null;
  }
};

export const getAdminAuth = () => {
  const app = getAdminApp();
  if (!app) return null;
  try {
    return getAuth(app);
  } catch (e) {
    return null;
  }
};

export const getAdminRtdb = () => {
  const app = getAdminApp();
  if (!app) return null;
  try {
    return getDatabase(app);
  } catch (e) {
    return null;
  }
};

/**
 * Export configuration status to allow other services to fail gracefully.
 */
export const isFirebaseAdminConfigured = () => adminConfigured;

export function getAdminServices() {
  const app = getAdminApp();
  if (!app) return null;
  try {
    return { 
      db: getFirestore(app), 
      auth: getAuth(app), 
      rtdb: getDatabase(app) 
    };
  } catch (e) {
    console.warn("[Firebase-Admin] Failed to retrieve services from app instance.");
    return null;
  }
}