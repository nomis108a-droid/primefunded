import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { getChainTransactions, validateTransaction, SUPPORTED_CHAINS } from "@/lib/onChainVerification";
import { giftAccountAction } from "@/app/admin/actions";
import { FieldValue } from "firebase-admin/firestore";

/**
 * @fileOverview Automatic Payment Verification Service
 * Polled by the client or background CRON to finalize orders.
 */

export async function POST(req: NextRequest) {
  try {
    const { orderId } = await req.json();
    if (!orderId) return NextResponse.json({ error: "Order ID required" }, { status: 400 });

    const db = getAdminDb();
    if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

    const orderRef = db.collection("orders").doc(orderId);
    const orderSnap = await orderRef.get();

    if (!orderSnap.exists) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    const order = orderSnap.data()!;

    if (order.status === "approved" || order.status === "completed") {
      return NextResponse.json({ status: order.status, message: "Order already processed" });
    }

    // 1. Identify Target Network and Address from Firestore Settings
    const settingsSnap = await db.collection("settings").doc("payments").get();
    const configuredWallets = settingsSnap.exists ? settingsSnap.data()?.walletAddresses || {} : {};

    const network = order.network || "Polygon";
    let walletAddress = configuredWallets[network] || "0x3ab3ca43dc691f468bea91883f493cabf6da84d4"; 

    // Legacy/Hardcoded defaults if not in DB
    if (!configuredWallets[network]) {
      if (network === "TRON") walletAddress = "TMitDXKKnsHKgBVENHdorV4axBou6KC5JM";
      if (network === "XRPL") walletAddress = "rLjF6ztYrfAQrVoaCemDCmSJhU85AwgEt6";
    }

    const expectedNative = order.amountNative; 

    // 2. Fetch Transactions from Chain APIs
    const txs = await getChainTransactions(network, walletAddress);

    // 3. Find Match
    const matchingTx = txs.find((tx: any) => 
      validateTransaction(tx, walletAddress, expectedNative, 0.02, order.destinationTag)
    );

    if (matchingTx) {
      const chainConfig = SUPPORTED_CHAINS[network];
      
      if (network === "XRPL" || network === "TRON") {
        return await finalizeProvisioning(db, orderRef, order, matchingTx.hash, 1);
      }

      const confirmations = parseInt(matchingTx.confirmations || "0");

      if (confirmations >= (chainConfig?.confirmations || 12)) {
        return await finalizeProvisioning(db, orderRef, order, matchingTx.hash, confirmations);
      } else {
        await orderRef.update({
          status: "detected",
          txHash: matchingTx.hash,
          confirmations: confirmations
        });
        return NextResponse.json({ status: "detected", confirmations, required: chainConfig?.confirmations || 12 });
      }
    }

    return NextResponse.json({ status: "waiting", message: "Searching for transaction..." });

  } catch (error: any) {
    console.error("[VerifyAPI] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function finalizeProvisioning(db: any, orderRef: any, order: any, txHash: string, confirmations: number) {
  const userSnap = await db.collection("users").doc(order.userId).get();
  const traderId = userSnap.data()?.traderId;

  if (traderId) {
    const res = await giftAccountAction(
      traderId,
      order.email,
      `Verified Node — ${order.accountSize}`,
      parseInt(order.accountSize.replace(/[^0-9]/g, "")) || 100000,
      order.plan,
      "evaluation"
    );

    if (res.success) {
      await orderRef.update({
        status: "completed",
        txHash: txHash,
        confirmations: confirmations,
        verifiedAt: FieldValue.serverTimestamp(),
        verificationMethod: "automatic"
      });

      return NextResponse.json({ status: "completed", message: "Account provisioned automatically" });
    }
  }
  return NextResponse.json({ status: "error", message: "Provisioning failed" });
}
