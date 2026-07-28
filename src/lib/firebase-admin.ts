import { getApps, initializeApp, cert, type App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';

/**
 * @fileOverview Institutional Firebase Admin SDK Initializer
 * Hardened to resolve Project ID (aud) mismatch and ensure singleton reliability.
 * Strictly enforces alignment between Client and Server Project IDs.
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
 * Ensures the Admin SDK is initialized for the EXACT project the client expects.
 */
function initAdmin(): AdminServices {
  if (global.__admin_services) {
    return global.__admin_services;
  }

  const apps = getApps();
  let adminApp: App;

  // The authoritative source of truth for the project ID
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const databaseURL = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;

  if (!projectId) {
    console.error("[Admin-Init] FATAL: NEXT_PUBLIC_FIREBASE_PROJECT_ID is not configured.");
    throw new Error("NEXT_PUBLIC_FIREBASE_PROJECT_ID is missing.");
  }

  if (apps.length > 0) {
    adminApp = apps.find(app => app.options.projectId === projectId) || apps[0];
    
    // Security Audit: Check if the existing app matches our target project
    if (adminApp.options.projectId !== projectId) {
      console.warn(`[Admin-Init] WARNING: Project ID mismatch. SDK is using "${adminApp.options.projectId}" but client expects "${projectId}". Re-initializing...`);
    } else {
      global.__admin_services = {
        app: adminApp,
        db: getFirestore(adminApp),
        auth: getAuth(adminApp),
        rtdb: getDatabase(adminApp)
      };
      return global.__admin_services;
    }
  }

  console.log('[Admin-Init] Initializing Institutional Administrative Instance...');
  console.log('[Admin-Init] Target Project Identity:', projectId);

  const b64Key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_B64;

  // CRITICAL: Explicitly pass projectId in the options to ensure verifyIdToken 
  // checks the correct 'aud' (audience) claim regardless of the credential source.
  let options: any = {
    projectId,
    databaseURL
  };

  if (b64Key && b64Key.trim() !== '') {
    try {
      const decoded = Buffer.from(b64Key, 'base64').toString('utf-8');
      const serviceAccount = JSON.parse(decoded);
      
      // Validation: If the service account project differs from the environment, log it
      if (serviceAccount.project_id && serviceAccount.project_id !== projectId) {
        console.warn(`[Admin-Init] CRITICAL: Service account project (${serviceAccount.project_id}) differs from environment (${projectId}). Overriding to environment ID.`);
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
    }
  } else {
    console.log('[Admin-Init] Authentication: Application Default Credentials (ADC)');
  }

  try {
    adminApp = initializeApp(options, `Admin-${Date.now()}`);
    console.log('[Admin-Init] Success: Admin SDK bound to project:', adminApp.options.projectId);
  } catch (err: any) {
    console.error("[Admin-Init] Initialization Fault:", err.message);
    throw new Error(`Admin initialization failed: ${err.message}`);
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
