import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { auditDemoAccount } from '@/lib/rulesEngine';
import { getLatestOandaTicks } from '@/lib/oandaStream';
import { getLatestCoinbaseTicks } from '@/lib/coinbaseStream';

/**
 * @fileOverview Institutional Order Execution API (V7 - Stale Feed Hardened)
 * Prevents execution on stale prices by checking both database and high-frequency 
 * memory buffers. Rejects orders if feed age exceeds 10 seconds.
 */

const MAX_LOTS: Record<string, number> = {
  '5k': 0.25, '10k': 0.5, '25k': 1.25, '50k': 2.5, '100k': 5.0, '200k': 10.0, '300k': 15.0,
};

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    let uid: string;
    try {
      const decoded = await getAdminAuth().verifyIdToken(token);
      uid = decoded.uid;
    } catch (err) {
      return NextResponse.json({ error: "Session expired" }, { status: 401 });
    }

    const db = getAdminDb();
    const body = await req.json().catch(() => ({}));
    const { accountId, symbol, type, lots: rawLots, sl, tp, witnessPrice } = body;

    if (!accountId || !symbol || !type || !rawLots) {
      return NextResponse.json({ error: "Missing execution parameters" }, { status: 400 });
    }

    const symUpper = symbol.toUpperCase().trim();
    const lots = parseFloat(String(rawLots));

    // 1. GLOBAL EXECUTION LOCK
    const activeLockRef = db.collection('_locks').doc(uid);
    const lockSnap = await activeLockRef.get();
    if (lockSnap.exists && (Date.now() - lockSnap.data()!.timestamp < 2000)) {
      return NextResponse.json({ error: "Execution in progress..." }, { status: 429 });
    }
    await activeLockRef.set({ timestamp: Date.now(), accountId });

    const result = await db.runTransaction(async (tx) => {
      // 2. FETCH PRICE (Strict Freshness check against DB and Memory)
      const liveRef = db.collection('livePrices').doc(symUpper);
      const liveSnap = await tx.get(liveRef);
      
      const oandaMem = getLatestOandaTicks()[symUpper];
      const cryptoMem = getLatestCoinbaseTicks()[symUpper];
      const memTick = oandaMem || cryptoMem;
      
      let feed = liveSnap.exists ? liveSnap.data() : null;

      // Prefer high-frequency memory ticks if they are fresher than DB records
      if (memTick) {
        const dbTime = feed?.updatedAt?.toMillis ? feed.updatedAt.toMillis() : (feed?.updatedAt || 0);
        const memTime = memTick.updatedAt || 0;
        
        if (!feed || memTime > dbTime) {
          feed = { ...feed, ...memTick };
        }
      }

      if (!feed || !feed.bid || !feed.ask) {
        throw new Error(`Liquidity source offline for ${symUpper}. (No Data)`);
      }

      // ── CRITICAL FRESHNESS GUARD ──
      const priceUpdatedAt = feed.updatedAt?.toMillis ? feed.updatedAt.toMillis() : (feed.updatedAt || 0);
      const priceAgeSeconds = (Date.now() - priceUpdatedAt) / 1000;

      // Debugging logs for stale check analysis
      console.log(`[RiskEngine-Debug] Executing Trade for ${symUpper}`);
      console.log(`  Current Server Time: ${new Date().toISOString()}`);
      console.log(`  Market Timestamp:    ${new Date(priceUpdatedAt).toISOString()}`);
      console.log(`  Price Age (s):       ${priceAgeSeconds.toFixed(1)}s`);
      console.log(`  Source:              ${memTick && memTick.updatedAt === priceUpdatedAt ? 'Memory' : 'Firestore'}`);

      if (priceAgeSeconds > 10) {
        console.error(`[STALE-PRICE-REJECTION] Symbol: ${symUpper}, Age: ${priceAgeSeconds.toFixed(1)}s, Price: ${feed.price}`);
        throw new Error(`Market feed is stale (${priceAgeSeconds.toFixed(0)}s old). Please wait for network sync.`);
      }

      // ── BLACKLIST GUARD ──
      if (Math.abs(feed.price - 4185.658) < 0.001) {
        throw new Error("System blocked execution on bugged price marker (4185.658). Check sync workers.");
      }

      const executionPrice = type === 'buy' ? feed.ask : feed.bid;

      // ── WITNESS VALIDATION ──
      if (witnessPrice && Math.abs(executionPrice - witnessPrice) / witnessPrice > 0.02) {
        throw new Error(`Price deviation too high (Witness: ${witnessPrice}, Server: ${executionPrice}). Re-try in a moment.`);
      }

      console.log(`[EXECUTION-SUCCESS] UID: ${uid} | ${symUpper} | ${type.toUpperCase()} | Entry: ${executionPrice}`);

      const accRef = db.collection("demoAccounts").doc(accountId);
      const accSnap = await tx.get(accRef);
      if (!accSnap.exists) throw new Error("Trading node not found");
      const account = accSnap.data()!;

      const rawPlan = String(account.plan || '10k');
      const planKey = rawPlan.toLowerCase().trim().replace('$', '');
      const maxAllowed = MAX_LOTS[planKey] || 0.5;
      if (lots > maxAllowed) throw new Error(`Lot Violation: Max ${maxAllowed} for ${rawPlan}`);

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

    await activeLockRef.delete();
    await auditDemoAccount(accountId);

    return NextResponse.json({ ok: true, ...result });
  } catch (error: any) {
    console.error('[Trade-API-Failure]', error.message);
    return NextResponse.json({ error: error.message || "Execution Fault" }, { status: 500 });
  }
}
