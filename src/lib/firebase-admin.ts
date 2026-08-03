import {
  applicationDefault,
  cert,
  getApp,
  getApps,
  initializeApp,
  type App,
  type ServiceAccount,
} from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';

/**
 * @fileOverview Institutional Firebase Admin SDK Initializer
 * Optimized singleton pattern to resolve "Invalid Firebase app options" errors.
 * Ensures the SDK is only initialized when needed and handles missing credentials gracefully.
 */

function credentialFromBase64() {
  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_B64?.trim();

  if (!encoded || encoded === 'PASTE_YOUR_LONG_BASE64_STRING_HERE') {
    return null;
  }

  try {
    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    const parsed = JSON.parse(decoded);

    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
      console.warn('[Admin-Init] Base64 service account key is incomplete.');
      return null;
    }

    return cert({
      projectId: parsed.project_id,
      client_email: parsed.client_email,
      private_key: parsed.private_key.replace(/\\n/g, '\n'),
    } as any);
  } catch (err) {
    console.error('[Admin-Init] Failed to parse Base64 credentials:', err);
    return null;
  }
}

function getAdminCredential() {
  const b64 = credentialFromBase64();
  if (b64) return b64;

  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

  const privateKey = process.env.FIREBASE_PRIVATE_KEY
    ?.replace(/^["']|["']$/g, '')
    .replace(/\\n/g, '\n');

  if (projectId && clientEmail && privateKey) {
    const serviceAccount: ServiceAccount = {
      projectId,
      clientEmail,
      privateKey,
    };

    return cert(serviceAccount);
  }

  // Final fallback to application default (GCP/App Hosting environment)
  try {
    return applicationDefault();
  } catch (e) {
    return null;
  }
}

/**
 * Checks if the environment has valid Firebase Admin credentials.
 */
export function isFirebaseAdminConfigured(): boolean {
  return !!getAdminCredential();
}

/**
 * Retrieves the singleton Firebase Admin App instance.
 * Ensures initialization happens exactly once with a stable identity.
 */
export function getAdminApp(): App | null {
  if (getApps().length > 0) {
    return getApp();
  }

  const credential = getAdminCredential();
  
  if (!credential) {
    return null;
  }

  try {
    const adminApp = initializeApp({
      credential,
      projectId:
        process.env.FIREBASE_PROJECT_ID ||
        process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    });

    console.log('[Admin-Init] Firebase Admin initialized', {
      projectId: adminApp.options.projectId,
      appName: adminApp.name,
    });

    return adminApp;
  } catch (e) {
    console.error('[Admin-Init] Fatal initialization error:', e);
    return null;
  }
}

/**
 * Synchronized Service Getters
 * These functions ensure consistent singleton access and prevent crashes during module import.
 */
export const getAdminDb = () => {
  const app = getAdminApp();
  if (!app) throw new Error("Firebase Admin Database unavailable - Configuration missing.");
  return getFirestore(app);
};

export const getAdminAuth = () => {
  const app = getAdminApp();
  if (!app) throw new Error("Firebase Admin Auth unavailable - Configuration missing.");
  return getAuth(app);
};

export const getAdminRtdb = () => {
  const app = getAdminApp();
  if (!app) throw new Error("Firebase Admin RTDB unavailable - Configuration missing.");
  return getDatabase(app);
};

/**
 * Returns all admin services in a single context object.
 * Used for complex server-side transactions.
 */
export const getAdminServices = () => {
  const app = getAdminApp();
  if (!app) return null;
  try {
    return {
      app,
      db: getFirestore(app),
      auth: getAuth(app),
      rtdb: getDatabase(app)
    };
  } catch (e) {
    console.warn("[Admin-Init] Services extraction failed:", (e as Error).message);
    return null;
  }
};
