import { getApps, initializeApp, cert, type App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

/**
 * @fileOverview Centralized Firebase Admin SDK Initialization
 * Ensures a single instance of the Admin SDK is used across all server-side routes.
 */

function getAdminApp(): App {
  const existingApps = getApps();
  const adminApp = existingApps.find(app => app.name === 'pf-admin');
  if (adminApp) return adminApp;

  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!serviceAccountKey) {
    console.error('[AdminSDK] CRITICAL: FIREBASE_SERVICE_ACCOUNT_KEY is missing.');
    throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY is missing.');
  }

  let serviceAccount;
  try {
    // Strip leading/trailing single quotes, double quotes, or backticks
    const cleaned = serviceAccountKey
      .replace(/^['"`]|['"`]$/g, '')
      .trim();
    serviceAccount = JSON.parse(cleaned);
  } catch (e) {
    console.error('[AdminSDK] FATAL: FIREBASE_SERVICE_ACCOUNT_KEY parsing failed. Ensure it is valid JSON.');
    throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY is not valid JSON.');
  }

  try {
    return initializeApp({
      credential: cert(serviceAccount),
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
    }, 'pf-admin');
  } catch (e: any) {
    console.error('[AdminSDK] FATAL: initializeApp failed:', e.message);
    throw e;
  }
}

/**
 * Helper to get Admin Services safely.
 * Returns null if initialization fails, allowing handlers to catch and report errors as JSON.
 */
export function getAdminServices() {
  try {
    const app = getAdminApp();
    return {
      adminDb: getFirestore(app),
      adminAuth: getAuth(app),
      success: true
    };
  } catch (err: any) {
    return {
      adminDb: null,
      adminAuth: null,
      success: false,
      error: err.message
    };
  }
}

// Keep legacy exports for compatibility, but prefer getAdminServices() inside routes
export const adminApp = getApps().find(a => a.name === 'pf-admin') || null;
export const adminDb = adminApp ? getFirestore(adminApp) : null as any;
export const adminAuth = adminApp ? getAuth(adminApp) : null as any;
