"use client";

import { useMemo, useState, useEffect, useCallback, memo } from 'react';
import { Navigation } from '@/components/Navigation';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Users, 
  Copy, 
  TrendingUp, 
  DollarSign, 
  CheckCircle2, 
  Clock, 
  Link as LinkIcon,
  Twitter,
  Send,
  MessageCircle,
  RefreshCw,
  AlertCircle,
  Edit2,
  Check,
  X,
  Loader2,
  AlertTriangle,
  Lock,
  XCircle,
  Info
} from 'lucide-react';
import { useCollection, useFirestore } from '@/firebase';
import { auth } from '@/lib/firebase';
import { where, doc, updateDoc, query, collection, getDocs, setDoc, serverTimestamp, limit, orderBy, getDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';

const StatSmall = memo(function StatSmall({ title, value, icon, color = 'blue' }: { title: string, value: string | number, icon: any, color?: string }) {
  const colorMap: any = {
    blue: 'text-primary bg-primary/10 border-primary/20',
    amber: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
    green: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
  };
  return (
    <Card className="bg-secondary/30 border-border/50 p-6 group hover:border-primary/20 transition-colors">
      <div className={`p-2 rounded-lg w-fit mb-3 border transition-transform group-hover:scale-110 ${colorMap[color]}`}>{icon}</div>
      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{title}</p>
      <p className="text-2xl font-bold font-headline tabular-nums text-white">{value}</p>
    </Card>
  );
});

const StepItem = memo(function StepItem({ step, icon, title, desc }: { step: string, icon: any, title: string, desc: string }) {
  return (
    <div className="p-8 rounded-2xl bg-secondary/20 border border-border flex flex-col items-center text-center group hover:border-primary/50 transition-all">
      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-6 border border-primary/20 group-hover:scale-110 transition-transform relative">
        {icon}
        <div className="absolute -top-2 -right-2 w-6 h-6 bg-primary text-primary-foreground rounded-full text-xs font-bold flex items-center justify-center border-2 border-background">{step}</div>
      </div>
      <h3 className="font-bold text-lg mb-2 text-white">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
    </div>
  );
});

export default function ReferralPage() {
  const { user, userData, loading: authLoading } = useAuth();
  const db = useFirestore();
  const { toast } = useToast();
  
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [availabilityStatus, setAvailabilityStatus] = useState<'idle' | 'validating' | 'available' | 'taken' | 'invalid' | 'too-short'>('idle');
  const [isSaving, setIsSaving] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [initializing, setInitializing] = useState(true);

  const MIN_WITHDRAWAL = 100;
  const MAX_CHANGES = 3;

  const generateUniqueCode = useCallback(() => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }, []);

  useEffect(() => {
    const initializeReferralData = async (userId: string) => {
      if (!auth.currentUser) return;
      try {
        const userRef = doc(db, 'users', userId);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
          const data = userSnap.data();
          const updates: any = {};
          let shouldUpdate = false;

          if (!data?.referralCode) {
            const code = generateUniqueCode();
            updates.referralCode = code;
            updates.codeChangesCount = 0;
            updates.referralCount = 0;
            updates.referralEarnings = 0;
            updates.pendingReferralEarnings = 0;
            updates.paidReferralEarnings = 0;
            shouldUpdate = true;

            const codeRegRef = doc(db, 'referralCodes', code);
            setDoc(codeRegRef, {
              code,
              userId: userId,
              active: true,
              createdAt: serverTimestamp()
            }).catch(() => {});
          }

          if (shouldUpdate) {
            updateDoc(userRef, updates).catch(async (err: any) => {
              if (err.code === 'permission-denied') {
                errorEmitter.emit('permission-error', new FirestorePermissionError({ 
                  path: userRef.path, 
                  operation: 'update',
                  requestResourceData: updates
                }));
              }
            });
          }
        }
      } catch (err) {
      } finally {
        setInitializing(false);
      }
    };

    if (user && !authLoading) {
      initializeReferralData(user.uid);
    } else if (!authLoading && !user) {
      setInitializing(false);
    }
  }, [user, authLoading, db, generateUniqueCode]);

  useEffect(() => {
    if (!isEditing || !newCode || !auth.currentUser) {
      setAvailabilityStatus('idle');
      return;
    }

    if (newCode.length < 4) {
      setAvailabilityStatus('too-short');
      return;
    }

    const alphanumericRegex = /^[A-Z0-9]+$/;
    if (!alphanumericRegex.test(newCode)) {
      setAvailabilityStatus('invalid');
      return;
    }

    if (newCode === userData?.referralCode) {
      setAvailabilityStatus('available');
      return;
    }

    const timeout = setTimeout(async () => {
      setAvailabilityStatus('validating');
      try {
        const codesRef = collection(db, 'referralCodes');
        const q = query(codesRef, where('code', '==', newCode), where('active', '==', true), limit(1));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
          setAvailabilityStatus('available');
        } else {
          setAvailabilityStatus('taken');
        }
      } catch (err) {
        setAvailabilityStatus('idle');
      }
    }, 500);

    return () => clearTimeout(timeout);
  }, [newCode, isEditing, userData?.referralCode, db]);

  const referralConstraints = useMemo(() => {
    if (!user?.uid) return [];
    return [where('referrerId', '==', user.uid), orderBy('createdAt', 'desc'), limit(50)];
  }, [user?.uid]);

  const { data: referrals, loading: referralsLoading } = useCollection<any>(
    user?.uid ? 'referrals' : null, 
    referralConstraints
  );

  const referralLink = useMemo(() => {
    const code = userData?.referralCode || '';
    if (typeof window === 'undefined') return `https://primefunded.com/signup?ref=${code}`;
    return `${window.location.origin}/signup?ref=${code}`;
  }, [userData?.referralCode]);

  const stats = useMemo(() => {
    const data = referrals || [];
    const purchaseCount = data.filter((r: any) => (r.amount || 0) > 0).length;
    
    // Commission is $30 per verified purchase as requested
    const totalEarned = purchaseCount * 30;
    const paidEarned = data.filter((r: any) => r.status === 'paid').reduce((acc: number, r: any) => acc + (r.amount || 0), 0);
    const pendingEarned = totalEarned - paidEarned;
    
    return {
      totalSignups: data.length,
      purchaseCount,
      totalEarned,
      pendingEarned: Math.max(0, pendingEarned),
      paidEarned: paidEarned,
    };
  }, [referrals]);

  const isKycVerified = userData?.kycVerified === true;
  const canWithdraw = stats.pendingEarned >= MIN_WITHDRAWAL && isKycVerified;
  const progressPercent = Math.min((stats.pendingEarned / MIN_WITHDRAWAL) * 100, 100);

  const handleSaveCode = async () => {
    if (!user || availabilityStatus !== 'available' || newCode === userData?.referralCode) return;
    setIsSaving(true);
    
    const oldCode = userData.referralCode;
    const userRef = doc(db, 'users', user.uid);
    const newCodeRef = doc(db, 'referralCodes', newCode);
    
    const updates = {
      referralCode: newCode,
      codeChangesCount: (userData.codeChangesCount || 0) + 1,
      lastCodeChange: serverTimestamp()
    };

    updateDoc(userRef, updates).catch(async (err: any) => {
      if (err.code === 'permission-denied') {
        errorEmitter.emit('permission-error', new FirestorePermissionError({ path: userRef.path, operation: 'update', requestResourceData: updates }));
      }
    });

    if (oldCode) {
      const oldCodeRef = doc(db, 'referralCodes', oldCode);
      updateDoc(oldCodeRef, { active: false });
    }

    setDoc(newCodeRef, {
      code: newCode,
      userId: user.uid,
      active: true,
      createdAt: serverTimestamp()
    }).then(() => {
      toast({ title: "Code Updated!", description: `Your referral code has been changed to ${newCode}` });
      setIsEditing(false);
      setIsSaving(false);
      setShowConfirmDialog(false);
    }).catch(() => {
      setIsSaving(false);
      setShowConfirmDialog(false);
    });
  };

  const copyToClipboard = (text: string) => {
    if (!userData?.referralCode) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Copied!", description: "Link copied to clipboard." });
  };

  const share = (platform: 'twitter' | 'telegram' | 'whatsapp') => {
    if (!userData?.referralCode) return;
    const text = `Join PrimeFunded and get funded up to $300k! Use my referral link: `;
    const url = referralLink;
    let shareUrl = '';

    if (platform === 'twitter') shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
    if (platform === 'telegram') shareUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
    if (platform === 'whatsapp') shareUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text + url)}`;

    window.open(shareUrl, '_blank');
  };

  const changesRemaining = MAX_CHANGES - (userData?.codeChangesCount || 0);

  if (authLoading || initializing) {
    return (
      <div className="flex min-h-screen bg-background">
        <Navigation />
        <main className="flex-1 p-8 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
            <p className="text-xs font-black uppercase tracking-widest text-muted-foreground animate-pulse">Syncing Referral Terminal...</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Navigation />
      <main className="flex-1 p-8 overflow-y-auto custom-scrollbar">
        <header className="mb-10">
          <h1 className="text-3xl font-headline font-bold mb-1 text-white">Referral Program</h1>
          <p className="text-muted-foreground">Invite friends and earn $30.00 on every challenge purchase they make.</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-10">
          <Card className="lg:col-span-1 border-primary/20 bg-primary/5 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 blur-3xl rounded-full -mr-16 -mt-16" />
            <CardHeader>
              <CardTitle className="text-xl font-headline text-white">My Referral Code</CardTitle>
              <CardDescription>Customize your code to share with your audience.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="relative">
                <AnimatePresence mode="wait">
                  {isEditing ? (
                    <motion.div 
                      key="editing"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="space-y-4"
                    >
                      <div className="relative">
                        <input 
                          value={newCode}
                          onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                          placeholder="ENTER NEW CODE"
                          className={cn(
                            "flex h-16 w-full rounded-md border-2 bg-background px-3 py-2 text-2xl font-mono font-bold tracking-widest text-center uppercase ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 text-white",
                            availabilityStatus === 'available' && "border-accent bg-accent/5",
                            availabilityStatus === 'taken' && "border-destructive bg-destructive/5",
                            availabilityStatus === 'invalid' && "border-amber-500 bg-amber-500/5",
                            availabilityStatus === 'too-short' && "border-muted bg-muted/5"
                          )}
                          maxLength={12}
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          {availabilityStatus === 'validating' && <Loader2 className="w-5 h-5 animate-spin text-primary" />}
                          {availabilityStatus === 'available' && <CheckCircle2 className="w-5 h-5 text-accent" />}
                          {availabilityStatus === 'taken' && <XCircle className="w-5 h-5 text-destructive" />}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" className="flex-1 cursor-pointer font-bold" onClick={() => { setIsEditing(false); setNewCode(''); }}>Cancel</Button>
                        <Button className="flex-1 font-bold bg-accent hover:bg-accent/90 cursor-pointer" disabled={availabilityStatus !== 'available' || newCode === userData?.referralCode} onClick={() => setShowConfirmDialog(true)}>Save</Button>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div key="display" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-4 rounded-xl bg-background/50 border border-primary/20 text-center min-h-[64px] flex items-center justify-center group relative">
                      {userData?.referralCode ? (
                        <div className="flex items-center gap-4">
                          <span className="text-2xl font-mono font-bold tracking-widest text-primary uppercase">{userData.referralCode}</span>
                          {changesRemaining > 0 && <button onClick={() => { setIsEditing(true); setNewCode(userData.referralCode); }} className="p-2 hover:bg-primary/20 rounded-lg text-primary transition-colors cursor-pointer"><Edit2 className="w-4 h-4" /></button>}
                        </div>
                      ) : <Loader2 className="w-6 h-6 animate-spin text-primary/50" />}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {!isEditing && (
                <div className="space-y-4">
                  <p className="text-[10px] text-center font-bold text-muted-foreground uppercase tracking-widest">{changesRemaining > 0 ? `Changes remaining: ${changesRemaining}/${MAX_CHANGES}` : "Maximum changes reached"}</p>
                  <Button onClick={() => copyToClipboard(referralLink)} className="w-full h-12 font-bold cyan-box-glow cursor-pointer" disabled={!userData?.referralCode}><Copy className="w-4 h-4 mr-2" />{copied ? 'Copied Link!' : 'Copy Referral Link'}</Button>
                  <div className="grid grid-cols-3 gap-2">
                    <Button variant="outline" size="icon" onClick={() => share('twitter')} className="h-12 w-full cursor-pointer"><Twitter className="w-5 h-5" /></Button>
                    <Button variant="outline" size="icon" onClick={() => share('telegram')} className="h-12 w-full cursor-pointer"><Send className="w-5 h-5" /></Button>
                    <Button variant="outline" size="icon" onClick={() => share('whatsapp')} className="h-12 w-full cursor-pointer"><MessageCircle className="w-5 h-5" /></Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="lg:col-span-2 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <StatSmall title="Total Referrals" value={stats.totalSignups} icon={<Users />} />
              <StatSmall title="Purchases" value={stats.purchaseCount} icon={<CheckCircle2 />} />
              <StatSmall title="Total Earned" value={`$${stats.totalEarned.toFixed(2)}`} icon={<TrendingUp />} />
              <StatSmall title="Pending" value={`$${stats.pendingEarned.toFixed(2)}`} icon={<Clock />} color="amber" />
              <StatSmall title="Paid" value={`$${stats.paidEarned.toFixed(2)}`} icon={<DollarSign />} color="green" />
              <Card className="bg-secondary/30 flex flex-col justify-center items-center p-4 text-center border-accent/20">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Commission Rate</p>
                <p className="text-lg font-bold text-white">$30.00 / sale</p>
              </Card>
            </div>

            <Card className="bg-secondary/20 border-border/50 overflow-hidden">
              <CardContent className="p-6">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-bold text-white">Withdrawal Progress</span>
                  <span className="text-xs font-mono text-white">${stats.pendingEarned.toFixed(2)} / $100.00</span>
                </div>
                <Progress value={progressPercent} className="h-2 mb-4" />
                <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                  <p className="text-xs text-muted-foreground">{canWithdraw ? "Threshold reached. You are eligible for withdrawal." : !isKycVerified ? "Complete KYC verification to unlock referral earnings." : `Minimum $${MIN_WITHDRAWAL} required to withdraw pending commissions.`}</p>
                  <Button disabled={!canWithdraw} size="sm" className="font-bold px-8 w-full md:w-auto cursor-pointer">Request Payout</Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <Card className="border-border/50 bg-card/40 backdrop-blur-sm">
          <CardHeader><CardTitle className="text-white">Referral History</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-border bg-secondary/30 text-muted-foreground uppercase text-[10px] font-bold tracking-widest">
                    <th className="py-4 px-6">Date</th>
                    <th className="py-4 px-6">Trader</th>
                    <th className="py-4 px-6">Status</th>
                    <th className="py-4 px-6">Commission</th>
                    <th className="py-4 px-6 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {referralsLoading ? [1, 2, 3].map(i => <tr key={i}><td colSpan={5} className="py-4"><Skeleton className="h-10 w-full rounded-lg mx-6" /></td></tr>) : (referrals && referrals.length > 0) ? referrals.map((r: any) => (
                    <tr key={r.id} className="hover:bg-secondary/10 transition-colors">
                      <td className="py-4 px-6 text-xs text-muted-foreground">{r.createdAt?.seconds ? new Date(r.createdAt.seconds * 1000).toLocaleDateString() : 'Processing...'}</td>
                      <td className="py-4 px-6 font-bold truncate max-w-[150px] text-white">{r.referredUserEmail ? `${r.referredUserEmail.split('@')[0].slice(0, 3)}***@${r.referredUserEmail.split('@')[1]}` : 'Anonymous'}</td>
                      <td className="py-4 px-6 text-xs uppercase font-black text-muted-foreground/50">{r.amount > 0 ? 'CONVERTED' : 'JOINED'}</td>
                      <td className="py-4 px-6 font-bold text-accent">${(r.amount || (r.amount > 0 ? 30 : 0)).toFixed(2)}</td>
                      <td className="py-4 px-6 text-right"><Badge variant={r.status === 'paid' ? 'default' : 'outline'} className="uppercase text-[9px] font-black text-white border-white/10">{r.status === 'joined' && r.amount > 0 ? 'PENDING' : (r.status || 'PENDING')}</Badge></td>
                    </tr>
                  )) : <tr><td colSpan={5} className="py-20 text-center text-muted-foreground italic">No signups found. Your referrals will appear here once someone joins using your link.</td></tr>}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </main>

      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent className="bg-card border-primary/20">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-white"><AlertTriangle className="text-amber-500 w-5 h-5" /> Confirm Code Change</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">Changing your code to <span className="text-white font-bold">{newCode}</span> will invalidate all previous links. Users clicking old links will no longer be linked to you.<br /><br />Changes remaining: <span className="text-white font-bold">{changesRemaining}/{MAX_CHANGES}</span></AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer font-bold">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSaveCode} className="bg-accent text-accent-foreground hover:bg-accent/90 cursor-pointer font-bold" disabled={isSaving}>{isSaving ? "Updating..." : "Yes, Change Code"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}