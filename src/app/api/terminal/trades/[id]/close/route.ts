import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { auditDemoAccount } from '@/lib/rulesEngine';
import { RULES_CONFIG, getPlanKey, CONTRACT_SIZE } from '@/lib/rulesConfig';

/**
 * @fileOverview Institutional Position Closure API
 * Enforces unified pricing: BUY closes at BID, SELL closes at ASK.
 * Implements 0.01 tolerance validation against the server's price feed.
 */

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "No auth token" }, { status: 401 });

    let uid: string;
    try {
      const decoded = await getAdminAuth().verifyIdToken(token);
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const clientPrice = body.closePrice ? parseFloat(String(body.closePrice)) : null;
    const closeReason = body.closeReason || "manual";

    const db = getAdminDb();
    const tradeRef = db.collection("demoTrades").doc(id);
    const tradeSnap = await tradeRef.get();
    
    if (!tradeSnap.exists) return NextResponse.json({ error: "Trade not found" }, { status: 404 });
    const trade = tradeSnap.data()!;
    if (trade.userId !== uid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (trade.status !== "open") return NextResponse.json({ error: "Already closed" }, { status: 400 });

    const sym = trade.symbol.toUpperCase();
    const marketSnap = await db.collection('market').doc(sym).get();
    const feed = marketSnap.exists ? marketSnap.data() : (await db.collection('livePrices').doc(sym).get()).data();

    if (!feed) return NextResponse.json({ error: "No market feed available for execution" }, { status: 400 });

    // ── UNIFIED PRICING LOGIC ──
    // BUY positions close at BID, SELL positions close at ASK
    const authoritativePrice = trade.type === 'buy' ? feed.bid : feed.ask;
    
    // Price Validation Layer: Prevent deviation > 0.01
    if (clientPrice && Math.abs(clientPrice - authoritativePrice) > 0.011) {
      return NextResponse.json({ 
        error: "Execution Rejected: Price Slippage. Feed shifted.",
        feedPrice: authoritativePrice,
        clientPrice: clientPrice
      }, { status: 409 });
    }

    const finalExitPrice = authoritativePrice;
    const contractSize = CONTRACT_SIZE[sym] || 100000;
    const pnl = (trade.type === "buy" ? finalExitPrice - trade.openPrice : trade.openPrice - finalExitPrice) * trade.lots * contractSize;

    const accRef = db.collection("demoAccounts").doc(trade.accountId);
    const accSnap = await accRef.get();
    if (!accSnap.exists) throw new Error("Account missing");
    const account = accSnap.data()!;

    // Rule Check: Max Single Trade Loss (Hard Breach)
    const startBalance = account.startBalance || 100000;
    const pKey = getPlanKey(account.planType || account.plan || '1-step-pro');
    const phKey = account.phase || 'evaluation';
    const rules = RULES_CONFIG.plans[pKey]?.[phKey] || RULES_CONFIG.plans['1-step-pro']['evaluation'];
    const singleTradeLossLimit = startBalance * (rules.maxSingleTradeLoss || 3) / 100;
    const isMajorLoss = pnl < 0 && Math.abs(pnl) > singleTradeLossLimit;

    await db.runTransaction(async (tx) => {
      tx.update(tradeRef, {
        status: "closed",
        closeReason,
        closePrice: finalExitPrice,
        closeBid: feed.bid,
        closeAsk: feed.ask,
        pnl,
        closedAt: Timestamp.now(),
      });

      const updates: any = {
        balance: FieldValue.increment(pnl),
        updatedAt: FieldValue.serverTimestamp()
      };

      if (isMajorLoss && ['2-step-classic', '3-step-classic', 'instant-funding', 'instant-pro'].includes(pKey)) {
        updates.status = 'blown';
        updates.breachReason = 'single_trade_loss_breach';
      }

      tx.update(accRef, updates);
    });

    await db.collection('users').doc(uid).collection('notifications').add({
      title: isMajorLoss ? '❌ Account Breached' : '💼 Position Closed',
      message: isMajorLoss 
        ? `Single trade loss breach: $${Math.abs(pnl).toFixed(2)} exceeded $${singleTradeLossLimit.toFixed(2)} limit.`
        : `${trade.symbol} closed at ${finalExitPrice.toFixed(5)}. PnL: $${pnl.toFixed(2)}`,
      type: isMajorLoss ? 'account_breached' : 'trade_closed',
      isRead: false,
      createdAt: FieldValue.serverTimestamp()
    });

    await auditDemoAccount(trade.accountId);

    return NextResponse.json({ ok: true, pnl, closePrice: finalExitPrice });
  } catch (error: any) {
    console.error('[Close-Trade-API] Error:', error);
    return NextResponse.json({ error: "Internal Terminal Fault", details: error.message }, { status: 500 });
  }
}
