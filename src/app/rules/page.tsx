
"use client"

import { useMemo, useEffect, useState } from 'react';
import { Navigation } from '@/components/Navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Check, Shield, AlertTriangle, Target, Skull, AlertCircle, MapPin } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

const PLAN_RULES = {
  '1-step': {
    evaluation: [
      { text: "10% profit target", check: true },
      { text: "3% daily drawdown limit", check: true },
      { text: "6% maximum drawdown", check: true },
      { text: "Trading Leverage: 1:100", check: true },
      { text: "Instruments: Fx, Commodities, Indices, Stock, Crypto", check: true },
      { text: "Minimum 5 trading days required", check: true },
      { text: "Maximum 1 execution every 3 minutes", check: true },
      { text: "Hold trades for at least 2 minutes", check: true },
      { text: "No time limit", check: true },
      { text: "No martingale allowed (Soft Breach)", check: false },
    ],
    funded: [
      { text: "80% profit split", check: true },
      { text: "Trading Leverage: 1:30", check: true },
      { text: "Instruments: Fx, Commodities, Indices, Stock, Crypto", check: true },
      { text: "Minimum 5 trading days required before payout request", warning: true },
      { text: "1 execution per 3 mins maximum (Hard Breach)", warning: true },
      { text: "No closing trades within 2 mins (Hard Breach)", warning: true },
      { text: "1% max floating loss (Hard Breach)", warning: true },
      { text: "3% daily drawdown limit (Hard Breach)", warning: true },
      { text: "6% max drawdown limit (Hard Breach)", warning: true },
      { text: "No martingale (Hard Breach)", check: false },
    ]
  },
  '2-step': {
    phase1: [
      { text: "8% profit target", check: true },
      { text: "5% daily drawdown", check: true },
      { text: "10% max drawdown", check: true },
      { text: "3% max loss per single trade (Hard Breach)", warning: true },
      { text: "1 execution per 3 mins maximum", check: true },
      { text: "Hold trades for at least 2 minutes", check: true },
      { text: "Trading Leverage: 1:100", check: true },
      { text: "Minimum 5 trading days", check: true },
    ],
    phase2: [
      { text: "5% profit target", check: true },
      { text: "5% daily drawdown", check: true },
      { text: "10% max drawdown", check: true },
      { text: "3% max loss per single trade (Hard Breach)", warning: true },
      { text: "1 execution per 3 mins maximum", check: true },
      { text: "Hold trades for at least 2 minutes", check: true },
      { text: "Trading Leverage: 1:100", check: true },
      { text: "Minimum 5 trading days", check: true },
    ],
    funded: [
      { text: "80% profit split", check: true },
      { text: "Trading Leverage: 1:30", check: true },
      { text: "1 execution per 3 mins maximum (Hard Breach)", warning: true },
      { text: "No closing trades within 2 mins (Hard Breach)", warning: true },
      { text: "3% max loss per single trade (Hard Breach)", warning: true },
      { text: "Minimum 5 trading days required before payout request", warning: true },
      { text: "1% max floating loss (Hard Breach)", warning: true },
      { text: "5% daily drawdown limit (Hard Breach)", warning: true },
      { text: "10% max drawdown limit (Hard Breach)", warning: true },
      { text: "No martingale (Hard Breach)", check: false },
    ]
  },
  '3-step': {
    phase1: [
      { text: "10% profit target", check: true },
      { text: "4% daily drawdown", check: true },
      { text: "8% max drawdown", check: true },
      { text: "3% max loss per single trade (Hard Breach)", warning: true },
      { text: "1 execution per 3 mins maximum", check: true },
      { text: "Hold trades for at least 2 minutes", check: true },
      { text: "Minimum 7 trading days", check: true },
      { text: "Trading Leverage: 1:100", check: true },
    ],
    phase2: [
      { text: "8% profit target", check: true },
      { text: "4% daily drawdown", check: true },
      { text: "8% max drawdown", check: true },
      { text: "3% max loss per single trade (Hard Breach)", warning: true },
      { text: "1 execution per 3 mins maximum", check: true },
      { text: "Hold trades for at least 2 minutes", check: true },
      { text: "Minimum 6 trading days", check: true },
      { text: "Trading Leverage: 1:100", check: true },
    ],
    phase3: [
      { text: "5% profit target", check: true },
      { text: "4% daily drawdown", check: true },
      { text: "8% max drawdown", check: true },
      { text: "3% max loss per single trade (Hard Breach)", warning: true },
      { text: "1 execution per 3 mins maximum", check: true },
      { text: "Hold trades for at least 2 minutes", check: true },
      { text: "Minimum 5 trading days", check: true },
      { text: "Trading Leverage: 1:100", check: true },
    ],
    funded: [
      { text: "80% profit split (Bi-Weekly)", check: true },
      { text: "100% profit split (Monthly)", check: true },
      { text: "Trading Leverage: 1:30", check: true },
      { text: "1 execution per 3 mins maximum (Hard Breach)", warning: true },
      { text: "No closing trades within 2 mins (Hard Breach)", warning: true },
      { text: "3% max loss per single trade (Hard Breach)", warning: true },
      { text: "Minimum 5 trading days required before payout request", warning: true },
      { text: "1% max floating loss (Hard Breach)", warning: true },
      { text: "4% daily drawdown limit (Hard Breach)", warning: true },
      { text: "8% max drawdown limit (Hard Breach)", warning: true },
      { text: "No martingale (Hard Breach)", check: false },
    ]
  },
  'instant': {
    active: [
      { text: "70% profit split", check: true },
      { text: "Trading Leverage: 1:30", check: true },
      { text: "Instruments: Fx, Commodities, Indices, Stock, Crypto", check: true },
      { text: "Daily payouts available", check: true },
      { text: "First payout after 24 hours", check: true },
      { text: "Max withdraw 3% per 24hrs", warning: true },
      { text: "No payout exceeding daily drawdown", warning: true },
    ],
    prohibited: [
      { text: "1 execution per 3 mins maximum (Hard Breach)", warning: true },
      { text: "No closing trades within 2 mins (Hard Breach)", warning: true },
      { text: "1% max floating loss (Hard Breach)", warning: true },
      { text: "3% daily drawdown (Hard Breach)", warning: true },
      { text: "4% max drawdown (Hard Breach)", warning: true },
      { text: "3% max loss per single trade (Hard Breach)", warning: true },
      { text: "No Friday overnight holding (Warning only)", warning: true },
      { text: "Minimum 5 trades per instrument required for payout eligibility (Soft Rule)", warning: true },
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
      else if (p.includes('instant')) setActivePlan('instant');
    }
  }, [userData]);

  const currentPhaseName = useMemo(() => {
    const phase = userData?.currentPhase || 'evaluation';
    if (phase === 'evaluation') return 'Evaluation Phase';
    if (phase === 'phase1') return 'Phase 1';
    if (phase === 'phase2') return 'Phase 2';
    if (phase === 'phase3') return 'Phase 3';
    if (phase === 'funded') return 'Funded Stage';
    return phase;
  }, [userData?.currentPhase]);

  return (
    <div className="flex min-h-screen bg-background">
      <Navigation />
      <main className="flex-1 p-8 overflow-y-auto custom-scrollbar">
        <header className="mb-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-4xl font-headline font-bold mb-2 text-white">Trading Rules</h1>
            <p className="text-zinc-300">Comprehensive guide to maintain your institutional funding eligibility.</p>
          </div>
          {userData?.currentPhase && (
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-3 bg-primary/15 border border-primary/40 px-6 py-3 rounded-2xl shadow-xl shadow-primary/10"
            >
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-black shadow-[0_0_15px_rgba(17,179,245,0.4)]">
                <MapPin className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-primary">Your Current Status</p>
                <p className="text-lg font-bold text-white uppercase">{currentPhaseName}</p>
              </div>
            </motion.div>
          )}
        </header>

        <div className="mb-8 p-5 bg-destructive/20 border-l-4 border-destructive rounded-r-xl flex items-center gap-4">
          <AlertCircle className="text-destructive w-6 h-6 shrink-0" />
          <p className="text-sm font-bold text-white uppercase tracking-tight">
            ⚠️ Hard breaches result in immediate account termination with no appeal. Follow all protocols strictly.
          </p>
        </div>

        <Tabs value={activePlan} onValueChange={setActivePlan} className="space-y-12">
          <TabsList className="bg-secondary/40 border border-white/5 p-1 h-14 w-full max-w-4xl justify-start overflow-x-auto no-scrollbar">
            <TabsTrigger value="1-step" className="h-full px-8 font-bold text-white data-[state=active]:bg-primary data-[state=active]:text-black transition-all">1-Step Pro</TabsTrigger>
            <TabsTrigger value="2-step" className="h-full px-8 font-bold text-white data-[state=active]:bg-primary data-[state=active]:text-black transition-all">2-Step Classic</TabsTrigger>
            <TabsTrigger value="3-step" className="h-full px-8 font-bold text-white data-[state=active]:bg-primary data-[state=active]:text-black transition-all">3-Step Classic</TabsTrigger>
            <TabsTrigger value="instant" className="h-full px-8 font-bold text-white data-[state=active]:bg-primary data-[state=active]:text-black transition-all">Instant Funding</TabsTrigger>
          </TabsList>

          <TabsContent value="1-step" className="space-y-12">
            <div className="grid md:grid-cols-2 gap-8">
              <RuleCard title="Evaluation Phase" items={PLAN_RULES['1-step'].evaluation} active={userData?.currentPhase === 'evaluation'} />
              <RuleCard title="Funded Stage" items={PLAN_RULES['1-step'].funded} variant="destructive" active={userData?.currentPhase === 'funded'} />
            </div>
          </TabsContent>

          <TabsContent value="2-step" className="space-y-12">
            <div className="grid md:grid-cols-3 gap-8">
              <RuleCard title="Phase 1: Evaluation" items={PLAN_RULES['2-step'].phase1} active={userData?.currentPhase === 'phase1'} />
              <RuleCard title="Phase 2: Verification" items={PLAN_RULES['2-step'].phase2} active={userData?.currentPhase === 'phase2'} />
              <RuleCard title="Funded Stage" items={PLAN_RULES['2-step'].funded} variant="destructive" active={userData?.currentPhase === 'funded'} />
            </div>
          </TabsContent>

          <TabsContent value="3-step" className="space-y-12">
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
              <RuleCard title="Phase 1" items={PLAN_RULES['3-step'].phase1} active={userData?.currentPhase === 'phase1'} />
              <RuleCard title="Phase 2" items={PLAN_RULES['3-step'].phase2} active={userData?.currentPhase === 'phase2'} />
              <RuleCard title="Phase 3" items={PLAN_RULES['3-step'].phase3} active={userData?.currentPhase === 'phase3'} />
              <RuleCard title="Funded Stage" items={PLAN_RULES['3-step'].funded} variant="destructive" active={userData?.currentPhase === 'funded'} />
            </div>
          </TabsContent>

          <TabsContent value="instant" className="space-y-12">
            <div className="grid md:grid-cols-2 gap-8">
              <RuleCard title="Live Trading Rules" items={PLAN_RULES['instant'].active} active={userData?.currentPhase !== 'breached'} />
              <RuleCard title="Risk Protocols" items={PLAN_RULES['instant'].prohibited} variant="destructive" active={userData?.currentPhase !== 'breached'} />
            </div>
          </TabsContent>
        </Tabs>

        <section className="mt-24 space-y-10">
          <div className="flex items-center gap-4">
             <div className="p-3 bg-primary/10 rounded-xl border border-primary/20">
                <Shield className="text-primary w-8 h-8" />
             </div>
             <h2 className="text-4xl font-headline font-bold text-white">Breach Protocol</h2>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <Card className="bg-destructive/10 border-destructive/30 p-10 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-destructive/5 blur-3xl group-hover:bg-destructive/10 transition-colors" />
              <h3 className="text-2xl font-bold text-destructive mb-6 flex items-center gap-3">
                <Skull className="w-6 h-6" /> Hard Breach
              </h3>
              <p className="text-zinc-200 text-base leading-relaxed mb-8">
                Violating hard rules results in immediate liquidation of your trading account. The account is terminated, and all profits are forfeited. No appeals are permitted for hard breaches.
              </p>
              <ul className="space-y-4">
                <ProtocolItem text="Daily Drawdown limit reached" />
                <ProtocolItem text="Maximum Drawdown limit reached" />
                <ProtocolItem text="Unauthorized Martingale / Grid trading" />
                <ProtocolItem text="Frequency or Duration violation" />
              </ul>
            </Card>

            <Card className="bg-amber-500/10 border-amber-500/30 p-10 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 blur-3xl group-hover:bg-amber-500/10 transition-colors" />
              <h3 className="text-2xl font-bold text-amber-500 mb-6 flex items-center gap-3">
                <AlertTriangle className="w-6 h-6" /> Soft Breach
              </h3>
              <p className="text-zinc-200 text-base leading-relaxed mb-8">
                Soft rules are designed to protect your evaluation. Violating a soft rule results in a formal warning or a reset of the evaluation phase without terminating your eligibility for funding.
              </p>
              <ul className="space-y-4">
                <ProtocolItem text="Holding over the weekend (on specific plans)" />
                <ProtocolItem text="Copying unauthorized external signals" />
                <ProtocolItem text="Inconsistent execution patterns" />
              </ul>
            </Card>
          </div>
        </section>
      </main>
    </div>
  );
}

