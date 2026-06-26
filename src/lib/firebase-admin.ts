import { getApps, initializeApp, cert, type App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

/**
 * @fileOverview Centralized Firebase Admin SDK Initialization
 * Ensures a single instance of the Admin SDK is used across all server-side routes.
 * Decodes base64-encoded service account keys for enhanced environment security.
 */

function getServiceAccount() {
  const serviceAccountKeyB64 = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_B64;
  if (!serviceAccountKeyB64) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY_B64 is missing from environment variables.');
  }
  try {
    const decoded = Buffer.from(serviceAccountKeyB64, 'base64').toString('utf-8');
    return JSON.parse(decoded);
  } catch (e) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY_B64 is not a valid base64-encoded JSON string.');
  }
}

function getAdminApp(): App {
  const existingApps = getApps();
  const adminApp = existingApps.find(app => app.name === 'pf-admin');
  if (adminApp) return adminApp;

  const serviceAccount = getServiceAccount();

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

/**
 * Direct shorthand for Firestore Admin
 */
export function getAdminDb() {
  const { adminDb, success, error } = getAdminServices();
  if (!success || !adminDb) throw new Error(`Admin DB Unavailable: ${error}`);
  return adminDb;
}

/**
 * Direct shorthand for Auth Admin
 */
export function getAdminAuth() {
  const { adminAuth, success, error } = getAdminServices();
  if (!success || !adminAuth) throw new Error(`Admin Auth Unavailable: ${error}`);
  return adminAuth;
}

// Legacy exports for compatibility
export const adminApp = getApps().find(a => a.name === 'pf-admin') || null;
export const adminDb = adminApp ? getFirestore(adminApp) : null as any;
export const adminAuth = adminApp ? getAuth(adminApp) : null as any;
