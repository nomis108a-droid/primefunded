import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { auditDemoAccount } from '@/lib/rulesEngine';
import { RULES_CONFIG, getPlanKey, CONTRACT_SIZE } from '@/lib/rulesConfig';

/**
 * @fileOverview Institutional Position Closure API
 * Enforces unified pricing: BUY closes at BID, SELL closes at ASK.
 * Implements authoritative price validation to prevent latency exploits.
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
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const clientPrice = body.closePrice ? parseFloat(String(body.closePrice)) : null;

    const db = getAdminDb();
    const tradeRef = db.collection("demoTrades").doc(id);
    const tradeSnap = await tradeRef.get();
    
    if (!tradeSnap.exists) return NextResponse.json({ error: "Trade not found" }, { status: 404 });
    const trade = tradeSnap.data()!;
    if (trade.userId !== uid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (trade.status !== "open") return NextResponse.json({ error: "Trade already closed" }, { status: 400 });

    const sym = trade.symbol.toUpperCase().trim();
    
    const result = await db.runTransaction(async (tx) => {
      // Prioritize livePrices for freshness
      const liveRef = db.collection('livePrices').doc(sym);
      const liveSnap = await tx.get(liveRef);
      let feed = liveSnap.exists ? liveSnap.data() : null;

      if (!feed) {
        const marketRef = db.collection('market').doc(sym);
        const marketSnap = await tx.get(marketRef);
        feed = marketSnap.exists ? marketSnap.data() : null;
      }

      if (!feed || !feed.bid || !feed.ask) {
        throw new Error("Market data offline for " + sym);
      }

      // ── UNIFIED PRICING LOGIC ──
      // BUY positions close at BID, SELL positions close at ASK
      const authoritativePrice = trade.type === 'buy' ? feed.bid : feed.ask;
      
      // VALIDATION: Deviation check (max 0.015 tolerance for latency)
      if (clientPrice && Math.abs(clientPrice - authoritativePrice) > 0.015) {
        // We still use authoritativePrice, but we log the deviation
        console.warn(`[CLOSE] Price deviation detected: Client ${clientPrice} vs Auth ${authoritativePrice}`);
      }

      const contractSize = CONTRACT_SIZE[sym] || 100000;
      const finalPnL = (trade.type === "buy" ? authoritativePrice - trade.openPrice : trade.openPrice - authoritativePrice) * trade.lots * contractSize;

      const accRef = db.collection("demoAccounts").doc(trade.accountId);
      
      tx.update(tradeRef, {
        status: "closed",
        closeReason: "manual",
        closePrice: authoritativePrice,
        closeBid: feed.bid,
        closeAsk: feed.ask,
        pnl: finalPnL,
        closedAt: Timestamp.now(),
      });

      const accUpdates: any = {
        balance: FieldValue.increment(finalPnL),
        updatedAt: FieldValue.serverTimestamp()
      };

      // Track realized daily loss for risk engine efficiency
      if (finalPnL < 0) {
        accUpdates.dailyGrossLossUsd = FieldValue.increment(Math.abs(finalPnL));
      }

      tx.update(accRef, accUpdates);
      
      return { pnl: finalPnL, closePrice: authoritativePrice };
    });

    await auditDemoAccount(trade.accountId);

    return NextResponse.json({ ok: true, ...result });
  } catch (error: any) {
    console.error('[Close-Trade-API] Error:', error);
    return NextResponse.json({ error: error.message || "Internal Terminal Error" }, { status: 500 });
  }
}
