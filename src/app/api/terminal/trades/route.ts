import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { auditDemoAccount } from '@/lib/rulesEngine';
import { getAuthoritativePrice } from '@/lib/priceSync';

/**
 * @fileOverview Institutional Order Execution API (V11 - Hardened Admin Execution)
 * Enforces strict server-side validation and executes trades via the Admin SDK 
 * to ensure 100% permission availability regardless of client state.
 */

const MAX_LOTS: Record<string, number> = {
  '5k': 0.25, '10k': 0.5, '25k': 1.25, '50k': 2.5, '100k': 5.0, '200k': 10.0, '300k': 15.0,
};

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    const auth = getAdminAuth();
    const db = getAdminDb();
    
    if (!auth || !db) {
      return NextResponse.json({ error: "Terminal services temporarily unavailable. Please retry." }, { status: 503 });
    }

    let uid: string;
    try {
      const decoded = await auth.verifyIdToken(token);
      uid = decoded.uid;
    } catch (err) {
      return NextResponse.json({ error: "Invalid or expired session. Please re-login." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { accountId, symbol, type, lots: rawLots, sl, tp, witnessPrice } = body;

    if (!accountId || !symbol || !type || !rawLots) {
      return NextResponse.json({ error: "Missing execution parameters" }, { status: 400 });
    }

    const symUpper = symbol.toUpperCase().trim();
    const lots = parseFloat(String(rawLots));

    // 1. EXECUTION CONCURRENCY LOCK
    const activeLockRef = db.collection('_locks').doc(uid);
    const lockSnap = await activeLockRef.get();
    if (lockSnap.exists && (Date.now() - (lockSnap.data()?.timestamp || 0) < 2000)) {
      return NextResponse.json({ error: "An execution is already in progress. Please wait." }, { status: 429 });
    }
    await activeLockRef.set({ timestamp: Date.now(), accountId });

    // 2. FETCH AUTHORITATIVE PRICE
    const feed = await getAuthoritativePrice(symUpper);

    if (!feed || !feed.bid || !feed.ask) {
      await activeLockRef.delete();
      return NextResponse.json({ error: `Market liquidity offline for ${symUpper}.` }, { status: 503 });
    }

    const priceAgeSeconds = (Date.now() - feed.updatedAt) / 1000;
    if (priceAgeSeconds > 10) {
      await activeLockRef.delete();
      return NextResponse.json({ 
        error: `Market feed is stale (${priceAgeSeconds.toFixed(0)}s old). Please retry.` 
      }, { status: 503 });
    }

    const executionPrice = type === 'buy' ? feed.ask : feed.bid;

    // 3. WITNESS VALIDATION (Prevent extreme slippage/latency arbitrage)
    if (witnessPrice && Math.abs(executionPrice - witnessPrice) / witnessPrice > 0.05) {
      await activeLockRef.delete();
      return NextResponse.json({ error: "Price deviation too high. Execution aborted to protect your capital." }, { status: 409 });
    }

    const result = await db.runTransaction(async (tx) => {
      const accRef = db.collection("demoAccounts").doc(accountId);
      const accSnap = await tx.get(accRef);
      if (!accSnap.exists) throw new Error("Trading node not found in registry.");
      const account = accSnap.data()!;

      // HARD SECURITY GUARD: Restrict execution to ACTIVE or PASSED accounts only
      if (account.status !== 'active' && account.status !== 'passed') {
        throw new Error(`Execution Blocked: Current status is ${account.status.toUpperCase()}. No new orders permitted.`);
      }

      const rawPlan = String(account.plan || '10k');
      const planKey = rawPlan.toLowerCase().trim().replace('$', '');
      const maxAllowed = MAX_LOTS[planKey] || 0.5;
      if (lots > maxAllowed) throw new Error(`Lot Violation: Maximum ${maxAllowed} lots permitted for ${rawPlan} tier.`);

      const commission = (() => {
        const isForex = !['XAUUSD','BTCUSD','ETHUSD','XRPUSD','SOLUSD','DOGEUSD','ADAUSD','BNBUSD','XAGUSD','XPTUSD'].includes(symUpper);
        if (isForex) return lots * 5; 
        if (symUpper === 'XAUUSD') return lots * 0.30; 
        return (lots * executionPrice) * 0.0005; 
      })();

      const tradeRef = db.collection("demoTrades").doc();
      tx.set(tradeRef, {
        id: tradeRef.id,
        userId: uid,
        accountId,
        symbol: symUpper,
        type,
        lots,
        openPrice: executionPrice,
        openBid: feed.bid,
        openAsk: feed.ask,
        commission,
        sl: sl ? parseFloat(String(sl)) : null,
        tp: tp ? parseFloat(String(tp)) : null,
        status: "open",
        pnl: 0,
        openedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });

      tx.update(accRef, {
        balance: FieldValue.increment(-commission),
        updatedAt: FieldValue.serverTimestamp()
      });

      return { tradeId: tradeRef.id, openPrice: executionPrice };
    });

    // 4. CLEANUP & AUDIT
    await activeLockRef.delete();
    auditDemoAccount(accountId).catch(() => {});

    return NextResponse.json({ ok: true, ...result });
  } catch (error: any) {
    console.error('[Trade-API-Failure]', error.message);
    return NextResponse.json({ 
      error: error.message || "An internal execution fault occurred. Your account has not been charged." 
    }, { status: 500 });
  }
}
