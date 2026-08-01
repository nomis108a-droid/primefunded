"use client";

import { useState, memo, useEffect, useMemo } from 'react';
import { Navigation } from '@/components/Navigation';
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Check, ChevronDown, ChevronUp, Skull, AlertTriangle, AlertCircle, Copy, Loader2, CheckCircle2, XCircle, Zap, Tag } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
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
  const router = useRouter();

  const isInstant = planName.startsWith('instant');
  const finalPrice = hasDiscount && !isInstant ? (tier.price * 0.9).toFixed(2) : String(tier.price);

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}>
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
            <div className="flex flex-col items-center justify-center">
              {hasDiscount && !isInstant ? (
                <div className="space-y-1">
                  <span className="text-sm text-muted-foreground line-through opacity-50">${tier.price}</span>
                  <div className="text-3xl font-headline font-bold text-primary cyan-glow">${finalPrice}</div>
                  <Badge variant="outline" className="bg-accent/10 border-accent/30 text-accent text-[8px] uppercase tracking-tighter">Referral Discount Applied</Badge>
                </div>
              ) : (
                <span className="text-3xl font-headline font-bold text-white">${tier.price}</span>
              )}
            </div>
          </div>
          
          <Button variant="ghost" onClick={() => setIsOpen(!isOpen)} className="w-full flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-primary h-9 px-4 border border-primary/20 rounded-lg cursor-pointer">
            View Stage Rules
            {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </Button>
          
          <AnimatePresence>
            {isOpen && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden mt-4">
                <p className="text-[10px] text-muted-foreground italic text-center">Refer to Rules page for detailed breakdown of parameters.</p>
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
  
  const { user, userData, loading } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  const isInstantPlan = selectedPlan.startsWith('instant');

  useEffect(() => {
    if (!loading && !user) router.push('/login?redirect=/challenges');
  }, [user, loading, router]);

  useEffect(() => {
    // 1. Initial Load: Check if user is already associated with a referrer
    if (userData?.referredBy && !isApplied) {
      setIsApplied(true);
    } 
    
    // 2. Local Storage check: If they clicked a link but haven't applied yet
    const storedCode = localStorage.getItem('pf_referral_code');
    if (storedCode && !isApplied && !userData?.referredBy) {
      setReferralInput(storedCode);
      handleApplyReferral(storedCode);
    }
  }, [userData, isApplied]);

  const handleApplyReferral = async (manualCode?: string) => {
    const codeToUse = (manualCode || referralInput).trim().toUpperCase();
    if (!user || !codeToUse || isApplied) return;
    
    setIsValidating(true);
    setErrorMessage('');

    try {
      const referrerUid = await validateReferralCode(codeToUse);
      if (!referrerUid) {
        setErrorMessage('Invalid referral code.');
        if (!manualCode) {
           toast({ variant: "destructive", title: "Invalid Code", description: "This referral code does not exist." });
        }
      } else if (referrerUid === user.uid) {
        setErrorMessage('You cannot refer yourself.');
        if (!manualCode) {
          toast({ variant: "destructive", title: "Self-Referral", description: "You cannot use your own code." });
        }
      } else {
        await updateDoc(doc(db, 'users', user.uid), {
          referredBy: referrerUid,
          updatedAt: serverTimestamp()
        });
        setIsApplied(true);
        // Ensure it's stored for future page loads
        localStorage.setItem('pf_referral_code', codeToUse);
        toast({ title: "Referral Applied!", description: "10% discount has been activated for challenges." });
      }
    } catch (e: any) {
      setErrorMessage(e.message);
    } finally {
      setIsValidating(false);
    }
  };

  if (loading || !user) return <div className="flex min-h-screen bg-background items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="flex min-h-screen bg-background text-white">
      <Navigation />
      <main className="flex-1 p-8 overflow-y-auto custom-scrollbar">
        <div className="max-w-7xl mx-auto">
          <header className="mb-10">
            <h1 className="text-4xl font-headline font-bold mb-2">Select Your Challenge</h1>
            <p className="text-muted-foreground">Institutional funding starting from $5,000 up to $300,000.</p>
          </header>

          {/* Referral Code Entry Section - Hidden for Instant Plans */}
          <AnimatePresence>
            {!isInstantPlan && (
              <motion.section 
                initial={{ opacity: 0, height: 0 }} 
                animate={{ opacity: 1, height: 'auto' }} 
                exit={{ opacity: 0, height: 0 }}
                className="mb-12 overflow-hidden"
              >
                <Card className="bg-secondary/20 border-border/50 p-6 md:p-8 rounded-[2rem] relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 blur-3xl -mr-32 -mt-32 rounded-full" />
                  <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                        <Tag className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold">Referral Discount</h3>
                        <p className="text-xs text-muted-foreground">Unlock 10% off your challenge by applying a referral code.</p>
                      </div>
                    </div>
                    
                    <div className="w-full md:w-auto flex flex-col gap-2">
                      <div className="flex gap-2">
                        <div className="relative w-full md:w-80">
                          <Input 
                            placeholder={isApplied ? "✅ Referral Discount Applied" : "ENTER CODE"} 
                            value={isApplied ? "" : referralInput}
                            onChange={e => setReferralInput(e.target.value.toUpperCase())}
                            readOnly={isApplied}
                            className={cn(
                              "h-11 font-mono font-bold tracking-widest bg-background/50 uppercase",
                              isApplied && "border-accent text-accent pr-10 placeholder:text-accent placeholder:opacity-100"
                            )}
                          />
                          {isApplied && <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-accent" />}
                        </div>
                        {!isApplied && (
                          <Button 
                            onClick={() => handleApplyReferral()} 
                            disabled={isValidating || !referralInput}
                            className="h-11 px-6 font-bold cyan-box-glow"
                          >
                            {isValidating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Apply'}
                          </Button>
                        )}
                      </div>
                      {isApplied ? (
                        <p className="text-[10px] font-black uppercase text-accent tracking-widest text-center md:text-left">✅ 10% Referral Discount Active</p>
                      ) : errorMessage ? (
                        <p className="text-[10px] font-black uppercase text-destructive tracking-widest text-center md:text-left">{errorMessage}</p>
                      ) : null}
                    </div>
                  </div>
                </Card>
              </motion.section>
            )}
          </AnimatePresence>

          <Tabs defaultValue="1-step" className="w-full" onValueChange={setSelectedPlan}>
            <TabsList className="grid w-full max-w-4xl grid-cols-5 h-12 bg-secondary p-1 rounded-xl mb-10">
              <TabsTrigger value="1-step" className="font-bold rounded-lg cursor-pointer">1-Step</TabsTrigger>
              <TabsTrigger value="2-step" className="font-bold rounded-lg cursor-pointer">2-Step</TabsTrigger>
              <TabsTrigger value="3-step" className="font-bold rounded-lg cursor-pointer">3-Step</TabsTrigger>
              <TabsTrigger value="instant" className="font-bold rounded-lg cursor-pointer">Instant</TabsTrigger>
              <TabsTrigger value="instant-pro" className="font-bold rounded-lg cursor-pointer">Instant Pro</TabsTrigger>
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
