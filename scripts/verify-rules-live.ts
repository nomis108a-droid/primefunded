/**
 * verify-rules-live.ts
 * Calls your ACTUAL auditDemoAccount() from src/lib/rulesEngine.ts
 * against a throwaway test account + fake price feed in your real Firestore.
 * Cleans up after itself. Does NOT touch any real user account.
 */

import { getAdminDb } from '../src/lib/firebase-admin';
import { auditDemoAccount } from '../src/lib/rulesEngine';
import { FieldValue } from 'firebase-admin/firestore';

const TEST_ACCOUNT_ID = 'VERIFY_TEST_ACCOUNT_DELETE_ME';
const TEST_USER_ID = 'VERIFY_TEST_USER_DELETE_ME';

async function cleanup(db: FirebaseFirestore.Firestore) {
  const tradesSnap = await db.collection('demoTrades').where('accountId', '==', TEST_ACCOUNT_ID).get();
  const batch = db.batch();
  tradesSnap.docs.forEach(d => batch.delete(d.ref));
  batch.delete(db.collection('demoAccounts').doc(TEST_ACCOUNT_ID));
  batch.delete(db.collection('livePrices').doc('VERIFYSYM1'));
  batch.delete(db.collection('livePrices').doc('VERIFYSYM2'));
  await batch.commit();
  console.log('🧹 Cleanup complete — test data removed.\n');
}

async function setupScenario(db: FirebaseFirestore.Firestore, trades: any[]) {
  await cleanup(db).catch(() => {});

  await db.collection('demoAccounts').doc(TEST_ACCOUNT_ID).set({
    userId: TEST_USER_ID,
    startBalance: 10000,
    balance: 10000,
    planType: 'instant-funding',
    phase: 'funded',
    status: 'active',
    email: 'verify-test@example.com',
    name: 'Verify Test',
  });

  await db.collection('livePrices').doc('VERIFYSYM1').set({ bid: 99.5, ask: 99.5, price: 99.5 });
  await db.collection('livePrices').doc('VERIFYSYM2').set({ bid: 99.5, ask: 99.5, price: 99.5 });

  const batch = db.batch();
  trades.forEach((t, i) => {
    const ref = db.collection('demoTrades').doc(`${TEST_ACCOUNT_ID}_trade_${i}`);
    batch.set(ref, {
      accountId: TEST_ACCOUNT_ID,
      status: 'open',
      type: 'buy',
      symbol: t.symbol,
      openPrice: t.openPrice,
      lots: t.lots,
      openedAt: FieldValue.serverTimestamp(),
    });
  });
  await batch.commit();
}

async function main() {
  const db = getAdminDb();

  console.log('=== TEST 1: Same-symbol losses that should NOT trigger a close ===');
  console.log('10k account, 1% limit = $100. VERIFYSYM1: -50, +50, -50 (net -50). VERIFYSYM2: -50.\n');

  await setupScenario(db, [
    { symbol: 'VERIFYSYM1', openPrice: 100, lots: 0.001 },
    { symbol: 'VERIFYSYM1', openPrice: 99, lots: 0.001 },
    { symbol: 'VERIFYSYM2', openPrice: 100, lots: 0.001 },
    { symbol: 'VERIFYSYM1', openPrice: 100, lots: 0.001 },
  ]);

  const result1 = await auditDemoAccount(TEST_ACCOUNT_ID);
  const tradesAfter1 = await db.collection('demoTrades').where('accountId', '==', TEST_ACCOUNT_ID).get();
  const stillOpen1 = tradesAfter1.docs.filter(d => d.data().status === 'open').length;

  console.log('Audit result:', result1);
  console.log(`Trades still open: ${stillOpen1} / 4`);
  console.log(stillOpen1 === 4 ? '✅ PASS — nothing was force-closed, as expected\n' : '❌ FAIL — something got force-closed when it should not have\n');

  console.log('=== TEST 2: Same-symbol losses that SHOULD trigger a close ===');
  console.log('10k account, 1% limit = $100. Two VERIFYSYM1 trades at -60 each (net -120).\n');

  await setupScenario(db, [
    { symbol: 'VERIFYSYM1', openPrice: 100.6, lots: 0.001 },
    { symbol: 'VERIFYSYM1', openPrice: 100.6, lots: 0.001 },
  ]);

  const result2 = await auditDemoAccount(TEST_ACCOUNT_ID);
  const tradesAfter2 = await db.collection('demoTrades').where('accountId', '==', TEST_ACCOUNT_ID).get();
  const closed2 = tradesAfter2.docs.filter(d => d.data().status === 'closed').length;

  console.log('Audit result:', result2);
  console.log(`Trades closed: ${closed2} / 2`);
  console.log(closed2 === 2 ? '✅ PASS — both trades force-closed as expected\n' : '❌ FAIL — expected both trades to be force-closed\n');

  await cleanup(db);
  process.exit(0);
}

main().catch(err => {
  console.error('Script error:', err);
  process.exit(1);
});
