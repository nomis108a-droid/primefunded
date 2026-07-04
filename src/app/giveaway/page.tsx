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
  AlertCircle,
  Instagram
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export default function GiveawayPage() {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  
  const [coupon, setCoupon] = useState('');
  const [claiming, setRequesting] = useState(false);
  const [hasClaimed, setHasClaimed] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // Countdown and Gate States
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  const [isLive, setIsLive] = useState(false);
  const [followConfirmed, setFollowConfirmed] = useState(false);

  // 1. Countdown Timer Effect
  useEffect(() => {
    const target = new Date('2026-07-05T12:30:00Z'); // 6PM IST = 12:30 UTC (July 5, 2026)
    const tick = () => {
      const now = new Date();
      const diff = target.getTime() - now.getTime();
      if (diff <= 0) {
        setIsLive(true);
        return;
      }
      setTimeLeft({
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

  // 2. Monitor User Status
  useEffect(() => {
    let unsubUser: any;
    if (user?.uid) {
      const q = query(collection(db, 'giveaways'), where('userId', '==', user.uid));
      unsubUser = onSnapshot(q, (snap) => {
        if (!snap.empty) setHasClaimed(true);
      });
    }

    return () => {
      if (unsubUser) unsubUser();
    };
  }, [user]);

  const handleClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast({ variant: "destructive", title: "Authentication Required", description: "Please login first to claim your free account." });
      router.push('/login?redirect=/giveaway');
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
        toast({ title: "✅ Claim Submitted!", description: "Your request is under admin review." });
      } else {
        toast({ variant: "destructive", title: "Claim Failed", description: data.error || "Could not process claim." });
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "System Error", description: "Terminal connection fault." });
    } finally {
      setRequesting(false);
    }
  };

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
                      500 TOTAL SPOTS
                    </Badge>
                  </div>
                  <CardDescription>Follow our community and enter the exclusive coupon code to launch your challenge.</CardDescription>
                </CardHeader>

                <CardContent className="space-y-8">
                  {/* Instagram Follow Gate */}
                  <div className="border border-pink-500/30 bg-pink-500/5 rounded-2xl p-6 mb-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 flex items-center justify-center">
                        <Instagram className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <p className="font-bold text-white text-sm">Step 1: Follow us on Instagram</p>
                        <p className="text-xs text-zinc-400">Required to participate in the giveaway</p>
                      </div>
                    </div>
                    
                    <a 
                      href="https://www.instagram.com/primefunded.fund?utm_source=qr&igsh=Z2NwNmJzaHB1dXNh"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-white mb-3 hover:scale-[1.02] transition-transform"
                      style={{background: 'linear-gradient(135deg, #833ab4, #fd1d1d, #fcb045)'}}
                      onClick={() => setTimeout(() => setFollowConfirmed(true), 2000)}
                    >
                      Follow @primefunded.fund
                    </a>
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={followConfirmed}
                        onChange={e => setFollowConfirmed(e.target.checked)}
                        className="w-4 h-4 accent-pink-500 rounded border-white/20"
                      />
                      <span className="text-xs text-zinc-300 group-hover:text-white transition-colors">I confirm I am following @primefunded.fund on Instagram</span>
                    </label>
                  </div>

                  {/* Countdown Timer */}
                  {!isLive && (
                    <div className="text-center mb-6">
                      <p className="text-xs text-zinc-400 uppercase tracking-widest mb-3 font-bold">Giveaway Goes Live In</p>
                      <div className="grid grid-cols-4 gap-3">
                        {[['days', timeLeft.days], ['hours', timeLeft.hours], ['mins', timeLeft.minutes], ['secs', timeLeft.seconds]].map(([label, val]) => (
                          <div key={label as string} className="bg-zinc-900 border border-zinc-700 rounded-xl p-3 text-center">
                            <div className="text-3xl font-black text-primary tabular-nums">{String(val).padStart(2,'0')}</div>
                            <div className="text-[9px] text-zinc-500 uppercase font-bold mt-1">{label as string}</div>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-zinc-500 mt-3">Sunday, July 5 at 6:00 PM IST</p>
                    </div>
                  )}

                  {isLive && (
                    <div className="flex items-center justify-center gap-2 mb-4 py-2 rounded-full bg-green-500/10 border border-green-500/30">
                      <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
                      <span className="text-green-400 text-xs font-black uppercase tracking-widest">Giveaway is LIVE!</span>
                    </div>
                  )}

                  {(!isLive || !followConfirmed) ? (
                    <div className="text-center py-8 rounded-xl bg-secondary/20 border border-border/50 text-zinc-500 text-sm italic">
                      {!followConfirmed ? '👆 Follow us on Instagram first to unlock the claim form' : '⏳ Claim form unlocks when giveaway goes live'}
                    </div>
                  ) : (
                    <form onSubmit={handleClaim} className="space-y-6">
                      <div className="space-y-3">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Enter Coupon Code</Label>
                        <Input 
                          placeholder="e.g. PRIME500" 
                          value={coupon}
                          onChange={e => setCoupon(e.target.value.toUpperCase())}
                          className="h-14 bg-secondary/50 border-white/10 text-center text-xl font-mono tracking-[0.5em] font-bold text-white focus:border-[#00d4ff]/50 transition-all uppercase"
                          maxLength={10}
                          disabled={claiming || hasClaimed || isSuccess}
                        />
                      </div>

                      <AnimatePresence mode="wait">
                        {isSuccess ? (
                          <motion.div initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} className="p-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-center">
                            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
                            <h3 className="font-bold text-white mb-1">✅ Claim Submitted!</h3>
                            <p className="text-xs text-muted-foreground mb-4">Your free $5,000 account request is under admin review. You'll receive an email once approved (usually within 24 hours).</p>
                            <Button className="w-full h-12 font-bold" asChild>
                              <Link href="/dashboard">Return to Dashboard <ArrowRight className="ml-2 w-4 h-4" /></Link>
                            </Button>
                          </motion.div>
                        ) : hasClaimed ? (
                          <div className="p-6 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-center">
                            <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
                            <p className="text-sm font-bold text-white">You have already claimed this giveaway.</p>
                            <Button variant="ghost" className="mt-4 text-xs font-bold" asChild><Link href="/dashboard">Go to Dashboard</Link></Button>
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
                  )}
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
