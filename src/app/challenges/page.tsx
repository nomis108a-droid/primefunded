
"use client";

import { useState, memo, useEffect, useMemo } from 'react';
import { Navigation } from '@/components/Navigation';
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Check, ChevronDown, ChevronUp, TicketPercent, Skull, AlertTriangle, AlertCircle, Copy, Link as LinkIcon, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';

const planData = {
  '1-step': [
    { size: '$5,000', price: 59 },
    { size: '$10,000', price: 89 },
    { size: '$25,000', price: 179 },
    { size: '$50,000', price: 289 },
    { size: '$100,000', price: 499, popular: true },
    { size: '$200,000', price: 999 },
  ],
  '2-step': [
    { size: '$5,000', price: 39 },
    { size: '$10,000', price: 69 },
    { size: '$25,000', price: 149 },
    { size: '$50,000', price: 249 },
    { size: '$100,000', price: 429, popular: true },
    { size: '$200,000', price: 849 },
  ],
  '3-step': [
    { size: '$5,000', price: 10 },
    { size: '$10,000', price: 30 },
    { size: '$25,000', price: 80 },
    { size: '$50,000', price: 150 },
    { size: '$100,000', price: 399, popular: true },
    { size: '$200,000', price: 799 },
    { size: '$300,000', price: 1099 },
  ],
  'instant': [
    { size: '$5,000', price: 125 },
    { size: '$10,000', price: 250 },
    { size: '$25,000', price: 625 },
    { size: '$50,000', price: 1250 },
    { size: '$100,000', price: 2500, popular: true },
    { size: '$200,000', price: 5000 },
  ],
  'instant-pro': [
    { size: '$5,000', price: 145 },
    { size: '$10,000', price: 290 },
    { size: '$25,000', price: 725 },
    { size: '$50,000', price: 1450 },
    { size: '$100,000', price: 2900, popular: true },
    { size: '$200,000', price: 5800 },
  ]
};

