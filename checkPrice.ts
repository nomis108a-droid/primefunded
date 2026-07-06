import { getAdminDb } from './src/lib/firebase-admin';

/**
 * @fileOverview Firestore Data Auditor
 * Fetches the current state of XAUUSD liquidity from the database.
 * Run with: npm run check-price
 */

async function check() {
  const db = getAdminDb();
  console.log('\n==========================================');
  console.log('   FIRESTORE DIAGNOSTIC: XAUUSD FEED      ');
  console.log('==========================================\n');
  
  try {
    // 1. Audit livePrices (High Frequency Feed)
    const livePricesDoc = await db.collection('livePrices').doc('XAUUSD').get();
    if (livePricesDoc.exists) {
      const data = livePricesDoc.data();
      const date = data?.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(data?.updatedAt || 0);
      const ageSec = (Date.now() - date.getTime()) / 1000;

      console.log('[livePrices/XAUUSD]');
      console.log('  Price:     ', data?.price);
      console.log('  Bid:       ', data?.bid);
      console.log('  Ask:       ', data?.ask);
      console.log('  Timestamp: ', date.toISOString());
      console.log('  Data Age:  ', ageSec.toFixed(1), 'seconds');
      console.log('  Raw Update:', JSON.stringify(data?.updatedAt));
    } else {
      console.log('[livePrices/XAUUSD]: NOT FOUND');
    }

    console.log('\n------------------------------------------\n');

    // 2. Audit market (Fallback/Institutional Sync Feed)
    const marketDoc = await db.collection('market').doc('XAUUSD').get();
    if (marketDoc.exists) {
      const data = marketDoc.data();
      const date = data?.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(data?.updatedAt || 0);
      const ageSec = (Date.now() - date.getTime()) / 1000;

      console.log('[market/XAUUSD]');
      console.log('  Price:     ', data?.price);
      console.log('  Bid:       ', data?.bid);
      console.log('  Ask:       ', data?.ask);
      console.log('  Timestamp: ', date.toISOString());
      console.log('  Data Age:  ', ageSec.toFixed(1), 'seconds');
      console.log('  Raw Update:', JSON.stringify(data?.updatedAt));
    } else {
      console.log('[market/XAUUSD]: NOT FOUND');
    }

  } catch (error: any) {
    console.error('FATAL ERROR DURING AUDIT:', error.message);
  }

  console.log('\n==========================================');
  console.log('        DIAGNOSTIC COMPLETE               ');
  console.log('==========================================\n');
}

check().then(() => {
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
