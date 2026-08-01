
import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { getChainTransactions, validateTransaction, SUPPORTED_CHAINS } from "@/lib/onChainVerification";
import { FieldValue } from "firebase-admin/firestore";
import { RULES_CONFIG, getPlanKey } from '@/lib/rulesConfig';

export async function POST(req: NextRequest) {
  try {
    const { orderId } = await req.json();
    if (!orderId) return NextResponse.json({ error: "Order ID required" }, { status: 400 });

    const db = getAdminDb();
    const orderRef = db.collection("orders").doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    const order = orderSnap.data()!;

    if (order.status === "approved" || order.status === "completed") {
      return NextResponse.json({ status: order.status });
    }

    const settingsSnap = await db.collection("settings").doc("payments").get();
    const configuredWallets = settingsSnap.exists ? settingsSnap.data()?.walletAddresses || {} : {};
    const network = order.network || "Polygon";
    let walletAddress = configuredWallets[network] || "0x3ab3ca43dc691f468bea91883f493cabf6da84d4"; 

    const txs = await getChainTransactions(network, walletAddress);
    const matchingTx = txs.find((tx: any) => validateTransaction(tx, walletAddress, order.amountNative, 0.02, order.destinationTag));

    if (matchingTx) {
      const chainConfig = SUPPORTED_CHAINS[network];
      const confirmations = parseInt(matchingTx.confirmations || "0");

      if (network === "XRPL" || network === "TRON" || confirmations >= (chainConfig?.confirmations || 12)) {
        await finalizeProvisioning(db, orderRef, order, matchingTx.hash);
        return NextResponse.json({ status: "completed" });
      } else {
        await orderRef.update({ status: "detected", txHash: matchingTx.hash, confirmations });
        return NextResponse.json({ status: "detected", confirmations });
      }
    }

    return NextResponse.json({ status: "waiting" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function finalizeProvisioning(db: any, orderRef: any, order: any, txHash: string) {
  const planKey = getPlanKey(order.plan);
  const startBalance = parseInt(order.accountSize.replace(/[^0-9]/g, "")) || 100000;
  const rules = RULES_CONFIG.plans[planKey]?.['evaluation'] || RULES_CONFIG.plans['1-step-pro']['evaluation'];
  const profitTarget = startBalance * (rules.profitTarget || 10) / 100;
  const dailyLimit = startBalance * (rules.dailyDrawdown / 100);
  const maxLimit = startBalance * (rules.maxDrawdown / 100);

  const batch = db.batch();

  // 1. Create Demo Account
  const accRef = db.collection('demoAccounts').doc();
  batch.set(accRef, {
    userId: order.userId,
    email: order.email,
    label: `${order.plan.toUpperCase()} — $${startBalance / 1000}k Challenge`,
    startBalance, balance: startBalance, equity: startBalance,
    plan: `${startBalance / 1000}k`, planType: planKey, phase: 'evaluation',
    profitTarget, dailyLossLimitUsd: dailyLimit, dailyGrossLossUsd: 0, maxLoss: maxLimit,
    status: 'active', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
  });

  // 2. Update Order
  batch.update(orderRef, { status: "completed", txHash, verifiedAt: FieldValue.serverTimestamp() });

  // 3. Process Commission logic (Inlined for reliability in batch)
  const userSnap = await db.collection('users').doc(order.userId).get();
  if (userSnap.exists) {
    const userData = userSnap.data()!;
    const referrerId = userData.referredBy;
    if (referrerId && order.plan.toLowerCase().includes('step')) {
      const commission = order.amountPaid * 0.20;
      const referrerRef = db.collection('users').doc(referrerId);
      batch.update(referrerRef, {
        'referralStats.purchases': FieldValue.increment(1),
        'referralEarnings.pending': FieldValue.increment(commission),
        'referralEarnings.withdrawable': FieldValue.increment(commission),
        updatedAt: FieldValue.serverTimestamp()
      });
      const refRecord = db.collection('referrals').doc();
      batch.set(refRecord, {
        referrerId, referredUserId: order.userId, referredUserEmail: order.email,
        status: 'funded', amount: commission, planType: order.plan,
        orderAmount: order.amountPaid, createdAt: FieldValue.serverTimestamp()
      });
      const notifRef = referrerRef.collection('notifications').doc();
      batch.set(notifRef, {
        title: '💰 Commission Earned!',
        message: `You earned $${commission.toFixed(2)} from a referral purchase.`,
        type: 'referral_earned', isRead: false, createdAt: FieldValue.serverTimestamp()
      });
    }
  }

  await batch.commit();
}
