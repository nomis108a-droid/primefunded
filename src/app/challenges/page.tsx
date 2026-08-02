"use client";

import { useState, memo, useEffect, useCallback, useRef } from 'react';
import { Navigation } from '@/components/Navigation';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChevronDown, ChevronUp, Loader2, CheckCircle2, Tag, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { db } from '@/lib/firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { validateReferralCode } from '@/lib/referral';

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

const ChallengeCard = memo(function ChallengeCard({ tier, planName, delay, hasDiscount }: { tier: any, planName: string, delay: number, hasDiscount: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const isInstant = planName.startsWith('instant');
  
  const discountMultiplier = hasDiscount && !isInstant ? 0.9 : 1.0;
  const rawFinalPrice = tier.price * discountMultiplier;
  const finalPrice = rawFinalPrice % 1 === 0 ? rawFinalPrice.toString() : rawFinalPrice.toFixed(2);

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}>
      <Card className={cn(
        "relative overflow-hidden border-border/50 hover:border-primary/50 transition-all duration-300 flex flex-col h-full bg-card/50 backdrop-blur-sm group",
        tier.popular && "ring-2 ring-primary ring-offset-2 ring-offset-background"
      )}>
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
            <div className="flex flex-col items-center justify-center min-h-[80px]">
              {hasDiscount && !isInstant ? (
                <div className="space-y-1">
                  <span className="text-sm text-muted-foreground line-through opacity-50 font-bold">${tier.price}</span>
                  <div className="text-4xl font-headline font-bold text-primary cyan-glow">${finalPrice}</div>
                  <Badge variant="outline" className="bg-emerald-500/10 border-emerald-500/30 text-emerald-500 text-[8px] uppercase tracking-tighter mt-1 font-black">
                    10% Referral Discount Active
                  </Badge>
                </div>
              ) : (
                <span className="text-4xl font-headline font-bold text-white">${tier.price}</span>
              )}
            </div>
          </div>
          
          <Button variant="ghost" onClick={() => setIsOpen(!isOpen)} className="w-full flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-primary h-9 px-4 border border-primary/20 rounded-lg cursor-pointer hover:bg-primary/5">
            View Stage Rules
            {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </Button>
          
          <AnimatePresence>
            {isOpen && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden mt-4">
                <p className="text-[10px] text-muted-foreground italic text-center leading-relaxed">Refer to Rules page for detailed breakdown of parameters, drawdown limits, and target phases.</p>
              </motion.div>
            )}
          </AnimatePresence>
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

export default function ChallengesPage() {
  const [selectedPlan, setSelectedPlan] = useState('1-step');
  const [referralInput, setReferralInput] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [isApplied, setIsApplied] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [mounted, setMounted] = useState(false);
  
  const { user, userData, loading } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);

  const isInstantPlan = selectedPlan.startsWith('instant');

  // Guard: Ensure user is logged in
  useEffect(() => {
    setMounted(true);
    if (!loading && !user) router.push('/login?redirect=/challenges');
  }, [user, loading, router]);

  // Robust handleApplyReferral for manual and auto triggers
  const handleApplyReferral = useCallback(async (manualCode?: string, isAutoApply = false) => {
    const codeToUse = (manualCode || referralInput).trim().toUpperCase();
    if (!user || !codeToUse) {
      setIsValidating(false);
      return;
    }

    // Optimization: Skip if already applied correctly
    if (isApplied && codeToUse === localStorage.getItem('appliedReferralCode')) {
      setIsValidating(false);
      return;
    }
    
    setIsValidating(true);
    setErrorMessage('');
    
    try {
      const referrerUid = await validateReferralCode(codeToUse);
      
      if (!referrerUid) {
        if (!isAutoApply) setErrorMessage('Invalid referral code.');
        setIsApplied(false);
      } else if (referrerUid === user.uid) {
        if (!isAutoApply) setErrorMessage('You cannot use your own referral code.');
        setIsApplied(false);
      } else {
        // Successful validation
        if (userData && userData.referredBy !== referrerUid) {
          await updateDoc(doc(db, 'users', user.uid), {
            referredBy: referrerUid,
            updatedAt: serverTimestamp()
          });
        }
        
        setIsApplied(true);
        localStorage.setItem('referralCode', codeToUse);
        localStorage.setItem('pf_referral_code', codeToUse);
        localStorage.setItem('appliedReferralCode', codeToUse);
        
        if (!isAutoApply) {
          toast({ title: "Referral Applied!", description: "10% discount activated for eligible challenges." });
        }
      }
    } catch (e: any) {
      if (!isAutoApply) setErrorMessage('Verification system offline.');
    } finally {
      setIsValidating(false);
    }
  }, [user, userData, referralInput, isApplied, toast]);

  // Automatic detection, auto-fill and hands-free application
  useEffect(() => {
    if (!mounted || loading || !user) return;

    // Check storage/URL for pending code
    const storedCode = localStorage.getItem('referralCode') || localStorage.getItem('pf_referral_code');
    const urlCode = searchParams.get('ref');
    const effectiveCode = urlCode || storedCode;

    // 1. Handle profile-based referral (user already has a referrer in DB)
    if (userData?.referredBy && !isApplied) {
      setIsApplied(true);
      if (effectiveCode && !referralInput) {
        setReferralInput(effectiveCode.toUpperCase());
      }
      return;
    }

    // 2. Handle programmatic auto-fill and apply
    if (effectiveCode && !isApplied && !isValidating && !errorMessage) {
      console.log('[Challenges] Auto-applying detected code:', effectiveCode);
      
      // Programmatically sync the input element if it exists in DOM
      if (inputRef.current) {
        const input = inputRef.current;
        input.value = effectiveCode.toUpperCase();
        // Trigger events to simulate user interaction
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }

      setReferralInput(effectiveCode.toUpperCase());
      handleApplyReferral(effectiveCode, true);
    }
  }, [mounted, userData, user, loading, isApplied, isValidating, errorMessage, handleApplyReferral, searchParams]);

  if (!mounted || loading || !user) {
    return (
      <div className="flex min-h-screen bg-background items-center justify-center flex-col gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground animate-pulse">Syncing Terminal Node...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background text-white">
      <Navigation />
      <main className="flex-1 p-8 overflow-y-auto custom-scrollbar">
        <div className="max-w-7xl mx-auto">
          <header className="mb-10">
            <h1 className="text-4xl font-headline font-bold mb-2">Select Your Challenge</h1>
            <p className="text-muted-foreground">Institutional funding starting from $5,000 up to $300,000.</p>
          </header>

          <AnimatePresence>
            {!isInstantPlan && (
              <motion.section 
                initial={{ opacity: 0, height: 0 }} 
                animate={{ opacity: 1, height: 'auto' }} 
                exit={{ opacity: 0, height: 0 }}
                className="mb-12 overflow-hidden"
              >
                <Card className={cn(
                  "border-border/50 p-6 md:p-8 rounded-[2rem] relative overflow-hidden transition-all duration-500",
                  isApplied ? "bg-emerald-500/10 border-emerald-500/30" : "bg-secondary/20"
                )}>
                  <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 blur-3xl -mr-32 -mt-32 rounded-full" />
                  <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "w-12 h-12 rounded-2xl flex items-center justify-center transition-colors",
                        isApplied ? "bg-emerald-500/20 text-emerald-500" : "bg-primary/10 text-primary"
                      )}>
                        {isApplied ? <CheckCircle2 className="w-6 h-6" /> : <Tag className="w-6 h-6" />}
                      </div>
                      <div>
                        <h3 className="text-lg font-bold">{isApplied ? "Referral Applied Successfully" : "Referral Discount"}</h3>
                        <p className="text-xs text-muted-foreground">
                          {isApplied ? "Your 10% discount is currently active for this challenge." : "Enter a code to unlock 10% off Step 1, 2, and 3 challenges."}
                        </p>
                      </div>
                    </div>
                    
                    <div className="w-full md:w-auto flex flex-col gap-2">
                      <div className="flex gap-2">
                        <div className="relative w-full md:w-80">
                          <Input 
                            ref={inputRef}
                            placeholder="ENTER CODE" 
                            value={referralInput}
                            onChange={e => setReferralInput(e.target.value.toUpperCase())}
                            className={cn(
                              "h-11 font-mono font-bold tracking-widest bg-background/50 uppercase transition-all",
                              isApplied ? "border-emerald-500/50 text-emerald-500 pr-10" : "border-border/50"
                            )}
                          />
                          {isApplied && <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500" />}
                        </div>
                        <Button 
                          onClick={() => handleApplyReferral()} 
                          disabled={isValidating || !referralInput || isApplied}
                          className="h-11 px-6 font-bold cyan-box-glow"
                        >
                          {isValidating ? <Loader2 className="w-4 h-4 animate-spin" /> : isApplied ? 'Applied' : 'Apply'}
                        </Button>
                      </div>
                      {isApplied ? (
                        <p className="text-[10px] font-black uppercase text-emerald-500 tracking-widest text-center md:text-left">✓ 10% Referral Discount Activated</p>
                      ) : errorMessage ? (
                        <p className="text-[10px] font-black uppercase text-destructive tracking-widest text-center md:text-left">{errorMessage}</p>
                      ) : null}
                    </div>
                  </div>
                </Card>
              </motion.section>
            )}
          </AnimatePresence>

          <Tabs value={selectedPlan} onValueChange={setSelectedPlan} className="w-full">
            <TabsList className="grid w-full max-w-4xl grid-cols-5 h-12 bg-secondary/50 p-1 rounded-xl mb-10 border border-white/5">
              <TabsTrigger value="1-step" className="font-bold rounded-lg cursor-pointer text-xs">1-Step</TabsTrigger>
              <TabsTrigger value="2-step" className="font-bold rounded-lg cursor-pointer text-xs">2-Step</TabsTrigger>
              <TabsTrigger value="3-step" className="font-bold rounded-lg cursor-pointer text-xs">3-Step</TabsTrigger>
              <TabsTrigger value="instant" className="font-bold rounded-lg cursor-pointer text-xs">Instant</TabsTrigger>
              <TabsTrigger value="instant-pro" className="font-bold rounded-lg cursor-pointer text-xs">Instant Pro</TabsTrigger>
            </TabsList>

            <AnimatePresence mode="wait">
              <motion.div key={selectedPlan} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {planData[selectedPlan as keyof typeof planData]?.map((tier, idx) => (
                  <ChallengeCard key={tier.size} tier={tier} planName={selectedPlan} delay={idx * 0.03} hasDiscount={isApplied} />
                ))}
              </motion.div>
            </AnimatePresence>
          </Tabs>
        </div>
      </main>
    </div>
  );
}
