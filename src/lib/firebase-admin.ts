import { getApps, initializeApp, cert, type App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

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

// Initialize Firebase Admin only once
const adminApp: App = getApps().find(a => a.name === 'pf-admin') || initializeApp({
  credential: cert(getServiceAccount()),
  databaseURL: "https://studio-8383940162-6976e-default-rtdb.asia-southeast1.firebasedatabase.app"
}, 'pf-admin');

export const adminDb = getFirestore(adminApp);
export const adminAuth = getAuth(adminApp);

export function getAdminDb() {
  return adminDb;
}

export function getAdminAuth() {
  return adminAuth;
}

export function getAdminServices() {
  return { db: adminDb, auth: adminAuth };
}