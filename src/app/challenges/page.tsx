"use client";

import { useState, memo, useEffect, useMemo } from 'react';
import { Navigation } from '@/components/Navigation';
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Check, ChevronDown, ChevronUp, Skull, AlertTriangle, AlertCircle, Copy, Link as LinkIcon, ExternalLink, Loader2, CheckCircle2, RefreshCw, Timer, Zap } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { collection, query, where, orderBy, limit } from 'firebase/firestore';
import { useCollection } from '@/firebase';

/**
 * PROMO CONFIGURATION
 * Centralized settings for the 50% OFF campaign
 */
const PROMO_CONFIG = {
  discountPercent: 50,
  // Set to 7 days from now (approx Feb 25, 2025)
  endDate: new Date('2025-02-25T23:59:59Z'),
  label: "50% OFF ANNIVERSARY SPECIAL"
};

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
    { size: '$5,000', price: 69 },
    { size: '$10,000', price: 129 },
    { size: '$25,000', price: 249 },
    { size: '$50,000', price: 449 },
    { size: '$100,000', price: 699, popular: true },
    { size: '$200,000', price: 1300 },
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

const ChallengeCard = memo(function ChallengeCard({ tier, planName, delay, isPromoActive }: { tier: any, planName: string, delay: number, isPromoActive: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const { user } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [coupon5k, setCoupon5k] = useState('');
  const [coupon5kError, setCoupon5kError] = useState('');
  const [coupon5kLoading, setCoupon5kLoading] = useState(false);
  const [coupon5kExpired, setCoupon5kExpired] = useState(false);
  const [coupon5kSuccess, setCoupon5kSuccess] = useState(false);

  // Gate States for Giveaway
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  const [isLive, setIsLive] = useState(false);
  const [followConfirmed, setFollowConfirmed] = useState(false);

  const isFree5kTier = planName === '2-step' && tier.size === '$5,000' && !isPromoActive;

  useEffect(() => {
    if (!isFree5kTier) return;
    
    // Timer Logic for Giveaway
    const target = new Date('2026-07-05T12:30:00Z');
    const tick = () => {
      const now = new Date();
      const diff = target.getTime() - now.getTime();
      if (diff <= 0) { setIsLive(true); return; }
      setTimeLeft({
        days: Math.floor(diff / 86400000),
        hours: Math.floor((diff % 86400000) / 3600000),
        minutes: Math.floor((diff % 3600000) / 60000),
        seconds: Math.floor((diff % 60000) / 1000)
      });
    };
    tick();
    const t = setInterval(tick, 1000);

    const checkExpiry = async () => {
      const { getDocs, collection } = await import('firebase/firestore');
      const snap = await getDocs(collection(db, 'giveaways'));
      if (snap.size >= 500) setCoupon5kExpired(true);
    };
    checkExpiry();

    return () => clearInterval(t);
  }, [isFree5kTier]);

  const discountedPrice = useMemo(() => {
    if (!isPromoActive) return String(tier.price);
    const calculated = tier.price * (1 - PROMO_CONFIG.discountPercent / 100);
    return calculated.toFixed(2).replace('.00', '');
  }, [tier.price, isPromoActive]);

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

        {isPromoActive && (
          <div className="absolute top-0 left-0 z-10">
            <div className="bg-accent text-accent-foreground text-[10px] font-black px-3 py-1 rounded-br-lg uppercase tracking-widest animate-pulse shadow-lg">50% OFF</div>
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
            {isFree5kTier ? (
              <div className="text-center">
                <span className="text-3xl font-black text-primary line-through opacity-40">$39</span>
                <div className="text-3xl font-black text-green-400">FREE</div>
                <div className="text-[10px] text-zinc-400 uppercase tracking-widest">With Coupon Code</div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center">
                {isPromoActive ? (
                  <div className="flex flex-col items-center">
                    <span className="text-xl font-bold text-destructive/60 line-through decoration-destructive mb-1">
                      ${tier.price}
                    </span>
                    <span className="text-4xl font-headline font-bold text-primary cyan-glow">
                      ${discountedPrice}
                    </span>
                  </div>
                ) : (
                  <span className="text-3xl font-headline font-bold text-white">
                    ${tier.price}
                  </span>
                )}
              </div>
            )}
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
          {isFree5kTier ? (
            coupon5kExpired ? (
              <div className="w-full py-3 text-center text-red-400 font-bold text-sm border border-red-400/30 rounded-lg bg-red-400/5">
                🚫 Offer Expired — All 500 Slots Claimed
              </div>
            ) : coupon5kSuccess ? (
              <div className="w-full p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center space-y-2">
                <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto" />
                <p className="text-[11px] font-bold text-emerald-400 leading-tight">✅ Claim submitted! Admin will review and approve within 24 hours.</p>
              </div>
            ) : (!isLive || !followConfirmed) ? (
              <div className="space-y-3 w-full">
                <a 
                  href="https://www.instagram.com/primefunded.fund?utm_source=qr&igsh=Z2NwNmJzaHB1dXNh"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{background: 'linear-gradient(135deg, #833ab4, #fd1d1d, #fcb045)'}}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-white text-sm hover:scale-[1.02] transition-transform"
                  onClick={() => setTimeout(() => setFollowConfirmed(true), 2000)}
                >
                  Follow on Instagram to Participate
                </a>
                {!isLive && (
                  <div className="grid grid-cols-4 gap-1 text-center">
                    {[['D', timeLeft.days], ['H', timeLeft.hours], ['M', timeLeft.minutes], ['S', timeLeft.seconds]].map(([l, v]) => (
                      <div key={l as string} className="bg-zinc-900 rounded-lg p-2">
                        <div className="text-lg font-black text-primary tabular-nums">{String(v).padStart(2,'0')}</div>
                        <div className="text-[8px] text-zinc-500 uppercase font-bold">{l as string}</div>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-[9px] text-zinc-500 text-center">Follow Instagram + wait for launch to claim</p>
              </div>
            ) : (
              <div className="space-y-2 w-full">
                <Input
                  placeholder="Enter coupon code (e.g. PRIME500)"
                  value={coupon5k}
                  onChange={e => { setCoupon5k(e.target.value.toUpperCase()); setCoupon5kError(''); }}
                  className="bg-zinc-900 border-zinc-700 text-white h-11 text-center font-mono tracking-widest uppercase"
                />
                {coupon5kError && <p className="text-red-400 text-xs text-center font-bold">{coupon5kError}</p>}
                <Button
                  className="w-full h-12 font-black cyan-box-glow"
                  disabled={coupon5kLoading}
                  onClick={async () => {
                    if (!user) { router.push('/login?redirect=/challenges'); return; }
                    if (coupon5k !== 'PRIME500') { setCoupon5kError('Invalid coupon code'); return; }
                    setCoupon5kLoading(true);
                    try {
                      const token = await user.getIdToken();
                      const res = await fetch('/api/giveaway/claim', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                        body: JSON.stringify({ code: 'PRIME500' })
                      });
                      const data = await res.json();
                      if (!res.ok) throw new Error(data.error);
                      toast({ title: '🎉 Claim Submitted!', description: 'Admin will review and approve within 24 hours.' });
                      setCoupon5kSuccess(true);
                    } catch (err: any) {
                      setCoupon5kError(err.message);
                    } finally {
                      setCoupon5kLoading(false);
                    }
                  }}
                >
                  {coupon5kLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Claim Free Account'}
                </Button>
                <p className="text-[9px] text-zinc-500 text-center">500 slots only • Expires when full</p>
              </div>
            )
          ) : (
            <Button className="w-full h-11 font-bold rounded-xl cyan-box-glow cursor-pointer" asChild>
              <Link href={`/payment?plan=${planName}&size=${tier.size}&price=$${discountedPrice}`}>
                Start Challenge
              </Link>
            </Button>
          )}
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
  const [isPromoActive, setIsPromoActive] = useState(false);
  const [promoTimeLeft, setPromoTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  
  const { user, userData, loading } = useAuth();
  const router = useRouter();

  const tradeConstraints = useMemo(() => user?.uid ? [where('userId', '==', user.uid), orderBy('submittedAt', 'desc'), limit(1)] : [], [user?.uid]);
  const { data: userOrders } = useCollection<any>(user?.uid ? 'orders' : null, tradeConstraints);
  const latestOrder = userOrders[0];
  const hasRecentRejection = latestOrder?.status === 'rejected';

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const diff = PROMO_CONFIG.endDate.getTime() - now.getTime();
      if (diff <= 0) {
        setIsPromoActive(false);
        return;
      }
      setIsPromoActive(true);
      setPromoTimeLeft({
        days: Math.floor(diff / 86400000),
        hours: Math.floor((diff % 86400000) / 3600000),
        minutes: Math.floor((diff % 3600000) / 60000),
        seconds: Math.floor((diff % 60000) / 1000)
      });
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login?redirect=/challenges');
    }
  }, [user, loading, router]);

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
              
              <AnimatePresence>
                {isPromoActive && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="p-6 rounded-[2rem] bg-accent/10 border border-accent/20 flex flex-col md:flex-row items-center justify-between gap-6 shadow-[0_0_50px_rgba(17,179,245,0.1)] relative overflow-hidden"
                  >
                    <div className="absolute top-0 left-0 w-full h-full bg-grid-white opacity-5 pointer-events-none" />
                    <div className="flex items-center gap-4 relative z-10">
                      <div className="w-14 h-14 rounded-2xl bg-accent/20 flex items-center justify-center shadow-lg">
                        <Zap className="w-8 h-8 text-accent fill-accent" />
                      </div>
                      <div>
                        <h3 className="text-2xl font-headline font-bold text-white uppercase italic tracking-tighter">FLASH SALE: 50% OFF SITE-WIDE</h3>
                        <p className="text-accent text-xs font-black uppercase tracking-[0.2em]">Limited Time Anniversary Special</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 relative z-10">
                       <div className="text-right hidden md:block">
                          <p className="text-[10px] font-black uppercase text-zinc-500 tracking-widest mb-1">OFFER EXPIRES IN</p>
                          <div className="flex gap-2">
                             <TimeBox value={promoTimeLeft.days} label="D" />
                             <TimeBox value={promoTimeLeft.hours} label="H" />
                             <TimeBox value={promoTimeLeft.minutes} label="M" />
                             <TimeBox value={promoTimeLeft.seconds} label="S" />
                          </div>
                       </div>
                       <Badge className="h-10 px-6 bg-accent text-accent-foreground font-black text-sm rounded-xl">SAVE 50% NOW</Badge>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {hasRecentRejection && (
                <div className="p-6 rounded-2xl bg-destructive/10 border border-destructive/20 flex flex-col md:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <AlertCircle className="text-destructive w-6 h-6" />
                    <div>
                      <p className="text-sm font-bold text-white">Your payment for {latestOrder.accountSize} was rejected.</p>
                      <p className="text-xs text-destructive/80">Reason: {latestOrder.rejectionReason || "Verification failed"}. You can try again to resubmit your payment.</p>
                    </div>
                  </div>
                  <Button variant="destructive" size="sm" className="font-bold px-6 h-10" onClick={() => {
                    const planMap: any = { '1-Step Pro': '1-step', '2-Step Classic': '2-step', '3-Step Classic': '3-step', 'Instant Funding': 'instant', 'Instant Pro': 'instant-pro' };
                    const planSlug = planMap[latestOrder.plan] || '1-step';
                    router.push(`/payment?plan=${planSlug}&size=${latestOrder.accountSize}&price=$${latestOrder.amountPaid}`);
                  }}>
                    <RefreshCw className="w-4 h-4 mr-2" /> Try Again
                  </Button>
                </div>
              )}

              <Tabs defaultValue="1-step" className="w-full" onValueChange={(val) => {
                setSelectedPlan(val);
              }}>
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10">
                  <TabsList className="grid w-full max-w-4xl grid-cols-5 h-12 bg-secondary p-1 rounded-xl">
                    <TabsTrigger value="1-step" className="data-[state=active]:bg-background font-bold rounded-lg cursor-pointer">1-Step</TabsTrigger>
                    <TabsTrigger value="2-step" className="data-[state=active]:bg-background font-bold rounded-lg cursor-pointer">2-Step</TabsTrigger>
                    <TabsTrigger value="3-step" className="data-[state=active]:bg-background font-bold rounded-lg cursor-pointer">3-Step</TabsTrigger>
                    <TabsTrigger value="instant" className="data-[state=active]:bg-background font-bold rounded-lg cursor-pointer">Instant</TabsTrigger>
                    <TabsTrigger value="instant-pro" className="data-[state=active]:bg-background font-bold rounded-lg cursor-pointer">Instant Pro</TabsTrigger>
                  </TabsList>
                </div>

                <AnimatePresence mode="wait">
                  <motion.div 
                    key={selectedPlan}
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
                        isPromoActive={isPromoActive}
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

function TimeBox({ value, label }: { value: number, label: string }) {
  return (
    <div className="bg-background/80 px-2 py-1 rounded-md border border-accent/20 min-w-[34px] text-center">
       <p className="text-xs font-black text-white tabular-nums">{String(value).padStart(2, '0')}</p>
       <p className="text-[7px] font-bold text-accent">{label}</p>
    </div>
  );
}