const RULES = {
  '1-step': {
    evaluation: [
      { text: "10% profit target", type: 'check' },
      { text: "3% daily drawdown", type: 'check' },
      { text: "6% max drawdown", type: 'check' },
      { text: "Trading Leverage 1:100", type: 'check' },
      { text: "Instruments: Fx, Commodities, Indices, Stock, Crypto", type: 'check' },
      { text: "Minimum 5 trading days", type: 'check' },
      { text: "Max 1 trade / 3 mins", type: 'check' },
    ],
    funded: [
      { text: "80% profit split", type: 'check' },
      { text: "Trading Leverage 1:30", type: 'check' },
      { text: "Instruments: Fx, Commodities, Indices, Stock, Crypto", type: 'check' },
      { text: "Minimum 5 trading days required before payout request", type: 'warning' },
      { text: "1% max floating loss (Hard Breach)", type: 'warning' },
      { text: "3% daily drawdown limit (Hard Breach)", type: 'hard' },
      { text: "6% max drawdown limit (Hard Breach)", type: 'hard' },
      { text: "No martingale (Hard Breach)", type: 'hard' },
    ]
  },
  '2-step': {
    phase1: [
      { text: "8% profit target", type: 'check' },
      { text: "5% daily drawdown", type: 'check' },
      { text: "10% max drawdown", type: 'check' },
      { text: "Trading Leverage 1:100", type: 'check' },
      { text: "Instruments: Fx, Commodities, Indices, Stock, Crypto", type: 'check' },
      { text: "Minimum 5 trading days", type: 'check' },
    ],
    phase2: [
      { text: "5% profit target", type: 'check' },
      { text: "5% daily drawdown", type: 'check' },
      { text: "10% max drawdown", type: 'check' },
      { text: "Trading Leverage 1:100", type: 'check' },
      { text: "Instruments: Fx, Commodities, Indices, Stock, Crypto", type: 'check' },
      { text: "Minimum 5 trading days", type: 'check' },
    ],
    funded: [
      { text: "80% profit split", type: 'check' },
      { text: "Trading Leverage 1:30", type: 'check' },
      { text: "Instruments: Fx, Commodities, Indices, Stock, Crypto", type: 'check' },
      { text: "Minimum 5 trading days required before payout request", type: 'warning' },
      { text: "1% max floating loss (Hard Breach)", type: 'warning' },
      { text: "5% daily drawdown limit (Hard Breach)", type: 'hard' },
      { text: "10% max drawdown limit (Hard Breach)", type: 'hard' },
      { text: "No martingale (Hard Breach)", type: 'hard' },
    ]
  },
  '3-step': {
    phase1: [
      { text: "10% profit target", type: 'check' },
      { text: "4% daily drawdown", type: 'check' },
      { text: "8% max drawdown", type: 'check' },
      { text: "Minimum 7 trading days", type: 'check' },
      { text: "Trading Leverage: 1:100", type: 'check' },
      { text: "Instruments: Fx, Commodities, Indices, Stock, Crypto", type: 'check' },
    ],
    phase2: [
      { text: "8% profit target", type: 'check' },
      { text: "4% daily drawdown", type: 'check' },
      { text: "8% max drawdown", type: 'check' },
      { text: "Minimum 6 trading days", type: 'check' },
      { text: "Trading Leverage: 1:100", type: 'check' },
      { text: "Instruments: Fx, Commodities, Indices, Stock, Crypto", type: 'check' },
    ],
    phase3: [
      { text: "5% profit target", type: 'check' },
      { text: "4% daily drawdown", type: 'check' },
      { text: "8% max drawdown", type: 'check' },
      { text: "Minimum 5 trading days", type: 'check' },
      { text: "Trading Leverage: 1:100", type: 'check' },
      { text: "Instruments: Fx, Commodities, Indices, Stock, Crypto", type: 'check' },
    ],
    funded: [
      { text: "80% profit split (Bi-Weekly)", type: 'check' },
      { text: "100% profit split (Monthly)", type: 'check' },
      { text: "Trading Leverage: 1:30", type: 'check' },
      { text: "Instruments: Fx, Commodities, Indices, Stock, Crypto", type: 'check' },
      { text: "Minimum 5 trading days required before payout request", type: 'warning' },
      { text: "4% daily drawdown limit (Hard Breach)", type: 'hard' },
      { text: "8% max drawdown limit (Hard Breach)", type: 'hard' },
      { text: "No martingale (Hard Breach)", type: 'hard' },
    ]
  },
  'instant': {
    funded: [
      { text: "70% profit split", type: 'check' },
      { text: "Trading Leverage 1:30", type: 'check' },
      { text: "Instruments: Fx, Commodities, Indices, Stock, Crypto", type: 'check' },
      { text: "Daily payouts available", type: 'check' },
      { text: "First payout after 24 hours", type: 'check' },
      { text: "Max withdraw 3% per 24 hours", type: 'warning' },
      { text: "3% daily drawdown (Hard Breach)", type: 'hard' },
      { text: "4% max drawdown (Hard Breach)", type: 'hard' },
      { text: "No martingale (Hard Breach)", type: 'hard' },
      { text: "No payout exceeding daily drawdown", type: 'warning' },
    ]
  },
  'instant-pro': {
    funded: [
      { text: "80% profit split", type: 'check' },
      { text: "Trading Leverage 1:30", type: 'check' },
      { text: "Instruments: Fx, Commodities, Indices, Stock, Crypto", type: 'check' },
      { text: "Daily payouts (after 5 days)", type: 'check' },
      { text: "Minimum 3 trades per day", type: 'warning' },
      { text: "Minimum 5 trading days for payout", type: 'warning' },
      { text: "3% daily drawdown (Hard Breach)", type: 'hard' },
      { text: "4% max drawdown (Hard Breach)", type: 'hard' },
      { text: "No martingale (Hard Breach)", type: 'hard' },
    ]
  }
};

