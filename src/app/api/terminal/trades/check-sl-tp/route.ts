import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

/**
 * @fileOverview Institutional SL/TP & Gross Risk Engine
 * Continuous monitoring of open positions, realized gross loss, and force-liquidation.
 */

const CONTRACT_SIZE: Record<string, number> = {
  XAUUSD: 100, BTCUSD: 1, ETHUSD: 1, EURUSD: 100000, GBPUSD: 100000, USDJPY: 100000,
};

function getContractSize(symbol: string): number {
  return CONTRACT_SIZE[symbol] || 100000;
}

function calculateTradePnl(trade: any, priceData: any) {
  if (!priceData || !priceData.price) return 0;
  const currentPrice = trade.type === 'buy' ? (priceData.bid || priceData.price) : (priceData.ask || priceData.price);
  const diff = trade.type === 'buy' ? currentPrice - trade.openPrice : trade.openPrice - currentPrice;
  return diff * trade.lots * getContractSize(trade.symbol);
}

export async function GET(req: NextRequest) {
  const key = req.headers.get('x-api-key');
  if (!process.env.TERMINAL_CRON_KEY || key !== process.env.TERMINAL_CRON_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getAdminDb();
  
  try {
    const activeAccountsSnap = await db.collection('demoAccounts').where('status', '==', 'active').get();
    const openTradesSnap = await db.collection('demoTrades').where('status', '==', 'open').get();
    const pricesSnap = await db.collection('livePrices').get();

    const prices: Record<string, any> = {};
    pricesSnap.docs.forEach(d => prices[d.id] = d.data());

    const accountTrades: Record<string, any[]> = {};
    openTradesSnap.docs.forEach(d => {
      const t = { id: d.id, ref: d.ref, ...d.data() };
      if (!accountTrades[t.accountId]) accountTrades[t.accountId] = [];
      accountTrades[t.accountId].push(t);
    });

    let liquidated = 0;
    let sltpClosed = 0;

    for (const accDoc of activeAccountsSnap.docs) {
      const acc = accDoc.data();
      const trades = accountTrades[accDoc.id] || [];
      
      let floatingPnl = 0;
      let floatingNegativePnl = 0;
      
      for (const t of trades) {
        const pnl = calculateTradePnl(t, prices[t.symbol]);
        floatingPnl += pnl;
        if (pnl < 0) floatingNegativePnl += Math.abs(pnl);
      }

      const currentEquity = acc.balance + floatingPnl;
      const virtualDailyLoss = (acc.dailyGrossLossUsd || 0) + floatingNegativePnl;

      let breachReason = null;

      // 1. CHECK: REAL-TIME DAILY GROSS LOSS (Including Negative Floating)
      if (virtualDailyLoss >= acc.dailyLossLimitUsd) {
        breachReason = "daily_drawdown_breach";
      } 
      // 2. CHECK: MAX TOTAL DRAWDOWN (Equity vs Start Balance)
      else if ((acc.startBalance - currentEquity) >= (acc.maxLoss || acc.startBalance * 0.06)) {
        breachReason = "max_drawdown_breach";
      }

      // ── LIQUIDATION PROTOCOL ─────────────────────────────────
      if (breachReason) {
        await db.runTransaction(async (tx) => {
          let finalBalance = acc.balance;
          
          // Force-close every position
          for (const t of trades) {
            const priceData = prices[t.symbol];
            if (!priceData) continue;
            const exitPrice = t.type === 'buy' ? (priceData.bid || priceData.price) : (priceData.ask || priceData.price);
            const tradePnl = (t.type === 'buy' ? exitPrice - t.openPrice : t.openPrice - exitPrice) * t.lots * getContractSize(t.symbol);
            
            tx.update(t.ref, {
              status: 'closed',
              closePrice: exitPrice,
              pnl: tradePnl,
              closedAt: FieldValue.serverTimestamp(),
              liquidated: true
            });
            finalBalance += tradePnl;
          }

          tx.update(accDoc.ref, {
            status: 'blown',
            breachReason,
            balance: finalBalance,
            equity: finalBalance,
            updatedAt: FieldValue.serverTimestamp()
          });
        });
        liquidated++;
        continue; // Skip SL/TP since account is liquidated
      }

      // 3. SL/TP EXECUTION (NORMAL FLOW)
      for (const t of trades) {
        const priceData = prices[t.symbol];
        if (!priceData) continue;

        const bid = priceData.bid || priceData.price;
        const ask = priceData.ask || priceData.price;

        let triggerPrice = 0;
        if (t.type === 'buy') {
          if (t.sl && bid <= t.sl) triggerPrice = bid;
          else if (t.tp && bid >= t.tp) triggerPrice = bid;
        } else {
          if (t.sl && ask >= t.sl) triggerPrice = ask;
          else if (t.tp && ask <= t.tp) triggerPrice = ask;
        }

        if (triggerPrice > 0) {
          const pnl = (t.type === 'buy' ? triggerPrice - t.openPrice : t.openPrice - triggerPrice) * t.lots * getContractSize(t.symbol);
          
          await db.runTransaction(async (tx) => {
            const currentAcc = (await tx.get(accDoc.ref)).data()!;
            const newBalance = currentAcc.balance + pnl;
            
            tx.update(t.ref, {
              status: 'closed',
              closePrice: triggerPrice,
              pnl,
              closedAt: FieldValue.serverTimestamp()
            });

            const updates: any = {
              balance: newBalance,
              equity: newBalance,
              updatedAt: FieldValue.serverTimestamp()
            };

            // Real-time realized loss counter update
            if (pnl < 0) {
              updates.dailyGrossLossUsd = (currentAcc.dailyGrossLossUsd || 0) + Math.abs(pnl);
            }

            // Real-time Profit Target Check (REALIZED ONLY)
            if (newBalance >= (currentAcc.startBalance + currentAcc.profitTarget) && currentAcc.status === 'active') {
              updates.status = 'passed';
            }

            tx.update(accDoc.ref, updates);
          });
          sltpClosed++;
        }
      }
      
      // Heartbeat Equity Update
      await accDoc.ref.update({ equity: currentEquity, updatedAt: FieldValue.serverTimestamp() });
    }

    return NextResponse.json({ 
      success: true, 
      liquidated, 
      sltpClosed, 
      checked: activeAccountsSnap.size 
    });

  } catch (error: any) {
    console.error('[RiskEngine] Critical Failure:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
