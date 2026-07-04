"use client"

import { useMemo, useEffect, useState } from 'react';
import { Navigation } from '@/components/Navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Check, Shield, AlertTriangle, Target, Skull, AlertCircle, Info, ShieldAlert, Zap } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';

const PLAN_RULES = {
  '1-step': {
    evaluation: [
      { text: "10% profit target", type: 'check' },
      { text: "3% daily drawdown limit", type: 'warning' },
      { text: "6% maximum drawdown", type: 'warning' },
      { text: "Trading Leverage: 1:100", type: 'check' },
      { text: "Instruments: Fx, Commodities, Indices, Stock, Crypto", type: 'check' },
      { text: "Minimum 5 trading days required", type: 'check' },
      { text: "Maximum 1 execution every 3 minutes", type: 'warning' },
      { text: "Hold trades for at least 2 minutes", type: 'warning' },
      { text: "No time limit", type: 'check' },
      { text: "No martingale allowed (Soft Breach)", type: 'skull' },
    ],
    funded: [
      { text: "80% profit split", type: 'check' },
      { text: "Trading Leverage: 1:30", type: 'check' },
      { text: "Instruments: Fx, Commodities, Indices, Stock, Crypto", type: 'check' },
      { text: "Minimum 5 trading days required before payout request", type: 'check' },
      { text: "1 execution per 3 mins maximum (Hard Breach)", type: 'warning' },
      { text: "No closing trades within 2 mins (Hard Breach)", type: 'warning' },
      { text: "1% max floating loss (Hard Breach)", type: 'warning' },
      { text: "3% daily drawdown limit (Hard Breach)", type: 'skull' },
      { text: "6% max drawdown limit (Hard Breach)", type: 'skull' },
      { text: "No martingale (Hard Breach)", type: 'skull' },
    ]
  },
  '2-step': {
    evaluation: [
      { text: "8% target (Phase 1) / 5% (Phase 2)", type: 'check' },
      { text: "5% daily drawdown limit", type: 'warning' },
      { text: "10% maximum drawdown", type: 'warning' },
      { text: "Trading Leverage: 1:100", type: 'check' },
      { text: "Minimum 5 trading days required", type: 'check' },
      { text: "No martingale allowed (Soft Breach)", type: 'skull' },
    ],
    funded: [
      { text: "80% profit split", type: 'check' },
      { text: "Trading Leverage: 1:30", type: 'check' },
      { text: "Minimum 5 trading days required before payout request", type: 'check' },
      { text: "No martingale (Hard Breach)", type: 'skull' },
    ]
  },
  '3-step': {
    evaluation: [
      { text: "10% (P1) / 8% (P2) / 5% (P3) targets", type: 'check' },
      { text: "4% daily drawdown limit", type: 'warning' },
      { text: "8% maximum drawdown", type: 'warning' },
      { text: "Minimum 7 trading days required", type: 'check' },
      { text: "No martingale allowed (Soft Breach)", type: 'skull' },
    ],
    funded: [
      { text: "Up to 100% profit split", type: 'check' },
      { text: "Trading Leverage: 1:30", type: 'check' },
      { text: "No martingale (Hard Breach)", type: 'skull' },
    ]
  },
  'instant': {
    evaluation: [
      { text: "No evaluation - Start Funded immediately", type: 'check' },
      { text: "3% daily drawdown limit", type: 'warning' },
      { text: "4% maximum drawdown", type: 'warning' },
      { text: "1% max floating loss safety closure", type: 'warning' },
      { text: "Minimum 5 trades per symbol required for payout", type: 'check' },
      { text: "Account valid for 30 days", type: 'skull' },
    ],
    funded: [
      { text: "70% profit split", type: 'check' },
      { text: "Daily payouts after 24 hours", type: 'check' },
      { text: "Friday overnight holding restricted", type: 'skull' },
      { text: "No martingale (Hard Breach)", type: 'skull' },
    ]
  },
  'instant-pro': {
    evaluation: [
      { text: "No evaluation - Start Funded immediately", type: 'check' },
      { text: "3% daily drawdown limit", type: 'warning' },
      { text: "5% maximum drawdown", type: 'warning' },
      { text: "Minimum 3 trades per day for day to count", type: 'check' },
      { text: "Minimum 5 trades per symbol required for payout", type: 'check' },
    ],
    funded: [
      { text: "80% profit split", type: 'check' },
      { text: "Daily payouts available", type: 'check' },
      { text: "7 qualified trading days required", type: 'check' },
      { text: "No martingale (Hard Breach)", type: 'skull' },
    ]
  }
};

