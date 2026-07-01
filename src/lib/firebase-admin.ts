import { getApps, initializeApp, cert, type App, credential } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

/**
 * @fileOverview Institutional Firebase Admin SDK Configuration
 * Hardened for Firebase Studio workstation and App Hosting environments.
 * Prioritizes Service Account Base64, falls back to ADC for Studio/Production.
 */

function getAdminApp(): App {
  const existingApp = getApps().find(a => a.name === 'pf-admin');
  if (existingApp) return existingApp;

  // 1. Check for Base64 Service Account (Primary for Studio Dev/Vercel)
  const b64Key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_B64;
  if (b64Key) {
    try {
      const decoded = Buffer.from(b64Key, 'base64').toString('utf-8');
      const json = JSON.parse(decoded);
      
      // Robust PEM newline normalization
      if (json.private_key) {
        json.private_key = json.private_key
          .replace(/\\n/g, '\n')
          .replace(/"/g, '')
          .trim();
      }

      console.log(`[Firebase-Admin] Initializing with explicit Service Account: ${json.client_email}`);
      return initializeApp({
        credential: cert(json),
        projectId: json.project_id || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
      }, 'pf-admin');
    } catch (e: any) {
      console.error("[Firebase-Admin] Base64 Parse Failed:", e.message);
    }
  }

  // 2. Fallback: Use Application Default Credentials (ADC)
  // This is required for Firebase Studio workstations and App Hosting managed envs.
  try {
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
    console.log(`[Firebase-Admin] Falling back to ADC for Project: ${projectId}`);
    
    return initializeApp({
      credential: credential.applicationDefault(),
      projectId: projectId
    }, 'pf-admin');
  } catch (err: any) {
    console.warn("[Firebase-Admin] ADC Initialization Warning:", err.message);
    // Emergency minimal initialization to prevent crash
    return initializeApp({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
    }, 'pf-admin');
  }
}

/**
 * Singleton service getters
 */
export const getAdminDb = () => getFirestore(getAdminApp());
export const getAdminAuth = () => getAuth(getAdminApp());

export const adminDb = getAdminDb();
export const adminAuth = getAdminAuth();

export function getAdminServices() {
  return { db: getAdminDb(), auth: getAdminAuth() };
}
