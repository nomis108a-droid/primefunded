import { getApps, initializeApp, cert, type App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';

/**
 * @fileOverview Institutional Firebase Admin SDK Initializer
 * Hardened to resolve Project ID (aud) mismatch and ensure singleton reliability.
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
 * Initializes or retrieves the Admin SDK services.
 * Strictly enforces Project ID synchronization between Client and Server.
 */
function initAdmin(): AdminServices {
  if (global.__admin_services) {
    return global.__admin_services;
  }

  const apps = getApps();
  let adminApp: App;

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const databaseURL = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;

  if (apps.length > 0) {
    adminApp = apps[0];
    // Audit check for existing apps
    if (adminApp.options.projectId !== projectId) {
      console.warn(`[Admin-Init] WARNING: Existing app project ID (${adminApp.options.projectId}) mismatch with environment (${projectId}).`);
    }
  } else {
    console.log('[Admin-Init] Constructing Administrative instance...');
    console.log('[Admin-Init] Target Project Identity:', projectId);

    const b64Key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_B64;

    let options: any = {
      projectId,
      databaseURL
    };

    if (b64Key && b64Key.trim() !== '') {
      try {
        const decoded = Buffer.from(b64Key, 'base64').toString('utf-8');
        const serviceAccount = JSON.parse(decoded);
        
        // Safety: ensure the service account project matches our target
        if (serviceAccount.project_id && serviceAccount.project_id !== projectId) {
          console.warn(`[Admin-Init] CRITICAL: Service account project (${serviceAccount.project_id}) differs from environment (${projectId}). Overriding with environment.`);
        }

        if (serviceAccount.private_key) {
          serviceAccount.private_key = serviceAccount.private_key
            .replace(/\\n/g, '\n')
            .trim();
        }
        
        options.credential = cert(serviceAccount);
        console.log('[Admin-Init] Authentication: Service Account Key (Authorized)');
      } catch (e: any) {
        console.error("[Admin-Init] Service Account Parse Failure:", e.message);
        throw new Error(`Admin credentials invalid: ${e.message}`);
      }
    } else {
      console.log('[Admin-Init] Authentication: Application Default Credentials (ADC)');
    }

    try {
      adminApp = initializeApp(options);
      console.log('[Admin-Init] Success: Admin SDK bound to project:', adminApp.options.projectId);
    } catch (err: any) {
      console.error("[Admin-Init] Initialization Fault:", err.message);
      throw new Error(`Admin initialization failed: ${err.message}`);
    }
  }

  global.__admin_services = {
    app: adminApp,
    db: getFirestore(adminApp),
    auth: getAuth(adminApp),
    rtdb: getDatabase(adminApp)
  };

  return global.__admin_services;
}

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