export default function RulesPage() {
  const { userData } = useAuth();
  const [activePlan, setActivePlan] = useState('1-step');

  useEffect(() => {
    if (userData?.accountPlan) {
      const p = userData.accountPlan.toLowerCase();
      if (p.includes('1-step')) setActivePlan('1-step');
      else if (p.includes('2-step')) setActivePlan('2-step');
      else if (p.includes('3-step')) setActivePlan('3-step');
      else if (p.includes('instant-pro')) setActivePlan('instant-pro');
      else if (p.includes('instant')) setActivePlan('instant');
    }
  }, [userData]);

  const currentPhase = userData?.phase || 'evaluation';

  return (
    <div className="flex min-h-screen bg-background">
      <Navigation />
      <main className="flex-1 p-8 overflow-y-auto custom-scrollbar">
        <header className="mb-10">
          <h1 className="text-3xl font-headline font-bold mb-1 text-white uppercase tracking-tighter">Trading Rules</h1>
          <p className="text-muted-foreground text-sm">Institutional risk protocols and performance benchmarks.</p>
        </header>

        <Tabs value={activePlan} onValueChange={setActivePlan} className="space-y-12">
          <TabsList className="bg-secondary/40 border border-white/5 p-1 h-14 w-full max-w-5xl justify-start overflow-x-auto no-scrollbar">
            <TabsTrigger value="1-step" className="h-full px-8 font-bold text-white data-[state=active]:bg-primary data-[state=active]:text-black transition-all rounded-lg">1-Step Pro</TabsTrigger>
            <TabsTrigger value="2-step" className="h-full px-8 font-bold text-white data-[state=active]:bg-primary data-[state=active]:text-black transition-all rounded-lg">2-Step Classic</TabsTrigger>
            <TabsTrigger value="3-step" className="h-full px-8 font-bold text-white data-[state=active]:bg-primary data-[state=active]:text-black transition-all rounded-lg">3-Step Classic</TabsTrigger>
            <TabsTrigger value="instant" className="h-full px-8 font-bold text-white data-[state=active]:bg-primary data-[state=active]:text-black transition-all rounded-lg">Instant Funding</TabsTrigger>
            <TabsTrigger value="instant-pro" className="h-full px-8 font-bold text-white data-[state=active]:bg-primary data-[state=active]:text-black transition-all rounded-lg">Instant Pro</TabsTrigger>
          </TabsList>

          <TabsContent value={activePlan} className="m-0">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 max-w-6xl mb-20">
              <RuleCard 
                title="Evaluation Phase" 
                items={PLAN_RULES[activePlan as keyof typeof PLAN_RULES]?.evaluation} 
                variant="evaluation"
                isCurrent={currentPhase === 'evaluation' || currentPhase === 'phase1' || currentPhase === 'phase2' || currentPhase === 'phase3'}
              />
              <RuleCard 
                title="Funded Stage" 
                items={PLAN_RULES[activePlan as keyof typeof PLAN_RULES]?.funded} 
                variant="funded"
                isCurrent={currentPhase === 'funded'}
              />
            </div>

            <section className="max-w-6xl">
              <div className="flex items-center gap-3 mb-8">
                 <ShieldAlert className="w-6 h-6 text-primary" />
                 <h2 className="text-3xl font-headline font-bold text-white uppercase tracking-tighter">Breach Protocol</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <Card className="bg-destructive/5 border-destructive/20 p-8 space-y-6">
                   <div className="flex items-center gap-3">
                      <div className="p-2 bg-destructive/10 rounded-lg text-destructive">
                        <Skull className="w-5 h-5" />
                      </div>
                      <h3 className="text-xl font-bold text-white">Hard Breach</h3>
                   </div>
                   <p className="text-sm text-muted-foreground leading-relaxed">
                     Violating hard rules results in immediate liquidation of your trading account. The account is terminated, and all profits are forfeited. No appeals are permitted for hard breaches.
                   </p>
                   <ul className="space-y-3">
                      <BreachItem text="Daily Drawdown limit reached" />
                      <BreachItem text="Maximum Drawdown limit reached" />
                      <BreachItem text="Unauthorized Martingale / Grid trading" />
                      <BreachItem text="Frequency or Duration violation" />
                   </ul>
                </Card>

                <Card className="bg-primary/5 border-primary/20 p-8 space-y-6">
                   <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded-lg text-primary">
                        <Zap className="w-5 h-5" />
                      </div>
                      <h3 className="text-xl font-bold text-white">Soft Breach</h3>
                   </div>
                   <p className="text-sm text-muted-foreground leading-relaxed">
                     Soft rules are designed to protect your evaluation. Violating a soft rule results in a formal warning or a reset of the evaluation phase without terminating your eligibility for funding.
                   </p>
                   <ul className="space-y-3">
                      <BreachItem text="Holding over the weekend (on specific plans)" />
                      <BreachItem text="Copying unauthorized external signals" />
                      <BreachItem text="Inconsistent execution patterns" />
                   </ul>
                </Card>
              </div>
            </section>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function BreachItem({ text }: { text: string }) {
  return (
    <li className="flex items-center gap-3 text-xs font-semibold text-zinc-300">
      <div className="w-1.5 h-1.5 rounded-full bg-current opacity-40" />
      {text}
    </li>
  );
}

function RuleCard({ title, items = [], variant, isCurrent }: { title: string, items?: any[], variant: 'evaluation' | 'funded', isCurrent: boolean }) {
  const isEvaluation = variant === 'evaluation';
  
  return (
    <div className="relative">
      {isCurrent && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20">
          <Badge className="bg-primary text-black text-[9px] font-black uppercase px-4 py-1.5 rounded-full shadow-[0_0_15px_rgba(17,179,245,0.6)] animate-in fade-in zoom-in duration-500">
            Your Current Stage
          </Badge>
        </div>
      )}

      <Card className={cn(
        "h-full bg-card/30 transition-all duration-500 overflow-hidden",
        isEvaluation 
          ? "border-primary/40 shadow-[inset_0_0_20px_rgba(17,179,245,0.05)]" 
          : "border-destructive/20 shadow-[inset_0_0_20px_rgba(239,68,68,0.02)]",
        isCurrent && (isEvaluation ? "ring-2 ring-primary/40 ring-offset-4 ring-offset-background" : "ring-2 ring-destructive/40 ring-offset-4 ring-offset-background")
      )}>
        <CardHeader className="border-b border-white/5 py-8 px-10">
          <CardTitle className={cn(
            "text-3xl font-headline font-bold flex items-center gap-4",
            isEvaluation ? 'text-white' : 'text-destructive/80'
          )}>
            <div className={cn(
              "p-2 rounded-xl border",
              isEvaluation ? "bg-primary/10 border-primary/20 text-primary" : "bg-destructive/10 border-destructive/20 text-destructive"
            )}>
              {isEvaluation ? <Target className="w-6 h-6" /> : <Skull className="w-6 h-6" />}
            </div>
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-10 pb-12 px-10 space-y-6">
          {items.map((item: any, idx: number) => (
            <div key={idx} className="flex items-start gap-4 group">
              <div className={cn(
                "mt-0.5 transition-transform duration-300 group-hover:scale-110",
                item.type === 'check' ? 'text-emerald-500' : item.type === 'warning' ? 'text-amber-500' : 'text-destructive'
              )}>
                {item.type === 'check' ? (
                  <Check className="w-5 h-5" />
                ) : item.type === 'warning' ? (
                  <AlertTriangle className="w-5 h-5" />
                ) : (
                  <Skull className="w-5 h-5" />
                )}
              </div>
              <span className={cn(
                "text-sm font-semibold tracking-tight transition-colors",
                item.type === 'check' ? 'text-zinc-300 group-hover:text-white' : 
                item.type === 'warning' ? 'text-amber-200/80 group-hover:text-amber-200' : 
                'text-destructive/80 group-hover:text-destructive'
              )}>
                {item.text}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
