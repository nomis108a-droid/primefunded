import { getApps, initializeApp, cert, type App, credential } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';

/**
 * @fileOverview Institutional Firebase Admin SDK Configuration
 * Hardened for both Local Development and Production environments.
 * Resolves "Could not refresh access token" errors by ensuring proper credential mapping.
 */

let adminApp: App | null = null;

function getAdminApp(): App | null {
  if (adminApp) return adminApp;

  try {
    const existingApp = getApps().find(a => a.name === 'pf-admin');
    if (existingApp) {
      adminApp = existingApp;
      return adminApp;
    }

    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || 'studio-8383940162-6976e';
    const b64Key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_B64;

    const config: any = {
      projectId: projectId,
      databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL
    };

    if (b64Key && b64Key.trim() !== '') {
      try {
        const decoded = Buffer.from(b64Key, 'base64').toString('utf-8');
        const serviceAccount = JSON.parse(decoded);
        
        if (serviceAccount.private_key) {
          serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n').trim();
        }
        config.credential = cert(serviceAccount);
        console.log(`[Firebase-Admin] Initialized with Service Account: ${serviceAccount.client_email}`);
      } catch (e: any) {
        console.error("[Firebase-Admin] B64 Service Account Parse Failure:", e.message);
      }
    } else {
      // Fallback for local development or environments with Application Default Credentials
      try {
        config.credential = credential.applicationDefault();
        console.log(`[Firebase-Admin] Initialized with Application Default Credentials`);
      } catch (err: any) {
        console.warn("[Firebase-Admin] No credentials found. Admin SDK limited to project metadata.");
      }
    }

    adminApp = initializeApp(config, 'pf-admin');
    return adminApp;
  } catch (e: any) {
    console.error("[Firebase-Admin] FATAL: Initialization failed:", e.message);
    return null;
  }
}

/**
 * Service Singletons
 */
export const getAdminDb = () => {
  const app = getAdminApp();
  return app ? getFirestore(app) : null;
};

export const getAdminAuth = () => {
  const app = getAdminApp();
  return app ? getAuth(app) : null;
};

export const getAdminRtdb = () => {
  const app = getAdminApp();
  return app ? getDatabase(app) : null;
};

export function getAdminServices() {
  const app = getAdminApp();
  if (!app) return null;
  return { 
    db: getFirestore(app), 
    auth: getAuth(app), 
    rtdb: getDatabase(app) 
  };
}

export const isFirebaseAdminConfigured = () => !!adminApp;
