import { getAdminDb } from '../src/lib/firebase-admin';
import { auditDemoAccount } from '../src/lib/rulesEngine';
import { FieldValue } from 'firebase-admin/firestore';

const TEST_ACCOUNT_ID = 'VERIFY_STL_TEST_ACCOUNT_DELETE_ME';
const TEST_USER_ID = 'VERIFY_STL_TEST_USER_DELETE_ME';

async function cleanup(db: FirebaseFirestore.Firestore) {
  const tradesSnap = await db.collection('demoTrades').where('accountId', '==', TEST_ACCOUNT_ID).get();
  const batch = db.batch();
  tradesSnap.docs.forEach(d => batch.delete(d.ref));
  batch.delete(db.collection('demoAccounts').doc(TEST_ACCOUNT_ID));
  batch.delete(db.collection('livePrices').doc('STLSYM1'));
  batch.delete(db.collection('livePrices').doc('STLSYM2'));
  await batch.commit();
  console.log('🧹 Cleanup complete — test data removed.\n');
}

async function setupScenario(db: FirebaseFirestore.Firestore, trades: any[]) {
  await cleanup(db).catch(() => {});

  await db.collection('demoAccounts').doc(TEST_ACCOUNT_ID).set({
    userId: TEST_USER_ID,
    startBalance: 10000,
    balance: 10000,
    planType: '2-step-classic',
    phase: 'funded',
    status: 'active',
    email: 'verify-stl-test@example.com',
    name: 'Verify STL Test',
  });

  await db.collection('livePrices').doc('STLSYM1').set({ bid: 100, ask: 100, price: 100 });
  await db.collection('livePrices').doc('STLSYM2').set({ bid: 100, ask: 100, price: 100 });

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

  console.log('=== TEST 1: Single trade loses $350 (limit is $300) — SHOULD force-close ===\n');
  await setupScenario(db, [
    { symbol: 'STLSYM1', openPrice: 103.5, lots: 0.001 },
  ]);
  const result1 = await auditDemoAccount(TEST_ACCOUNT_ID);
  const after1 = await db.collection('demoTrades').where('accountId', '==', TEST_ACCOUNT_ID).get();
  const closed1 = after1.docs.filter(d => d.data().status === 'closed').length;
  console.log('Audit result:', result1);
  console.log(`Trades closed: ${closed1} / 1`);
  console.log(closed1 === 1 ? '✅ PASS — trade was force-closed as expected\n' : '❌ FAIL — trade should have been force-closed\n');

  console.log('=== TEST 2: Single trade loses $200 (under $300 limit) — should stay OPEN ===\n');
  await setupScenario(db, [
    { symbol: 'STLSYM1', openPrice: 102, lots: 0.001 },
  ]);
  const result2 = await auditDemoAccount(TEST_ACCOUNT_ID);
  const after2 = await db.collection('demoTrades').where('accountId', '==', TEST_ACCOUNT_ID).get();
  const stillOpen2 = after2.docs.filter(d => d.data().status === 'open').length;
  console.log('Audit result:', result2);
  console.log(`Trades still open: ${stillOpen2} / 1`);
  console.log(stillOpen2 === 1 ? '✅ PASS — trade correctly stayed open (below threshold)\n' : '❌ FAIL — trade should NOT have been closed\n');

  console.log('=== TEST 3: Two DIFFERENT trades each lose $350 — BOTH should force-close individually ===\n');
  await setupScenario(db, [
    { symbol: 'STLSYM1', openPrice: 103.5, lots: 0.001 },
    { symbol: 'STLSYM2', openPrice: 103.5, lots: 0.001 },
  ]);
  const result3 = await auditDemoAccount(TEST_ACCOUNT_ID);
  const after3 = await db.collection('demoTrades').where('accountId', '==', TEST_ACCOUNT_ID).get();
  const closed3 = after3.docs.filter(d => d.data().status === 'closed').length;
  console.log('Audit result:', result3);
  console.log(`Trades closed: ${closed3} / 2`);
  console.log(closed3 === 2 ? '✅ PASS — both trades force-closed independently (no symbol grouping needed here)\n' : '❌ FAIL — expected both trades closed\n');

  await cleanup(db);
  process.exit(0);
}

main().catch(err => {
  console.error('Script error:', err);
  process.exit(1);
});
