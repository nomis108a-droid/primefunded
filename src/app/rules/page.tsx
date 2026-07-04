"use client"

import { useMemo, useEffect, useState } from 'react';
import { Navigation } from '@/components/Navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Check, Shield, AlertTriangle, Target, Skull, AlertCircle, Info } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';

const PLAN_RULES = {
  '1-step': {
    evaluation: [
      { text: "10% profit target", type: 'check' },
      { text: "Do not lose more than 3% of your starting balance in a single day", type: 'check' },
      { text: "Do not lose more than 6% of your starting balance in total", type: 'check' },
      { text: "Trading Leverage: 1:100", type: 'check' },
      { text: "Minimum 5 trading days required", type: 'check' },
      { text: "Maximum 1 execution every 3 minutes", type: 'warning' },
      { text: "Hold trades for at least 2 minutes", type: 'warning' },
      { text: "No martingale allowed (Account Breach)", type: 'skull' },
    ],
    funded: [
      { text: "80% profit split", type: 'check' },
      { text: "Trading Leverage: 1:30", type: 'check' },
      { text: "Minimum 5 trading days required before payout request", type: 'warning' },
      { text: "Friday overnight holding of Forex/Metal positions after Friday 21:00 UTC results in account breach. Crypto is exempt.", type: 'warning' },
      { text: "1% max floating loss per trade safety closure active", type: 'warning' },
      { text: "No martingale allowed (Account Breach)", type: 'skull' },
    ]
  },
  '2-step': {
    evaluation: [
      { text: "8% profit target (Phase 1) / 5% (Phase 2)", type: 'check' },
      { text: "Do not lose more than 5% of your starting balance in a single day", type: 'check' },
      { text: "Do not lose more than 10% of your starting balance in total", type: 'check' },
      { text: "Trading Leverage: 1:100", type: 'check' },
      { text: "Minimum 5 trading days required", type: 'check' },
      { text: "Maximum 1 execution every 3 minutes", type: 'warning' },
      { text: "No martingale allowed (Account Breach)", type: 'skull' },
    ],
    funded: [
      { text: "80% profit split", type: 'check' },
      { text: "Trading Leverage: 1:30", type: 'check' },
      { text: "Minimum 5 trading days required before payout request", type: 'warning' },
      { text: "No martingale allowed (Account Breach)", type: 'skull' },
    ]
  },
  '3-step': {
    evaluation: [
      { text: "10% target (P1) / 8% (P2) / 5% (P3)", type: 'check' },
      { text: "Do not lose more than 4% of your starting balance in a single day", type: 'check' },
      { text: "Do not lose more than 8% of your starting balance in total", type: 'check' },
      { text: "Minimum 7 trading days required", type: 'check' },
      { text: "No martingale allowed (Account Breach)", type: 'skull' },
    ],
    funded: [
      { text: "Up to 100% profit split", type: 'check' },
      { text: "Trading Leverage: 1:30", type: 'check' },
      { text: "Minimum 5 trading days required before payout request", type: 'warning' },
      { text: "No martingale allowed (Account Breach)", type: 'skull' },
    ]
  },
  'instant': {
    evaluation: [
      { text: "No evaluation - Start Funded immediately", type: 'check' },
      { text: "Do not lose more than 3% of your starting balance in a single day", type: 'check' },
      { text: "Do not lose more than 4% of your starting balance in total", type: 'check' },
      { text: "If any single trade loses more than 1% of your balance, it will be automatically closed", type: 'warning' },
      { text: "Minimum 5 trades per symbol required for payout", type: 'warning' },
      { text: "Account valid for 30 days. Expires automatically if not passed.", type: 'skull' },
    ],
    funded: [
      { text: "70% profit split", type: 'check' },
      { text: "Daily payouts after 24 hours", type: 'check' },
      { text: "Maximum 1 withdrawal request per 24 hours", type: 'warning' },
      { text: "Trading is suspended while a payout request is being processed", type: 'warning' },
      { text: "Friday overnight holding of Forex/Metal after 21:00 UTC (Account Breach)", type: 'skull' },
    ]
  },
  'instant-pro': {
    evaluation: [
      { text: "No evaluation - Start Funded immediately", type: 'check' },
      { text: "Do not lose more than 3% of your starting balance in a single day", type: 'check' },
      { text: "Do not lose more than 5% of your starting balance in total", type: 'check' },
      { text: "A trading day only counts if you completed at least 3 trades that day", type: 'warning' },
      { text: "Minimum 5 trades per symbol required for payout", type: 'warning' },
    ],
    funded: [
      { text: "80% profit split", type: 'check' },
      { text: "Daily payouts available", type: 'check' },
      { text: "You need 7 qualified trading days (3+ trades each) before requesting payout", type: 'warning' },
      { text: "Maximum 1 withdrawal request per 24 hours", type: 'warning' },
      { text: "No martingale allowed (Account Breach)", type: 'skull' },
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
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 max-w-6xl">
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
          </TabsContent>
        </Tabs>
      </main>
    </div>
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
          {items.map((item, idx) => (
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
