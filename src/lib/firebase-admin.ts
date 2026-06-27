import { getApps, initializeApp, cert, type App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

function getServiceAccount() {
  // Read from either the Base64 variable or a JSON variable
  const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_B64 || process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  
  if (!key) {
    return null; // Return null during build phase so it doesn't crash
  }
  
  try {
    // If it starts with '{', it's raw JSON
    if (key.trim().startsWith('{')) {
      return JSON.parse(key);
    }
    // Otherwise, decode Base64
    const decoded = Buffer.from(key, 'base64').toString('utf-8');
    return JSON.parse(decoded);
  } catch (e) {
    console.error("Failed to parse Firebase Service Account Key. Make sure it's valid JSON or Base64.");
    return null;
  }
}

const serviceAccount = getServiceAccount();

// Initialize Firebase Admin only once
const adminApp: App = getApps().find(a => a.name === 'pf-admin') || initializeApp(
  serviceAccount ? { credential: cert(serviceAccount) } : {}, 
  'pf-admin'
);

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