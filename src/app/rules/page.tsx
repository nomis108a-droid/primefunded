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
      { text: "Reach a profit target of 10% to pass", check: true },
      { text: "Do not lose more than 3% of your starting balance in a single day", check: true },
      { text: "Your account will be closed if your total loss ever reaches 6% of your starting balance", check: true },
      { text: "You must trade for at least 5 different days to pass", check: true },
      { text: "You must wait at least 3 minutes between opening new trades", check: true },
      { text: "You must hold your trades for at least 2 minutes before closing them", check: true },
      { text: "Any single open trade cannot lose more than 1% of your account balance at any time (Automatic Closing)", warning: true },
      { text: "You are not allowed to double your trade size after a loss to try and recover (Forced Closing)", check: false },
    ],
    funded: [
      { text: "Keep 80% of all profits you make", check: true },
      { text: "You need to trade for at least 5 days before you can request your first payout", warning: true },
      { text: "Any single open trade cannot lose more than 1% of your account balance at any time", warning: true },
      { text: "Do not lose more than 3% of your starting balance in a single day", warning: true },
      { text: "Do not let your total losses reach 6% of your starting balance", warning: true },
      { text: "Double-sizing your trades after a loss (martingale) is not allowed", check: false },
    ]
  },
  '2-step': {
    phase1: [
      { text: "Reach a profit target of 8% to pass this phase", check: true },
      { text: "Do not lose more than 5% of your starting balance in a single day", check: true },
      { text: "Your account will be closed if your total loss ever reaches 10% of your starting balance", check: true },
      { text: "A single closed trade cannot lose more than 3% of your starting balance", warning: true },
      { text: "Wait at least 3 minutes between new trades and hold for 2+ minutes", check: true },
      { text: "You must trade for at least 5 different days", check: true },
    ],
    phase2: [
      { text: "Reach a profit target of 5% to pass this phase", check: true },
      { text: "Do not lose more than 5% in a single day", check: true },
      { text: "Do not let your total losses reach 10%", check: true },
      { text: "A single trade cannot lose more than 3% once closed", warning: true },
      { text: "You must trade for at least 5 different days", check: true },
    ],
    funded: [
      { text: "Keep 80% of all profits you make", check: true },
      { text: "Wait 3+ minutes between new trades and hold for 2+ minutes", warning: true },
      { text: "A single trade cannot lose more than 3% of your starting balance", warning: true },
      { text: "You need to trade for at least 5 days before asking for a payout", warning: true },
      { text: "Any single open trade cannot lose more than 1% at any time", warning: true },
      { text: "Do not lose more than 5% in a single day", warning: true },
      { text: "Do not let your total losses reach 10%", warning: true },
      { text: "Double-sizing your trades after a loss is not allowed", check: false },
    ]
  },
  '3-step': {
    phase1: [
      { text: "Reach a profit target of 10% to pass this phase", check: true },
      { text: "Do not lose more than 4% in a single day", check: true },
      { text: "Do not let your total losses reach 8%", check: true },
      { text: "A single closed trade cannot lose more than 3%", warning: true },
      { text: "You must trade for at least 7 different days", check: true },
    ],
    phase2: [
      { text: "Reach a profit target of 8% to pass this phase", check: true },
      { text: "Do not lose more than 4% in a single day", check: true },
      { text: "Do not let your total losses reach 8%", check: true },
      { text: "You must trade for at least 6 different days", check: true },
    ],
    phase3: [
      { text: "Reach a profit target of 5% to pass this phase", check: true },
      { text: "Do not lose more than 4% in a single day", check: true },
      { text: "Do not let your total losses reach 8%", check: true },
      { text: "You must trade for at least 5 different days", check: true },
    ],
    funded: [
      { text: "Keep 80% to 100% of all profits you make", check: true },
      { text: "A single closed trade cannot lose more than 3%", warning: true },
      { text: "Any single open trade cannot lose more than 1% at any time", warning: true },
      { text: "Do not lose more than 4% in a single day", warning: true },
      { text: "Do not let your total losses reach 8%", warning: true },
      { text: "You cannot double your trade size after a loss to recover", check: false },
    ]
  },
  'instant': {
    active: [
      { text: "Keep 70% of all profits you make", check: true },
      { text: "You can request your first payout just 24 hours after starting", check: true },
      { text: "You can get paid every single day", check: true },
      { text: "You can withdraw a maximum of 3% of your balance every 24 hours", warning: true },
      { text: "Your payout request cannot be larger than your daily loss limit", warning: true },
      { text: "Your account will automatically close 30 days after you bought it, even if you are still trading", warning: true },
    ],
    prohibited: [
      { text: "Wait at least 3 minutes between trades and hold for 2+ minutes", warning: true },
      { text: "Any single open trade cannot lose more than 1% of your account balance at any time", warning: true },
      { text: "Do not lose more than 3% of your starting balance in a single day", warning: true },
      { text: "Do not let your total losses reach 4% of your starting balance", warning: true },
      { text: "A single trade cannot lose more than 3% of your account balance once closed", warning: true },
      { text: "Try to close all trades before the market closes on Friday evening", warning: true },
      { text: "You must complete at least 5 trades on every symbol you use to be eligible for a payout", warning: true },
      { text: "Doubling your trade size after a loss (martingale) is strictly forbidden", check: false },
    ]
  },
  'instant-pro': {
    active: [
      { text: "Keep 80% of all profits you make", check: true },
      { text: "You can get paid every day after you have traded for 5 days", check: true },
      { text: "A trading day only counts towards your payout if you complete at least 3 trades that day", check: true },
      { text: "You need at least 5 qualified trading days before you can request a payout", check: true },
      { text: "Your account will automatically close 30 days after you bought it, even if you have not passed yet", warning: true },
    ],
    prohibited: [
      { text: "Do not lose more than 3% of your starting balance in a single day", warning: true },
      { text: "Your account will be closed if your total loss ever reaches 5% of your starting balance", warning: true },
      { text: "Any single open trade cannot lose more than 1% of your account balance at any time", warning: true },
      { text: "Doubling your trade size after a loss (martingale) is strictly forbidden", check: false },
      { text: "Try to close all trades before the market closes on Friday evening", warning: true },
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
            <h1 className="text-4xl font-headline font-bold mb-2 text-white">Simple Trading Rules</h1>
            <p className="text-zinc-300">A plain English guide to keeping your account safe and getting funded.</p>
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
            ⚠️ Breaking a rule marked in red will close your account immediately. No appeals allowed.
          </p>
        </div>

        <Tabs value={activePlan} onValueChange={setActivePlan} className="space-y-12">
          <TabsList className="bg-secondary/40 border border-white/5 p-1 h-14 w-full max-w-5xl justify-start overflow-x-auto no-scrollbar">
            <TabsTrigger value="1-step" className="h-full px-8 font-bold text-white data-[state=active]:bg-primary data-[state=active]:text-black transition-all">1-Step Pro</TabsTrigger>
            <TabsTrigger value="2-step" className="h-full px-8 font-bold text-white data-[state=active]:bg-primary data-[state=active]:text-black transition-all">2-Step Classic</TabsTrigger>
            <TabsTrigger value="3-step" className="h-full px-8 font-bold text-white data-[state=active]:bg-primary data-[state=active]:text-black transition-all">3-Step Classic</TabsTrigger>
            <TabsTrigger value="instant" className="h-full px-8 font-bold text-white data-[state=active]:bg-primary data-[state=active]:text-black transition-all">Instant Funding</TabsTrigger>
            <TabsTrigger value="instant-pro" className="h-full px-8 font-bold text-white data-[state=active]:bg-primary data-[state=active]:text-black transition-all">Instant Pro</TabsTrigger>
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
              <RuleCard title="Rules for Profit" items={PLAN_RULES['instant'].active} active={userData?.currentPhase !== 'breached'} />
              <RuleCard title="Safety Rules" items={PLAN_RULES['instant'].prohibited} variant="destructive" active={userData?.currentPhase !== 'breached'} />
            </div>
          </TabsContent>

          <TabsContent value="instant-pro" className="space-y-12">
            <div className="grid md:grid-cols-2 gap-8">
              <RuleCard title="Rules for Profit" items={PLAN_RULES['instant-pro'].active} active={userData?.currentPhase !== 'breached'} />
              <RuleCard title="Safety Rules" items={PLAN_RULES['instant-pro'].prohibited} variant="destructive" active={userData?.currentPhase !== 'breached'} />
            </div>
          </TabsContent>
        </Tabs>

        <section className="mt-24 space-y-10">
          <div className="flex items-center gap-4">
             <div className="p-3 bg-primary/10 rounded-xl border border-primary/20">
                <Shield className="text-primary w-8 h-8" />
             </div>
             <h2 className="text-4xl font-headline font-bold text-white">What happens if I break a rule?</h2>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <Card className="bg-destructive/10 border-destructive/30 p-10 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-destructive/5 blur-3xl group-hover:bg-destructive/10 transition-colors" />
              <h3 className="text-2xl font-bold text-destructive mb-6 flex items-center gap-3">
                <Skull className="w-6 h-6" /> Major Violations
              </h3>
              <p className="text-zinc-200 text-base leading-relaxed mb-8">
                Breaking a major safety rule will close your account immediately. All trades will be closed, and any profit you made will be lost. You cannot appeal this decision.
              </p>
              <ul className="space-y-4">
                <ProtocolItem text="Losing more than allowed in a single day" />
                <ProtocolItem text="Letting your total loss reach the account limit" />
                <ProtocolItem text="Doubling up your trade size after a loss" />
                <ProtocolItem text="Placing trades too quickly or holding for too short" />
              </ul>
            </Card>

            <Card className="bg-amber-500/10 border-amber-500/30 p-10 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 blur-3xl group-hover:bg-amber-500/10 transition-colors" />
              <h3 className="text-2xl font-bold text-amber-500 mb-6 flex items-center gap-3">
                <AlertTriangle className="w-6 h-6" /> Minor Warnings
              </h3>
              <p className="text-zinc-200 text-base leading-relaxed mb-8">
                Minor rules are there to protect you. Breaking these might result in a simple warning or your account being reset to the starting point instead of being closed permanently.
              </p>
              <ul className="space-y-4">
                <ProtocolItem text="Keeping trades open through the weekend" />
                <ProtocolItem text="Copying trades from other people without permission" />
                <ProtocolItem text="Trading in a very unusual or erratic way" />
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
