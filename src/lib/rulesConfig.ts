/**
 * @fileOverview Institutional Rules Configuration
 * Single source of truth for all plan thresholds and risk protocols.
 */
export type PlanPhaseRules = {
  profitTarget?: number;
  dailyDrawdown: number;
  maxDrawdown: number;
  minTradingDays?: number;
  minTradingDaysBeforePayout?: number;
  maxFloatingLoss?: number;       // % of initial balance, per SINGLE open trade
  maxSingleTradeLoss?: number;    // % of initial balance, per SINGLE trade (closed)
  minDailyTrades?: number;
  accountExpiryDays?: number;     // Days until account automatically closes
  minTradesPerSymbolForPayout?: number; // New: 5 trades per symbol for payout
};

export const RULES_CONFIG = {
  plans: {
    "1-step-pro": {
      evaluation: {
        profitTarget: 10,
        dailyDrawdown: 3,
        maxDrawdown: 6,
        minTradingDays: 5
      },
      funded: {
        dailyDrawdown: 3,
        maxDrawdown: 6, // Updated to 6% as per latest spec
        minTradingDaysBeforePayout: 5
      }
    },
    "2-step-classic": {
      phase1: {
        profitTarget: 8, // Updated
        dailyDrawdown: 5,
        maxDrawdown: 10,
        minTradingDays: 5,
        maxSingleTradeLoss: 3
      },
      phase2: {
        profitTarget: 5, // Updated
        dailyDrawdown: 5,
        maxDrawdown: 10,
        minTradingDays: 5,
        maxSingleTradeLoss: 3
      },
      funded: {
        dailyDrawdown: 5,
        maxDrawdown: 10,
        minTradingDaysBeforePayout: 5,
        maxSingleTradeLoss: 3
      }
    },
    "3-step-classic": {
      phase1: {
        profitTarget: 10,
        dailyDrawdown: 4,
        maxDrawdown: 8,
        minTradingDays: 7,
        maxSingleTradeLoss: 3
      },
      phase2: {
        profitTarget: 8,
        dailyDrawdown: 4,
        maxDrawdown: 8,
        minTradingDays: 6,
        maxSingleTradeLoss: 3
      },
      phase3: {
        profitTarget: 5,
        dailyDrawdown: 4,
        maxDrawdown: 8,
        minTradingDays: 5,
        maxSingleTradeLoss: 3
      },
      funded: {
        dailyDrawdown: 4,
        maxDrawdown: 8,
        minTradingDaysBeforePayout: 5,
        maxSingleTradeLoss: 3
      }
    },
    "instant-funding": {
      funded: {
        dailyDrawdown: 3,
        maxDrawdown: 4,
        maxFloatingLoss: 1,
        maxSingleTradeLoss: 3,
        accountExpiryDays: 30,
        minTradesPerSymbolForPayout: 5
      }
    },
    "instant-pro": {
      funded: {
        dailyDrawdown: 3,
        maxDrawdown: 5,
        maxFloatingLoss: 1,
        maxSingleTradeLoss: 3,
        minTradingDaysBeforePayout: 7,
        minDailyTrades: 3,
        minTradesPerSymbolForPayout: 5
      }
    }
  } as Record<string, Record<string, PlanPhaseRules>>,
  universal: {
    minTradeDurationSeconds: 120,
    maxExecutionFrequencySeconds: 180,
    noMartingale: true,
    noFridayOvernightHolding: true
  }
};

/**
 * Standardizes raw plan names from Firestore to rule keys.
 */
export function getPlanKey(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('1-step')) return '1-step-pro';
  if (n.includes('2-step')) return '2-step-classic';
  if (n.includes('3-step')) return '3-step-classic';
  if (n.includes('instant-pro')) return 'instant-pro';
  if (n.includes('instant')) return 'instant-funding';
  return '1-step-pro';
}
