import { getApps, initializeApp, cert, type App, credential } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';

/**
 * @fileOverview Institutional Firebase Admin SDK Configuration
 * Hardened for Production: Ensures reliable administrative access using a global singleton
 * to prevent initialization conflicts during server-side hot-reloads.
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

function initAdmin(): AdminServices | null {
  if (global.__admin_services) return global.__admin_services;

  try {
    const apps = getApps();
    let adminApp: App;

    if (apps.length > 0) {
      adminApp = apps[0];
    } else {
      const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'studio-8383940162-6976e';
      const b64Key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_B64;
      const databaseURL = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;

      const config: any = {
        projectId,
        databaseURL
      };

      if (b64Key && b64Key.trim() !== '') {
        try {
          const decoded = Buffer.from(b64Key, 'base64').toString('utf-8');
          const serviceAccount = JSON.parse(decoded);
          
          if (serviceAccount.private_key) {
            serviceAccount.private_key = serviceAccount.private_key
              .replace(/\\n/g, '\n')
              .replace(/^"(.*)"$/, '$1')
              .trim();
          }
          
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

      adminApp = initializeApp(config);
    }

    global.__admin_services = {
      app: adminApp,
      db: getFirestore(adminApp),
      auth: getAuth(adminApp),
      rtdb: getDatabase(adminApp)
    };

    return global.__admin_services;
  } catch (e: any) {
    console.error("[Admin-Init] CRITICAL FATAL FAILURE:", e.message);
    return null;
  }
}

/**
 * Service Provider Getters
 */
export const getAdminDb = () => initAdmin()?.db || null;
export const getAdminAuth = () => initAdmin()?.auth || null;
export const getAdminRtdb = () => initAdmin()?.rtdb || null;

export function getAdminServices() {
  return initAdmin();
}

export const isFirebaseAdminConfigured = () => !!initAdmin();
