import { getApps, initializeApp, cert, type App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';

/**
 * @fileOverview Institutional Firebase Admin SDK Initializer
 * Hardened to support multiple credential sources and ensure singleton reliability.
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
 * Implements a singleton pattern to avoid "already initialized" errors.
 */
function initAdmin(): AdminServices {
  if (global.__admin_services) {
    return global.__admin_services;
  }

  const apps = getApps();
  const fallbackProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'studio-8383940162-6976e';

  // If already initialized by another process or earlier in the lifecycle
  if (apps.length > 0) {
    const existingApp = apps.find(a => a.options.projectId === fallbackProjectId) || apps[0];
    global.__admin_services = {
      app: existingApp,
      db: getFirestore(existingApp),
      auth: getAuth(existingApp),
      rtdb: getDatabase(existingApp)
    };
    return global.__admin_services;
  }

  let credential;
  let projectId = fallbackProjectId;
  let clientEmail = 'environment-default';

  // 1. Priority: Base64 Service Account
  const b64Key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_B64;
  if (b64Key && b64Key.trim() !== '') {
    try {
      const decoded = JSON.parse(Buffer.from(b64Key, 'base64').toString('utf-8'));
      if (decoded.private_key) {
        decoded.private_key = decoded.private_key.replace(/\\n/g, '\n').trim();
      }
      credential = cert(decoded);
      projectId = decoded.project_id || projectId;
      clientEmail = decoded.client_email || clientEmail;
    } catch (e: any) {
      console.error("[Admin-Init] B64 Parse Failed:", e.message);
    }
  }

  // 2. Secondary: Discrete Environment Variables
  if (!credential) {
    const envProjectId = process.env.FIREBASE_PROJECT_ID;
    const envEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const envKey = process.env.FIREBASE_PRIVATE_KEY;

    if (envProjectId && envEmail && envKey) {
      credential = cert({
        projectId: envProjectId,
        clientEmail: envEmail,
        privateKey: envKey.replace(/\\n/g, '\n')
      });
      projectId = envProjectId;
      clientEmail = envEmail;
    }
  }

  // Logging critical info before initialization as requested
  console.log(`[Admin-Init] Initializing Institutional Admin SDK`);
  console.log(`[Admin-Init] Admin Project ID: ${projectId}`);
  console.log(`[Admin-Init] Admin Client Email: ${clientEmail}`);

  try {
    // CRITICAL: Explicitly pass projectId to ensure consistency with Client SDK tokens
    const app = initializeApp({
      credential,
      projectId,
      databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL
    }, `Admin-${Date.now()}`);

    global.__admin_services = {
      app,
      db: getFirestore(app),
      auth: getAuth(app),
      rtdb: getDatabase(app)
    };
  } catch (err: any) {
    console.error("[Admin-Init] Fatal Initialization Error:", err.message);
    throw err;
  }

  return global.__admin_services!;
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
