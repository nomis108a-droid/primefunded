import { getApps, initializeApp, cert, type App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';

/**
 * @fileOverview Institutional Firebase Admin SDK Initializer
 * Ensures reliable administrative access using a global singleton to prevent initialization conflicts.
 * Optimized for both Production and Firebase Studio environments.
 */

interface AdminServices {
  app: App;
  db: ReturnType<typeof getFirestore>;
  auth: ReturnType<typeof getAuth>;
  rtdb: ReturnType<typeof getDatabase>;
}

declare global {
  var __admin_services: AdminServices | undefined;
}

/**
 * Initializes or retrieves the Admin SDK services as a stable singleton.
 */
function initAdmin(): AdminServices {
  // 1. Return cached services if available
  if (global.__admin_services) {
    return global.__admin_services;
  }

  // 2. Check for existing apps to prevent "already exists" errors
  const apps = getApps();
  let adminApp: App;

  if (apps.length > 0) {
    adminApp = apps[0];
  } else {
    // 3. Perform fresh initialization
    const b64Key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_B64;
    const databaseURL = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;

    let options: any = {
      databaseURL
    };

    // Use Service Account if available (bypasses Metadata Server timeouts)
    if (b64Key && b64Key.trim() !== '') {
      try {
        const decoded = Buffer.from(b64Key, 'base64').toString('utf-8');
        const serviceAccount = JSON.parse(decoded);
        
        if (serviceAccount.private_key) {
          serviceAccount.private_key = serviceAccount.private_key
            .replace(/\\n/g, '\n')
            .trim();
        }
        
        options.credential = cert(serviceAccount);
      } catch (e: any) {
        console.error("[Admin-Init] Service Account Key Parse Failure:", e.message);
      }
    }

    try {
      // In Studio/App Hosting, if credentials aren't provided explicitly,
      // initializeApp() with no credential key will attempt to use environment identity.
      adminApp = initializeApp(options);
    } catch (err: any) {
      console.error("[Admin-Init] CRITICAL ERROR: App initialization failed:", err.message);
      throw new Error(`Admin initialization failed: ${err.message}`);
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
