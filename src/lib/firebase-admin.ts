import { getApps, initializeApp, cert, type App, credential } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';

/**
 * @fileOverview Institutional Firebase Admin SDK Configuration (V12)
 * Hardened for Production: Ensures full administrative scopes for Auth, Firestore, and RTDB.
 * Resolves "PERMISSION_DENIED" errors by strictly mapping Service Account credentials.
 */

let adminApp: App | null = null;

function getAdminApp(): App | null {
  if (adminApp) return adminApp;

  try {
    const apps = getApps();
    const existingApp = apps.find(a => a.name === 'pf-admin');
    if (existingApp) {
      adminApp = existingApp;
      return adminApp;
    }

    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || 'studio-8383940162-6976e';
    const b64Key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_B64;
    const databaseURL = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;

    const config: any = {
      projectId: projectId,
      databaseURL: databaseURL
    };

    if (b64Key && b64Key.trim() !== '') {
      try {
        const decoded = Buffer.from(b64Key, 'base64').toString('utf-8');
        const serviceAccount = JSON.parse(decoded);
        
        if (serviceAccount.private_key) {
          // Robust multi-line key normalization
          serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n').trim();
        }
        
        // Using cert() explicitly binds the service account with full scopes
        config.credential = cert(serviceAccount);
        console.log(`[Firebase-Admin] MASTER INIT: Authenticated via Service Account (${serviceAccount.client_email})`);
      } catch (e: any) {
        console.error("[Firebase-Admin] B64 PARSE ERROR:", e.message);
        config.credential = credential.applicationDefault();
      }
    } else {
      // Fallback for GCP internal environments with required scopes
      console.warn("[Firebase-Admin] WARN: No B64 key found. Falling back to Application Default.");
      config.credential = credential.applicationDefault();
    }

    // Initialize named app to isolate administrative context from client context
    adminApp = initializeApp(config, 'pf-admin');
    return adminApp;
  } catch (e: any) {
    console.error("[Firebase-Admin] CRITICAL STARTUP FAILURE:", e.message);
    return null;
  }
}

/**
 * Service Provider Singletons
 * Always ensures the 'pf-admin' app is used for administrative operations.
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
