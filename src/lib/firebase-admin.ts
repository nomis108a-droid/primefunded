import { getApps, initializeApp, cert, applicationDefault, type App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';

/**
 * @fileOverview Institutional Firebase Admin SDK Configuration
 * Hardened for Production: Ensures reliable administrative access using a global singleton
 * to prevent initialization conflicts during server-side hot-reloads.
 * Prioritizes Service Account Keys to avoid metadata plugin token refresh issues.
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
  // 1. Return cached services if available (Singleton Pattern)
  if (global.__admin_services) return global.__admin_services;

  // 2. Check for existing apps to prevent "already exists" errors during HMR
  const apps = getApps();
  let adminApp: App;

  if (apps.length > 0) {
    adminApp = apps[0];
    console.log("[Admin-Init] Reusing existing Firebase Admin instance");
  } else {
    // 3. Perform fresh initialization
    const b64Key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_B64;
    const databaseURL = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;

    let credential;

    // PATH A: Use Explicit Service Account Key (Most reliable, avoids metadata lookup)
    if (b64Key && b64Key.trim() !== '') {
      try {
        const decoded = Buffer.from(b64Key, 'base64').toString('utf-8');
        const serviceAccount = JSON.parse(decoded);
        
        if (serviceAccount.private_key) {
          serviceAccount.private_key = serviceAccount.private_key
            .replace(/\\n/g, '\n')
            .trim();
        }
        
        credential = cert(serviceAccount);
        console.log(`[Admin-Init] Master session established via Service Account: ${serviceAccount.client_email}`);
      } catch (e: any) {
        console.error("[Admin-Init] FAILED: Service Account Key is malformed:", e.message);
      }
    }

    // PATH B: Fallback to Application Default Credentials (ADC)
    if (!credential) {
      console.log("[Admin-Init] Service Account Key missing. Falling back to Application Default Credentials.");
      credential = applicationDefault();
    }

    try {
      adminApp = initializeApp({
        credential,
        databaseURL
      });
    } catch (err: any) {
      console.error("[Admin-Init] CRITICAL: Admin SDK failed to start:", err.message);
      throw new Error(`Admin service initialization failed: ${err.message}`);
    }
  }

  // 4. Map services and cache globally
  global.__admin_services = {
    app: adminApp,
    db: getFirestore(adminApp),
    auth: getAuth(adminApp),
    rtdb: getDatabase(adminApp)
  };

  return global.__admin_services;
}

/**
 * Service Provider Getters
 * Standardized access points for the Administrative Terminal.
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
