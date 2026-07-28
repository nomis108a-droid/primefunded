import { getApps, initializeApp, cert, type App, credential } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';

/**
 * @fileOverview Institutional Firebase Admin SDK Configuration
 * Hardened for Production: Ensures reliable administrative access using a global singleton
 * to prevent initialization conflicts during server-side hot-reloads.
 * Supports both Base64 service account keys and Application Default Credentials.
 */

interface AdminServices {
  app: App;
  db: ReturnType<typeof getFirestore>;
  auth: ReturnType<typeof getAuth>;
  rtdb: ReturnType<typeof getDatabase>;
}

// Global variable to persist admin services across HMR and requests
declare global {
  var __admin_services: AdminServices | undefined;
}

/**
 * Initializes or retrieves the Admin SDK services.
 * Throws a descriptive error if initialization is impossible.
 */
function initAdmin(): AdminServices {
  if (global.__admin_services) return global.__admin_services;

  const apps = getApps();
  if (apps.length > 0) {
    const adminApp = apps[0];
    global.__admin_services = {
      app: adminApp,
      db: getFirestore(adminApp),
      auth: getAuth(adminApp),
      rtdb: getDatabase(adminApp)
    };
    return global.__admin_services;
  }

  // Configuration Resolve
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'studio-8383940162-6976e';
  const b64Key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_B64;
  const databaseURL = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;

  let config: any = {
    projectId,
    databaseURL
  };

  // 1. Attempt to use provided Service Account Key
  if (b64Key && b64Key.trim() !== '') {
    try {
      const decoded = Buffer.from(b64Key, 'base64').toString('utf-8');
      const serviceAccount = JSON.parse(decoded);
      
      if (serviceAccount.private_key) {
        serviceAccount.private_key = serviceAccount.private_key
          .replace(/\\n/g, '\n')
          .trim();
      }
      
      config.credential = cert(serviceAccount);
      console.log(`[Admin-Init] Establishing Master session via Service Account: ${serviceAccount.client_email}`);
    } catch (e: any) {
      console.error("[Admin-Init] Failed to parse B64 Service Account key:", e.message);
    }
  }

  // 2. Fallback to Application Default Credentials (critical for GCP/App Hosting)
  if (!config.credential) {
    console.log("[Admin-Init] No Service Account key provided. Falling back to Application Default Credentials.");
    config.credential = credential.applicationDefault();
  }

  try {
    const adminApp = initializeApp(config);

    global.__admin_services = {
      app: adminApp,
      db: getFirestore(adminApp),
      auth: getAuth(adminApp),
      rtdb: getDatabase(adminApp)
    };

    return global.__admin_services;
  } catch (err: any) {
    console.error("[Admin-Init] CRITICAL INITIALIZATION FAILURE:", err.message);
    throw new Error(`Admin service initialization failed: ${err.message}`);
  }
}

/**
 * Service Provider Getters
 * These will throw descriptive errors if the Admin SDK is not properly configured.
 */
export const getAdminDb = () => initAdmin().db;
export const getAdminAuth = () => initAdmin().auth;
export const getAdminRtdb = () => initAdmin().rtdb;

export function getAdminServices() {
  try {
    return initAdmin();
  } catch (e) {
    return null;
  }
}

export const isFirebaseAdminConfigured = () => {
  try {
    initAdmin();
    return true;
  } catch (e) {
    return false;
  }
};
