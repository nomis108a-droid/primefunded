import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { getChainTransactions, validateTransaction, isValidTxHash, SUPPORTED_CHAINS } from "@/lib/onChainVerification";

export async function POST(req: NextRequest) {
  try {
    const { orderId, txid } = await req.json();
    if (!orderId || !txid) {
      return NextResponse.json({ valid: false, reason: "Missing orderId or txid" }, { status: 400 });
    }

    const db = getAdminDb();
    if (!db) return NextResponse.json({ valid: false, reason: "Database unavailable" }, { status: 503 });

    const orderSnap = await db.collection("orders").doc(orderId).get();
    if (!orderSnap.exists) {
      return NextResponse.json({ valid: false, reason: "Order not found" }, { status: 404 });
    }
    const order = orderSnap.data()!;
    const network = order.network;

    if (!isValidTxHash(txid.trim(), network)) {
      return NextResponse.json({ valid: false, reason: "Transaction ID format is invalid for this network." });
    }

    const settingsSnap = await db.collection("settings").doc("payments").get();
    const configuredWallets = settingsSnap.exists ? settingsSnap.data()?.walletAddresses || {} : {};
    let walletAddress = configuredWallets[network];
    if (!walletAddress) {
      if (network === "TRON") walletAddress = "TMitDXKKnsHKgBVENHdorV4axBou6KC5JM";
      else if (network === "XRPL") walletAddress = "rLjF6ztYrfAQrVoaCemDCmSJhU85AwgEt6";
      else walletAddress = "0x3ab3ca43dc691f468bea91883f493cabf6da84d4";
    }

    const txs = await getChainTransactions(network, walletAddress);
    const cleanTxid = txid.trim().toLowerCase();
    const matchingTx = txs.find((tx: any) => tx.hash?.toLowerCase() === cleanTxid);

    if (!matchingTx) {
      return NextResponse.json({ valid: false, reason: "Transaction not found on-chain yet. It may still be confirming — wait a minute and try again, or double-check the hash." });
    }

    const isValid = validateTransaction(matchingTx, walletAddress, order.amountNative, 0.02, order.destinationTag);
    if (!isValid) {
      return NextResponse.json({ valid: false, reason: "Transaction found, but the amount or destination does not match this order." });
    }

    return NextResponse.json({ valid: true, reason: "Transaction verified on-chain." });
  } catch (error: any) {
    console.error("[VerifyTxid] Error:", error);
    return NextResponse.json({ valid: false, reason: "Verification failed due to a server error." }, { status: 500 });
  }
}
