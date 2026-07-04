
"use client";

import { useState, useEffect } from 'react';
import { Navigation } from '@/components/Navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Gift, 
  CheckCircle2, 
  Users, 
  Zap, 
  Timer, 
  ShieldCheck, 
  Trophy, 
  ArrowRight,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import { collection, query, getDocs, where, onSnapshot } from 'firebase/firestore';
import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export default function GiveawayPage() {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  
  const [coupon, setCoupon] = useState('');
  const [claiming, setRequesting] = useState(false);
  const [claimCount, setClaimCount] = useState(0);
  const [hasClaimed, setHasClaimed] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // 1. Monitor Claim Count & User Status
  useEffect(() => {
    // Listen to total giveaway count
    const unsubCount = onSnapshot(collection(db, 'giveaways'), (snap) => {
      setClaimCount(snap.size);
    });

    // Check if current user has already claimed
    let unsubUser: any;
    if (user?.uid) {
      const q = query(collection(db, 'giveaways'), where('userId', '==', user.uid));
      unsubUser = onSnapshot(q, (snap) => {
        if (!snap.empty) setHasClaimed(true);
      });
    }

    return () => {
      unsubCount();
      if (unsubUser) unsubUser();
    };
  }, [user]);

  const handleClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast({ variant: "destructive", title: "Authentication Required", description: "Please log in to claim your giveaway." });
      return;
    }

    if (coupon.toUpperCase() !== 'PRIME500') {
      toast({ variant: "destructive", title: "Invalid Code", description: "The coupon code entered is incorrect." });
      return;
    }

    setRequesting(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/giveaway/claim', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ code: coupon.toUpperCase() })
      });

      const data = await res.json();

      if (res.ok) {
        setIsSuccess(true);
        toast({ title: "🎉 Account Granted!", description: "Check your dashboard to start trading." });
      } else {
        toast({ variant: "destructive", title: "Claim Failed", description: data.error || "Could not process claim." });
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "System Error", description: "Terminal connection fault." });
    } finally {
      setRequesting(false);
    }
  };

  const spotsRemaining = Math.max(0, 500 - claimCount);

  return (
    <div className="flex min-h-screen bg-background">
      <Navigation />
      <main className="flex-1 overflow-y-auto custom-scrollbar">
        {/* Giveaway Poster Area */}
        <div className="relative h-[300px] md:h-[400px] w-full overflow-hidden">
          <Image 
            src="https://picsum.photos/seed/pf-giveaway/1920/1080" 
            alt="Giveaway Poster" 
            fill 
            className="object-cover opacity-40"
            data-ai-hint="trading giveaway poster"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-4"
            >
              <h1 className="text-6xl md:text-8xl font-black font-headline tracking-tighter text-white uppercase italic">
                <span className="text-[#00d4ff] cyan-glow drop-shadow-[0_0_30px_rgba(0,212,255,0.5)]">GIVEAWAY</span>
              </h1>
              <p className="text-xl md:text-2xl font-bold text-white uppercase tracking-widest">
                We are giving away <span className="text-[#00d4ff]">$5,000 STEP 2 ACCOUNTS!</span>
              </p>
            </motion.div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-6 pb-20 -mt-10 relative z-10">
          {/* Stats Bar */}
          <div className="bg-[#00d4ff] text-black p-4 rounded-2xl mb-12 flex flex-wrap justify-around items-center gap-4 font-black uppercase text-[10px] md:text-xs tracking-[0.2em] shadow-[0_0_40px_rgba(0,212,255,0.2)]">
            <div className="flex items-center gap-2"><Timer className="w-4 h-4" /> Limited Time</div>
            <div className="flex items-center gap-2"><Users className="w-4 h-4" /> Only 500 Accounts</div>
            <div className="flex items-center gap-2"><Zap className="w-4 h-4" /> 100% Free</div>
            <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Keep 80% Profits</div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
            {/* What You Get Section */}
            <div className="space-y-8">
              <div>
                <h2 className="text-3xl font-headline font-bold text-white mb-2 uppercase tracking-tighter italic">What You Get</h2>
                <div className="w-20 h-1.5 bg-[#00d4ff] rounded-full" />
              </div>

              <Card className="bg-secondary/20 border-border/50 p-8 shadow-2xl">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FeatureItem text="Real Institutional Capital" />
                  <FeatureItem text="Keep up to 80% Profits" />
                  <FeatureItem text="No Time Limit" />
                  <FeatureItem text="Fair Risk Rules" />
                  <FeatureItem text="Fast Digital Payouts" />
                  <FeatureItem text="Built for Serious Traders" />
                </div>
              </Card>

              <div className="p-6 rounded-[2rem] border border-white/5 bg-white/5 backdrop-blur-sm">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-[#00d4ff]/10 flex items-center justify-center text-[#00d4ff]">
                    <Trophy className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-bold text-white">Elite Trader Eligibility</h4>
                    <p className="text-sm text-muted-foreground">Successfully passing this account qualifies you for immediate scale-up to $200k.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Claim Form Section */}
            <div className="space-y-6">
              <Card className="bg-card/40 border-[#00d4ff]/20 shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-full h-1.5 bg-[#00d4ff] shadow-[0_0_15px_rgba(0,212,255,0.5)]" />
                
                <CardHeader className="pb-8">
                  <div className="flex justify-between items-start mb-2">
                    <CardTitle className="text-2xl font-headline font-bold text-white uppercase tracking-tight">Claim Your Node</CardTitle>
                    <Badge variant="outline" className="bg-[#00d4ff]/5 text-[#00d4ff] border-[#00d4ff]/20">
                      {spotsRemaining} SPOTS LEFT
                    </Badge>
                  </div>
                  <CardDescription>Enter the exclusive community coupon code below to initialize your $5k challenge.</CardDescription>
                </CardHeader>

                <CardContent className="space-y-8">
                  <form onSubmit={handleClaim} className="space-y-6">
                    <div className="space-y-3">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Enter Coupon Code</Label>
                      <Input 
                        placeholder="e.g. PRIME500" 
                        value={coupon}
                        onChange={e => setCoupon(e.target.value.toUpperCase())}
                        className="h-14 bg-secondary/50 border-white/10 text-center text-xl font-mono tracking-[0.5em] font-bold text-white focus:border-[#00d4ff]/50 transition-all uppercase"
                        maxLength={10}
                        disabled={claiming || hasClaimed || isSuccess || spotsRemaining === 0}
                      />
                    </div>

                    <AnimatePresence mode="wait">
                      {isSuccess ? (
                        <motion.div initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} className="p-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-center">
                          <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
                          <h3 className="font-bold text-white mb-1">🎉 Account Granted!</h3>
                          <p className="text-xs text-muted-foreground mb-4">Your $5,000 Step 2 account is now live.</p>
                          <Button className="w-full h-12 font-bold" asChild>
                            <Link href="/dashboard">Access Dashboard <ArrowRight className="ml-2 w-4 h-4" /></Link>
                          </Button>
                        </motion.div>
                      ) : hasClaimed ? (
                        <div className="p-6 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-center">
                          <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
                          <p className="text-sm font-bold text-white">You have already claimed this giveaway.</p>
                          <Button variant="ghost" className="mt-4 text-xs font-bold" asChild><Link href="/dashboard">Go to Dashboard</Link></Button>
                        </div>
                      ) : spotsRemaining === 0 ? (
                        <div className="p-6 rounded-2xl bg-destructive/10 border border-destructive/30 text-center">
                          <AlertCircle className="w-8 h-8 text-destructive mx-auto mb-3" />
                          <p className="text-sm font-bold text-white">Sorry, all 500 accounts have been claimed!</p>
                        </div>
                      ) : (
                        <Button 
                          type="submit" 
                          disabled={claiming || !coupon}
                          className="w-full h-16 rounded-2xl font-black text-base md:text-lg tracking-widest cyan-box-glow bg-[#00d4ff] text-black hover:bg-[#00d4ff]/90 transition-all active:scale-95"
                        >
                          {claiming ? <Loader2 className="w-6 h-6 animate-spin" /> : "CLAIM YOUR FREE ACCOUNT NOW"}
                        </Button>
                      )}
                    </AnimatePresence>
                  </form>

                  <div className="pt-6 border-t border-white/5 space-y-4">
                     <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-[0.2em]">
                        <span className="text-muted-foreground">Spots Remaining</span>
                        <span className="text-[#00d4ff]">{spotsRemaining} / 500</span>
                     </div>
                     <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${(spotsRemaining / 500) * 100}%` }}
                          className="h-full bg-[#00d4ff] shadow-[0_0_10px_rgba(0,212,255,0.4)]"
                        />
                     </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="mt-20 text-center border-t border-white/5 pt-10">
            <p className="text-xs font-black uppercase tracking-[0.4em] text-muted-foreground/30">
              Only 500 Accounts Available | Use Coupon Code PRIME500 | Don't Miss Out!
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

function FeatureItem({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center">
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
      </div>
      <span className="text-xs font-bold text-zinc-300">{text}</span>
    </div>
  );
}