function RuleCard({ title, items, variant = 'primary', active }: { title: string, items: any[], variant?: 'primary' | 'destructive', active?: boolean }) {
  const isDestructive = variant === 'destructive';
  
  return (
    <Card className={cn(
      "h-full transition-all duration-500 relative bg-slate-900/60",
      active 
        ? isDestructive 
          ? "border-destructive ring-2 ring-destructive/40 scale-[1.03] shadow-[0_0_40px_rgba(239,68,68,0.25)]" 
          : "border-primary ring-2 ring-primary/40 scale-[1.03] shadow-[0_0_40px_rgba(17,179,245,0.25)]"
        : "border-white/10 opacity-70 grayscale-[0.2]"
    )}>
      {active && (
        <div className={cn(
          "absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full text-[11px] font-black uppercase tracking-widest z-10",
          isDestructive 
            ? "bg-destructive text-white shadow-[0_0_15px_rgba(239,68,68,0.6)]" 
            : "bg-primary text-black shadow-[0_0_15px_rgba(17,179,245,0.6)]"
        )}>
          Your Current Stage
        </div>
      )}
      <CardHeader className="border-b border-white/5 pb-5">
        <CardTitle className={cn(
          "text-2xl font-headline font-bold flex items-center gap-3",
          isDestructive ? 'text-destructive' : 'text-white'
        )}>
          {isDestructive ? <Skull className="w-6 h-6" /> : <Target className="text-primary w-6 h-6" />}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-8 space-y-5">
        {items.map((item, idx) => (
          <div key={idx} className="flex items-start gap-4">
            <div className={cn(
              "mt-1 p-1 rounded-full",
              item.check ? 'bg-emerald-500/20 text-emerald-400' : item.warning ? 'bg-amber-500/20 text-amber-400' : 'bg-destructive/20 text-destructive'
            )}>
              {item.check ? <Check className="w-4 h-4" /> : item.warning ? <AlertTriangle className="w-4 h-4" /> : <Skull className="w-4 h-4" />}
            </div>
            <span className={cn(
              "text-sm font-semibold",
              (item.warning || !item.check) ? 'text-amber-200' : 'text-zinc-200'
            )}>
              {item.text}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ProtocolItem({ text }: { text: string }) {
  return (
    <li className="flex items-center gap-3 text-sm font-medium text-zinc-300">
      <div className="w-2 h-2 rounded-full bg-primary/40" />
      {text}
    </li>
  );
}
