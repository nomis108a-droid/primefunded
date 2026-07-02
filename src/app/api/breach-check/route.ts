import { getAdminDb } from '@/lib/firebase-admin';
import { auditAccount, auditDemoAccount } from '@/lib/rulesEngine';

/**
 * @fileOverview Universal Breach Check API
 * Triggers risk evaluation for both MT5 nodes and Internal Demo nodes.
 */

export async function GET(req: Request) {
  try {
    const db = getAdminDb();
    
    // 1. Check MT5 Accounts
    const mt5Snap = await db.collection('mt5_accounts').where('status', '==', 'active').get();
    for (const doc of mt5Snap.docs) {
      await auditAccount({ id: doc.id, ...doc.data() }, true);
    }

    // 2. Check Demo Accounts
    const demoSnap = await db.collection('demoAccounts').where('status', '==', 'active').get();
    for (const doc of demoSnap.docs) {
      await auditDemoAccount(doc.id);
    }

    return new Response(JSON.stringify({ 
      success: true, 
      checked: mt5Snap.size + demoSnap.size 
    }), { status: 200 });

  } catch (error: any) {
    return new Response(error.message, { status: 500 });
  }
}

export async function POST(req: Request) {
  return GET(req);
}
