
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
    const orderRef = db.collection("orders").doc(orderId);
    const orderSnap = await orderRef.get();

    if (!orderSnap.exists) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    const order = orderSnap.data()!;

    if (order.status === "approved" || order.status === "completed") {
      return NextResponse.json({ status: order.status, message: "Order already processed" });
    }

    // 1. Identify Target Network and Address
    const network = order.network || "ERC20";
    const walletAddress = "0x3ab3ca43dc691f468bea91883f493cabf6da84d4"; // receiving wallet
    const expectedNative = order.amountNative; // calculated at order creation

    // 2. Fetch Transactions from Etherscan V2
    const txs = await getChainTransactions(network, walletAddress);

    // 3. Find Match
    const matchingTx = txs.find((tx: any) => validateTransaction(tx, walletAddress, expectedNative));

    if (matchingTx) {
      const chainConfig = SUPPORTED_CHAINS[network];
      const confirmations = parseInt(matchingTx.confirmations || "0");

      if (confirmations >= chainConfig.confirmations) {
        // AUTOMATIC APPROVAL AND ACCOUNT PROVISIONING
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
              txHash: matchingTx.hash,
              confirmations: confirmations,
              verifiedAt: FieldValue.serverTimestamp(),
              verificationMethod: "automatic"
            });

            return NextResponse.json({ status: "completed", message: "Account provisioned automatically" });
          }
        }
      } else {
        // TRANSACTION DETECTED BUT PENDING CONFIRMATIONS
        await orderRef.update({
          status: "detected",
          txHash: matchingTx.hash,
          confirmations: confirmations
        });
        return NextResponse.json({ status: "detected", confirmations, required: chainConfig.confirmations });
      }
    }

    return NextResponse.json({ status: "waiting", message: "Searching for transaction..." });

  } catch (error: any) {
    console.error("[VerifyAPI] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
