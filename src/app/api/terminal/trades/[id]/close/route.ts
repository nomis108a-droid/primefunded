import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { auditDemoAccount } from '@/lib/rulesEngine';
import { CONTRACT_SIZE } from '@/lib/rulesConfig';
import { getLatestOandaTicks } from '@/lib/oandaStream';
import { getLatestCoinbaseTicks } from '@/lib/coinbaseStream';

/**
 * @fileOverview Institutional Position Closure API
 * Enforces unified pricing: BUY closes at BID, SELL closes at ASK.
 * Uses memory-buffer price capture for zero-latency accuracy.
 */

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    
    if (!token) return NextResponse.json({ error: "Authentication token is required" }, { status: 401 });

    let uid: string;
    try {
      const decoded = await getAdminAuth().verifyIdToken(token);
      uid = decoded.uid;
    } catch (err: any) {
      console.error('[Close-Trade-Auth] JWT Verification Failed:', err.message);
      return NextResponse.json({ error: "Invalid or expired session. Please re-login." }, { status: 401 });
    }

    const db = getAdminDb();
    const tradeRef = db.collection("demoTrades").doc(id);
    const tradeSnap = await tradeRef.get();
    
    if (!tradeSnap.exists) return NextResponse.json({ error: "Trade execution record not found" }, { status: 404 });
    const trade = tradeSnap.data()!;
    
    if (trade.userId !== uid) return NextResponse.json({ error: "Access Denied: Trader identity mismatch" }, { status: 403 });
    if (trade.status !== "open") return NextResponse.json({ error: "Position already closed" }, { status: 400 });

    const sym = trade.symbol.toUpperCase().trim();
    
    // 1. CAPTURE PRICE FROM MEMORY BUFFER (Near-Zero Latency)
    const memTick = getLatestOandaTicks()[sym] || getLatestCoinbaseTicks()[sym];

    const result = await db.runTransaction(async (tx) => {
      // 2. FETCH FEED FALLBACK
      const liveRef = db.collection('livePrices').doc(sym);
      const liveSnap = await tx.get(liveRef);
      let feed = memTick || (liveSnap.exists ? liveSnap.data() : null);

      if (!feed) {
        const marketRef = db.collection('market').doc(sym);
        const marketSnap = await tx.get(marketRef);
        feed = marketSnap.exists ? marketSnap.data() : null;
      }

      if (!feed || !feed.bid || !feed.ask) {
        throw new Error(`Market liquidity offline for ${sym}. Please try again in a moment.`);
      }

      // ── UNIFIED PRICING LOGIC ──
      // BUY positions close at BID, SELL positions close at ASK
      const authoritativePrice = trade.type === 'buy' ? feed.bid : feed.ask;
      
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
        closedAt: FieldValue.serverTimestamp(),
      });

      const accUpdates: any = {
        balance: FieldValue.increment(finalPnL),
        updatedAt: FieldValue.serverTimestamp()
      };

      // Ensure dailyGrossLossUsd is updated for risk auditing
      if (finalPnL < 0) {
        accUpdates.dailyGrossLossUsd = FieldValue.increment(Math.abs(finalPnL));
      }

      tx.update(accRef, accUpdates);
      
      return { pnl: finalPnL, closePrice: authoritativePrice };
    });

    // 3. Trigger immediate risk audit
    await auditDemoAccount(trade.accountId);

    return NextResponse.json({ ok: true, ...result });
  } catch (error: any) {
    console.error('[Close-Trade-API] Fatal Error:', error);
    
    // Check for specific Firestore/gRPC errors that might indicate auth issues
    if (error.message?.includes('refresh access token') || error.message?.includes('Getting metadata from plugin failed')) {
      return NextResponse.json({ 
        error: "Terminal Authentication Fault: The server could not reach the risk engine. Our team has been notified. Please refresh and try again." 
      }, { status: 500 });
    }

    return NextResponse.json({ error: error.message || "Internal Terminal Error" }, { status: 500 });
  }
}
