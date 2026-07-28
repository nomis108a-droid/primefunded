import { getApps, initializeApp, cert, applicationDefault, type App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';

/**
 * @fileOverview Institutional Firebase Admin SDK Initializer
 * Hardened for Production: Ensures reliable administrative access using a global singleton
 * to prevent initialization conflicts. Prioritizes Service Account Keys to avoid 
 * metadata plugin token refresh timeouts in non-GCP environments.
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
 * Initializes or retrieves the Admin SDK services as a stable singleton.
 */
function initAdmin(): AdminServices {
  // 1. Return cached services if available
  if (global.__admin_services) return global.__admin_services;

  // 2. Check for existing apps to prevent "already exists" errors
  const apps = getApps();
  let adminApp: App;

  if (apps.length > 0) {
    adminApp = apps[0];
    console.log("[Admin-Init] Reusing existing administrative context");
  } else {
    // 3. Perform fresh initialization
    const b64Key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_B64;
    const databaseURL = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;

    let credential;

    // PATH A: Use Explicit Service Account Key (Bypasses Metadata Server lookup)
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
        console.log(`[Admin-Init] Master session established via Service Account Key`);
      } catch (e: any) {
        console.error("[Admin-Init] FAILED: Service Account Key is malformed:", e.message);
      }
    }

    // PATH B: Fallback to Application Default Credentials ONLY in recognized GCP environments
    if (!credential) {
      const isGCP = !!(process.env.GCP_PROJECT || process.env.K_SERVICE || process.env.FIREBASE_CONFIG || process.env.GOOGLE_CLOUD_PROJECT);
      if (isGCP) {
        try {
          credential = applicationDefault();
          console.log("[Admin-Init] Detected GCP environment, using Application Default Credentials");
        } catch (e: any) {
          console.error("[Admin-Init] ADC lookup failed:", e.message);
        }
      } else {
        console.warn("[Admin-Init] Local development detected. Metadata lookup bypassed to prevent timeout.");
      }
    }

    if (!credential) {
      throw new Error('Administrative services initialization failed: No valid credentials provided.');
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
 */
export const getAdminDb = () => initAdmin().db;
export const getAdminAuth = () => initAdmin().auth;
export const getAdminRtdb = () => initAdmin().rtdb;
export const getAdminServices = () => initAdmin();

export const isFirebaseAdminConfigured = () => {
  try {
    initAdmin();
    return true;
  } catch (e) {
    return false;
  }
};
