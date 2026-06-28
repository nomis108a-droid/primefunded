import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { RULES_CONFIG, getPlanKey } from '@/lib/rulesConfig';

/**
 * @fileOverview Institutional SL/TP & Risk Engine
 * Continuous monitoring of open positions, floating P&L, and daily drawdown.
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

    let closedCount = 0;
    let breaches = 0;

    for (const accDoc of activeAccountsSnap.docs) {
      const acc = accDoc.data();
      const trades = accountTrades[accDoc.id] || [];
      
      // Get Institutional Rules
      const planKey = getPlanKey(acc.planType || acc.plan || '1-step-pro');
      const phase = acc.phase || 'evaluation';
      const rules = RULES_CONFIG.plans[planKey]?.[phase] || RULES_CONFIG.plans['1-step-pro']['evaluation'];

      // 1. Calculate REAL-TIME Equity
      let floatingPnl = 0;
      for (const t of trades) {
        floatingPnl += calculateTradePnl(t, prices[t.symbol]);
      }
      const currentEquity = acc.balance + floatingPnl;

      // 2. CHECK: Daily Drawdown (Recalculated from Daily Start)
      const dailyStart = acc.dailyStartBalance || acc.startBalance;
      const dailyLimitVal = dailyStart * (rules.dailyDrawdown / 100);
      
      if (dailyStart - currentEquity >= dailyLimitVal) {
        await accDoc.ref.update({
          status: 'blown',
          breachReason: `Daily Drawdown Limit Hit: $${dailyLimitVal.toFixed(2)} (${rules.dailyDrawdown}%)`,
          equity: currentEquity,
          updatedAt: FieldValue.serverTimestamp()
        });
        breaches++;
        continue; // Account liquidated, skip SL/TP checks
      }

      // 3. CHECK: Max Total Drawdown
      const maxLimitVal = acc.startBalance * (rules.maxDrawdown / 100);
      if (acc.startBalance - currentEquity >= maxLimitVal) {
        await accDoc.ref.update({
          status: 'blown',
          breachReason: `Maximum Drawdown Limit Hit: $${maxLimitVal.toFixed(2)} (${rules.maxDrawdown}%)`,
          equity: currentEquity,
          updatedAt: FieldValue.serverTimestamp()
        });
        breaches++;
        continue;
      }

      // 4. CHECK: 1% Max Floating Loss (Funded Rule) - BASIS: CURRENT BALANCE
      if (rules.maxFloatingLoss) {
        const floatLimit = acc.balance * (rules.maxFloatingLoss / 100);
        let floatBreach = false;
        for (const t of trades) {
          const tPnl = calculateTradePnl(t, prices[t.symbol]);
          if (tPnl < 0 && Math.abs(tPnl) >= floatLimit) {
            floatBreach = true;
            break;
          }
        }
        if (floatBreach) {
          await accDoc.ref.update({
            status: 'blown',
            breachReason: `Institutional Violation: Individual Floating Loss exceeded ${rules.maxFloatingLoss}% of current balance`,
            equity: currentEquity,
            updatedAt: FieldValue.serverTimestamp()
          });
          breaches++;
          continue;
        }
      }

      // 5. SL/TP Execution
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
            
            tx.update(accDoc.ref, {
              balance: newBalance,
              equity: newBalance,
              updatedAt: FieldValue.serverTimestamp()
            });
          });
          closedCount++;
        }
      }
      
      // Update Equity periodically even if no breach
      await accDoc.ref.update({ equity: currentEquity, updatedAt: FieldValue.serverTimestamp() });
    }

    return NextResponse.json({ 
      success: true, 
      closed: closedCount, 
      breaches, 
      checked: activeAccountsSnap.size 
    });

  } catch (error: any) {
    console.error('[RiskEngine] Critical Failure:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
