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
      { text: "Friday overnight holding of Forex/Metal positions (XAUUSD, EURUSD etc.) after Friday 21:00 UTC will result in immediate account breach. Crypto positions are exempt.", warning: false },
    ],
    funded: [
      { text: "Keep 80% of all profits you make", check: true },
      { text: "You need to trade for at least 5 days before you can request your first payout", warning: true },
      { text: "Friday overnight holding of Forex/Metal positions after 21:00 UTC will breach the account. Crypto is allowed.", warning: false },
      { text: "Do not lose more than 3% of your starting balance in a single day", warning: true },
      { text: "Do not let your total losses reach 6% of your starting balance", warning: true },
    ]
  },
  '2-step': {
    phase1: [
      { text: "Reach a profit target of 8% to pass this phase", check: true },
      { text: "Do not lose more than 5% of your starting balance in a single day", check: true },
      { text: "Your account will be closed if your total loss ever reaches 10% of your starting balance", check: true },
      { text: "A single closed trade cannot lose more than 3% of your starting balance", warning: true },
      { text: "Friday overnight holding of Forex/Metal positions after 21:00 UTC results in immediate breach. Crypto is allowed.", warning: false },
      { text: "You must trade for at least 5 different days", check: true },
    ],
    phase2: [
      { text: "Reach a profit target of 5% to pass this phase", check: true },
      { text: "Do not lose more than 5% in a single day", check: true },
      { text: "Do not let your total losses reach 10%", check: true },
      { text: "You must trade for at least 5 different days", check: true },
    ],
    funded: [
      { text: "Keep 80% of all profits you make", check: true },
      { text: "Friday overnight holding of Forex/Metal positions after 21:00 UTC results in immediate breach. Crypto is allowed.", warning: false },
      { text: "You need to trade for at least 5 days before asking for a payout", warning: true },
      { text: "Do not lose more than 5% in a single day", warning: true },
      { text: "Do not let your total losses reach 10%", warning: true },
    ]
  },
  '3-step': {
    phase1: [
      { text: "Reach a profit target of 10% to pass this phase", check: true },
      { text: "Do not lose more than 4% in a single day", check: true },
      { text: "Do not let your total losses reach 8%", check: true },
      { text: "Friday overnight holding of Forex/Metal positions after 21:00 UTC results in immediate breach.", warning: false },
    ],
    phase2: [
      { text: "Reach a profit target of 8% to pass this phase", check: true },
      { text: "Do not lose more than 4% in a single day", check: true },
      { text: "Do not let your total losses reach 8%", check: true },
      { text: "Minimum 6 trading days required", check: true },
    ],
    phase3: [
      { text: "Reach a profit target of 5% to pass this phase", check: true },
      { text: "Do not lose more than 4% in a single day", check: true },
      { text: "Do not let your total losses reach 8%", check: true },
      { text: "Minimum 5 trading days required", check: true },
    ],
    funded: [
      { text: "Keep 80% to 100% of all profits you make", check: true },
      { text: "Do not lose more than 4% in a single day", warning: true },
      { text: "Do not let your total losses reach 8%", warning: true },
      { text: "Friday overnight holding of Forex/Metal positions after 21:00 UTC results in immediate breach.", warning: false },
    ]
  },
  'instant': {
    active: [
      { text: "Keep 70% of all profits you make", check: true },
      { text: "Maximum 1 payout request per 24 hours", check: true },
      { text: "Trading is suspended while a payout request is being processed", warning: true },
      { text: "You must complete at least 5 trades on each symbol you trade to be eligible for payout", check: true },
      { text: "Your account automatically expires 30 days after purchase", warning: true },
    ],
    prohibited: [
      { text: "Friday overnight holding of Forex/Metal positions after 21:00 UTC will breach the account. Crypto is exempt.", warning: false },
      { text: "Do not lose more than 3% of your starting balance in a single day", warning: true },
      { text: "Do not let your total losses reach 4% of your starting balance", warning: true },
      { text: "A single trade cannot lose more than 3% of your starting balance", warning: true },
    ]
  },
  'instant-pro': {
    active: [
      { text: "Keep 80% of all profits you make", check: true },
      { text: "Maximum 1 payout request per 24 hours", check: true },
      { text: "Trading is suspended while a payout request is being processed", warning: true },
      { text: "A trading day only counts if you completed at least 3 trades that day", check: true },
      { text: "You need 7 qualified trading days (with 3+ trades each) before requesting payout", check: true },
      { text: "You must complete at least 5 trades on each symbol you trade to be eligible for payout", check: true },
    ],
    prohibited: [
      { text: "Friday overnight holding of Forex/Metal positions after 21:00 UTC results in immediate breach. Crypto is allowed.", warning: false },
      { text: "Do not lose more than 3% of your starting balance in a single day", warning: true },
      { text: "Your account will be closed if your total loss ever reaches 5% of your starting balance", warning: true },
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
              <RuleCard title="Evaluation Phase" items={PLAN_RULES['1-step'].evaluation} />
              <RuleCard title="Funded Stage" items={PLAN_RULES['1-step'].funded} variant="destructive" />
            </div>
          </TabsContent>

          <TabsContent value="2-step" className="space-y-12">
            <div className="grid md:grid-cols-3 gap-8">
              <RuleCard title="Phase 1: Evaluation" items={PLAN_RULES['2-step'].phase1} />
              <RuleCard title="Phase 2: Verification" items={PLAN_RULES['2-step'].phase2} />
              <RuleCard title="Funded Stage" items={PLAN_RULES['2-step'].funded} variant="destructive" />
            </div>
          </TabsContent>

          <TabsContent value="3-step" className="space-y-12">
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
              <RuleCard title="Phase 1" items={PLAN_RULES['3-step'].phase1} />
              <RuleCard title="Phase 2" items={PLAN_RULES['3-step'].phase2} />
              <RuleCard title="Phase 3" items={PLAN_RULES['3-step'].phase3} />
              <RuleCard title="Funded Stage" items={PLAN_RULES['3-step'].funded} variant="destructive" />
            </div>
          </TabsContent>

          <TabsContent value="instant" className="space-y-12">
            <div className="grid md:grid-cols-2 gap-8">
              <RuleCard title="Rules for Profit" items={PLAN_RULES['instant'].active} />
              <RuleCard title="Safety Rules" items={PLAN_RULES['instant'].prohibited} variant="destructive" />
            </div>
          </TabsContent>

          <TabsContent value="instant-pro" className="space-y-12">
            <div className="grid md:grid-cols-2 gap-8">
              <RuleCard title="Rules for Profit" items={PLAN_RULES['instant-pro'].active} />
              <RuleCard title="Safety Rules" items={PLAN_RULES['instant-pro'].prohibited} variant="destructive" />
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function RuleCard({ title, items = [], variant = 'primary' }: { title: string, items?: any[], variant?: 'primary' | 'destructive' }) {
  const isDestructive = variant === 'destructive';
  
  return (
    <Card className={cn(
      "h-full transition-all duration-500 relative bg-slate-900/60",
      "border-white/10"
    )}>
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
        {(items || []).map((item, idx) => (
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
