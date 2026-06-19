
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
  maxFloatingLoss?: number;
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
        maxDrawdown: 4,
        minTradingDaysBeforePayout: 5,
        maxFloatingLoss: 1
      }
    },
    "2-step-classic": {
      phase1: {
        profitTarget: 8,
        dailyDrawdown: 5,
        maxDrawdown: 10,
        minTradingDays: 5
      },
      phase2: {
        profitTarget: 5,
        dailyDrawdown: 5,
        maxDrawdown: 10,
        minTradingDays: 5
      },
      funded: {
        dailyDrawdown: 5,
        maxDrawdown: 10,
        minTradingDaysBeforePayout: 5,
        maxFloatingLoss: 1
      }
    },
    "3-step-classic": {
      phase1: {
        profitTarget: 10,
        dailyDrawdown: 4,
        maxDrawdown: 8,
        minTradingDays: 7
      },
      phase2: {
        profitTarget: 8,
        dailyDrawdown: 4,
        maxDrawdown: 8,
        minTradingDays: 6
      },
      phase3: {
        profitTarget: 5,
        dailyDrawdown: 4,
        maxDrawdown: 8,
        minTradingDays: 5
      },
      funded: {
        dailyDrawdown: 4,
        maxDrawdown: 8,
        minTradingDaysBeforePayout: 5,
        maxFloatingLoss: 1
      }
    },
    "instant-funding": {
      evaluation: {
        dailyDrawdown: 3,
        maxDrawdown: 4,
        maxFloatingLoss: 1
      },
      funded: {
        dailyDrawdown: 3,
        maxDrawdown: 4,
        maxFloatingLoss: 1
      }
    }
  } as Record<string, Record<string, PlanPhaseRules>>,
  universal: {
    maxSingleTradeLossPct: 3,
    minTradeDurationSeconds: 120,
    maxExecutionFrequencySeconds: 180,
    noMartingale: true
  },
  instantSpecial: {
    noFridayOvernightHolding: true // Warning only
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
  if (n.includes('instant')) return 'instant-funding';
  return '1-step-pro';
}