const ChallengeCard = memo(function ChallengeCard({ tier, planName, delay, discountApplied }: { tier: any, planName: string, delay: number, discountApplied: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const finalPrice = discountApplied ? Math.floor(tier.price * 0.8) : tier.price;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
    >
      <Card className={`relative overflow-hidden border-border/50 hover:border-primary/50 transition-all duration-300 flex flex-col h-full bg-card/50 backdrop-blur-sm group ${tier.popular ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}`}>
        {tier.popular && (
          <div className="absolute top-0 right-0 z-10">
            <div className="bg-primary text-primary-foreground text-[10px] font-bold px-3 py-1 rounded-bl-lg uppercase tracking-wider">Most Popular</div>
          </div>
        )}

        <CardHeader className="text-center pt-10">
          <CardTitle className="text-2xl font-headline font-bold text-white group-hover:text-primary">{tier.size}</CardTitle>
          <p className="text-muted-foreground text-[9px] uppercase tracking-[0.2em] font-black">
            {planName === '1-step' ? '1-Step Pro' : planName === '2-step' ? '2-Step Classic' : planName === '3-step' ? '3-Step Classic' : planName === 'instant-pro' ? 'Instant Pro' : 'Instant Funding'}
          </p>
        </CardHeader>

        <CardContent className="flex-1 flex flex-col">
          <div className="text-center mb-6">
            <div className="flex items-center justify-center gap-2">
              {discountApplied && <span className="text-lg text-muted-foreground line-through">${tier.price}</span>}
              <span className={`text-3xl font-headline font-bold ${discountApplied ? 'text-accent' : 'text-white'}`}>
                ${finalPrice}
              </span>
            </div>
          </div>
          
          <Collapsible open={isOpen} onOpenChange={setIsOpen} className="w-full">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-primary h-9 px-4 border border-primary/20 rounded-lg cursor-pointer">
                View Stage Rules
                {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-4 space-y-4">
              {planName === '1-step' && (
                <>
                  <RuleSection title="Evaluation" items={RULES['1-step'].evaluation} />
                  <RuleSection title="Funded stage" items={RULES['1-step'].funded} />
                </>
              )}
              {planName === '2-step' && (
                <>
                  <RuleSection title="Phase 1 & 2" items={RULES['2-step'].phase1} />
                  <RuleSection title="Funded stage" items={RULES['2-step'].funded} />
                </>
              )}
              {planName === '3-step' && (
                <>
                  <RuleSection title="Phase 1 (Evaluation)" items={RULES['3-step'].phase1} />
                  <RuleSection title="Phase 2 (Evaluation)" items={RULES['3-step'].phase2} />
                  <RuleSection title="Phase 3 (Evaluation)" items={RULES['3-step'].phase3} />
                  <RuleSection title="Funded stage" items={RULES['3-step'].funded} />
                </>
              )}
              {planName === 'instant' && (
                <RuleSection title="Funded stage" items={RULES['instant'].funded} />
              )}
              {planName === 'instant-pro' && (
                <RuleSection title="Funded stage" items={RULES['instant-pro'].funded} />
              )}
            </CollapsibleContent>
          </Collapsible>
        </CardContent>

        <CardFooter className="pt-4 pb-8 px-6">
          <Button className="w-full h-11 font-bold rounded-xl cyan-box-glow cursor-pointer" asChild>
            <Link href={`/payment?plan=${planName}&size=${tier.size}&price=$${finalPrice}`}>
              Start Challenge
            </Link>
          </Button>
        </CardFooter>
      </Card>
    </motion.div>
  );
});

function RuleSection({ title, items }: { title: string, items: any[] }) {
  return (
    <div className="space-y-2">
      <h4 className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">{title}</h4>
      <div className="grid gap-1.5">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2 text-[10px] font-medium">
            {item.type === 'check' ? (
              <Check className="text-accent w-3 h-3 flex-shrink-0" />
            ) : item.type === 'warning' ? (
              <AlertTriangle className="text-amber-500 w-3 h-3 flex-shrink-0" />
            ) : (
              <Skull className="text-destructive w-3 h-3 flex-shrink-0" />
            )}
            <span className={item.type === 'hard' ? 'text-destructive' : 'text-foreground/80'}>{item.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const ReferralTerminal = memo(function ReferralTerminal({ referralCode }: { referralCode?: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const referralLink = useMemo(() => {
    if (typeof window === 'undefined' || !referralCode) return '';
    return `${window.location.origin}/signup?ref=${referralCode}`;
  }, [referralCode]);

  const handleCopy = () => {
    if (!referralLink) return;
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Link Copied!", description: "Share this link with your friends." });
  };

  return (
    <Card className="border-primary/20 bg-primary/5 overflow-hidden sticky top-24">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg font-headline text-white flex items-center gap-2">
          <LinkIcon className="w-4 h-4 text-primary" /> Referral Hub
        </CardTitle>
        <CardDescription className="text-xs">Earn $30.00 for every referral purchase.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <p className="text-[9px] font-black uppercase text-muted-foreground tracking-[0.2em]">Share Your Link</p>
          <div className="flex flex-col gap-2">
            <div className="font-mono text-[10px] p-3 bg-background/50 rounded-lg border border-border text-white break-all">
              {referralLink || 'Initializing code...'}
            </div>
            <Button onClick={handleCopy} size="sm" className="w-full font-bold rounded-lg cursor-pointer h-10" disabled={!referralLink}>
              {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
              {copied ? 'Copied!' : 'Copy Link'}
            </Button>
          </div>
        </div>
        <Button variant="outline" size="sm" className="w-full text-[10px] font-black uppercase tracking-widest border-primary/20 text-primary h-9 cursor-pointer" asChild>
          <Link href="/referral">Detailed History <ExternalLink className="ml-1 w-3 h-3" /></Link>
        </Button>
      </CardContent>
    </Card>
  );
});

export default function ChallengesPage() {
  const [selectedPlan, setSelectedPlan] = useState('1-step');
  const [couponCode, setCouponCode] = useState('');
  const [discountApplied, setDiscountApplied] = useState(false);
  
  const { user, userData, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login?redirect=/challenges');
    }
  }, [user, loading, router]);

  const handleApplyCoupon = () => {
    if (couponCode.toLowerCase() === 'primefunded20') {
      setDiscountApplied(true);
    } else {
      setDiscountApplied(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen bg-background">
        <Navigation />
        <main className="flex-1 p-8 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </main>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-background">
      <Navigation />
      
      <main className="flex-1 p-8 overflow-y-auto custom-scrollbar">
        <div className="max-w-[1600px] mx-auto">
          <header className="mb-10">
            <motion.h1 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-4xl font-headline font-bold mb-2 text-white"
            >
              Select Your Challenge
            </motion.h1>
            <motion.p 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-muted-foreground"
            >
              Institutional funding starting from $5,000 up to $300,000.
            </motion.p>
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            <div className="lg:col-span-3 space-y-8">
              <div className="p-4 bg-destructive/15 border-l-4 border-destructive rounded-r-lg flex items-center gap-3">
                <AlertCircle className="text-destructive w-5 h-5 shrink-0" />
                <p className="text-xs font-bold text-destructive">
                  ⚠️ Hard breaches result in immediate account termination with no appeal.
                </p>
              </div>

              <Tabs defaultValue="1-step" className="w-full" onValueChange={(val) => {
                setSelectedPlan(val);
                if (val !== 'instant' && val !== 'instant-pro') setDiscountApplied(false);
              }}>
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10">
                  <TabsList className="grid w-full max-w-4xl grid-cols-5 h-12 bg-secondary p-1 rounded-xl">
                    <TabsTrigger value="1-step" className="data-[state=active]:bg-background font-bold rounded-lg cursor-pointer">1-Step</TabsTrigger>
                    <TabsTrigger value="2-step" className="data-[state=active]:bg-background font-bold rounded-lg cursor-pointer">2-Step</TabsTrigger>
                    <TabsTrigger value="3-step" className="data-[state=active]:bg-background font-bold rounded-lg cursor-pointer">3-Step</TabsTrigger>
                    <TabsTrigger value="instant" className="data-[state=active]:bg-background font-bold rounded-lg cursor-pointer">Instant</TabsTrigger>
                    <TabsTrigger value="instant-pro" className="data-[state=active]:bg-background font-bold rounded-lg cursor-pointer">Instant Pro</TabsTrigger>
                  </TabsList>

                  {(selectedPlan === 'instant' || selectedPlan === 'instant-pro') && (
                    <div className="flex items-center gap-2 bg-secondary/50 p-2 rounded-xl border border-border">
                      <TicketPercent className="w-5 h-5 text-primary ml-2" />
                      <Input 
                        placeholder="Enter Coupon Code" 
                        className="h-9 bg-transparent border-none focus-visible:ring-0 w-36 text-sm" 
                        value={couponCode}
                        onChange={(e) => setCouponCode(e.target.value)}
                      />
                      <Button size="sm" className="font-bold cursor-pointer h-8" onClick={handleApplyCoupon}>Apply</Button>
                    </div>
                  )}
                </div>

                <AnimatePresence mode="wait">
                  <motion.div 
                    key={selectedPlan + (discountApplied ? '-discount' : '')}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6"
                  >
                    {planData[selectedPlan as keyof typeof planData]?.map((tier, idx) => (
                      <ChallengeCard 
                        key={tier.size} 
                        tier={tier} 
                        planName={selectedPlan} 
                        delay={idx * 0.03} 
                        discountApplied={discountApplied && (selectedPlan === 'instant' || selectedPlan === 'instant-pro')}
                      />
                    ))}
                  </motion.div>
                </AnimatePresence>
              </Tabs>
            </div>

            <div className="hidden lg:block lg:col-span-1">
              <ReferralTerminal referralCode={userData?.referralCode} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
