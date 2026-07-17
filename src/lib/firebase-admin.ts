import { getApps, initializeApp, cert, type App, credential } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';

/**
 * @fileOverview Institutional Firebase Admin SDK Configuration
 * Hardened for Production: Ensures reliable administrative access and resolves
 * gRPC "metadata from plugin" errors by strictly managing Service Account lifecycle.
 */

let adminApp: App | null = null;

function getAdminApp(): App | null {
  if (adminApp) return adminApp;

  try {
    // 1. Singleton Guard
    const apps = getApps();
    if (apps.length > 0) {
      adminApp = apps[0];
      return adminApp;
    }

    // 2. Configuration Retrieval
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'studio-8383940162-6976e';
    const b64Key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_B64;
    const databaseURL = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;

    const config: any = {
      projectId,
      databaseURL
    };

    // 3. Credential Injection
    if (b64Key && b64Key.trim() !== '') {
      try {
        const decoded = Buffer.from(b64Key, 'base64').toString('utf-8');
        const serviceAccount = JSON.parse(decoded);
        
        if (serviceAccount.private_key) {
          // Normalize the private key to handle both literal newlines and escaped characters
          serviceAccount.private_key = serviceAccount.private_key
            .replace(/\\n/g, '\n')
            .replace(/^"(.*)"$/, '$1')
            .trim();
        }
        
        // Explicitly use the project_id from the service account if available
        if (serviceAccount.project_id) {
          config.projectId = serviceAccount.project_id;
        }

        config.credential = cert(serviceAccount);
        console.log(`[Admin-Init] Master established via Service Account: ${serviceAccount.client_email}`);
      } catch (err: any) {
        console.error("[Admin-Init] Service Account parse failed. Falling back to ADC:", err.message);
        config.credential = credential.applicationDefault();
      }
    } else {
      console.warn("[Admin-Init] No Service Account key provided. Using Application Default Credentials.");
      config.credential = credential.applicationDefault();
    }

    // 4. Initialization
    adminApp = initializeApp(config);
    return adminApp;
  } catch (e: any) {
    console.error("[Admin-Init] CRITICAL FATAL FAILURE:", e.message);
    return null;
  }
}

/**
 * Service Provider Singletons
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

export const isFirebaseAdminConfigured = () => !!getAdminApp();
