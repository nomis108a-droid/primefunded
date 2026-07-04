"use client";

import { useMemo, useState, memo, useEffect } from 'react';
import { Navigation } from '@/components/Navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Wallet, ArrowDownRight, History, Clock, AlertTriangle, ShieldCheck, XCircle, Info, Loader2, CreditCard, Send, Timer } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useCollection, useFirestore } from '@/firebase';
import { where, addDoc, collection, serverTimestamp, limit, orderBy, doc, updateDoc } from 'firebase/firestore';
import Link from 'next/link';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { sendPayoutRequestedEmail } from '@/lib/email';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

const StatBox = memo(function StatSmall({ title, value, icon, color = 'primary' }: { title: string, value: string, icon: any, color?: string }) {
  return (
    <Card className={cn(color === 'accent' ? "bg-accent/5 border-accent/20" : "")}>
      <CardContent className="pt-6">
        <div className="flex justify-between items-start mb-4">
          <p className={cn("text-xs font-bold uppercase tracking-widest", color === 'accent' ? "text-accent" : "text-muted-foreground")}>{title}</p>
          <div className={color === 'accent' ? "text-accent" : "text-primary"}>{icon}</div>
        </div>
        <h3 className="text-4xl font-headline font-bold mb-2">{value}</h3>
      </CardContent>
    </Card>
  );
});

export default function PayoutsPage() {
  const { user, userData } = useAuth();
  const db = useFirestore();
  const { toast } = useToast();
  const [requesting, setRequesting] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  
  // Payout Form State
  const [payoutForm, setPayoutForm] = useState({
    amount: '',
    method: 'USDT (TRC20)',
    address: ''
  });

  // ── 24 HOUR TIMER LOGIC ──
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!userData?.lastPayoutRequestAt) return;
    
    const lastRequest = new Date(userData.lastPayoutRequestAt).getTime();
    const interval = setInterval(() => {
      const now = Date.now();
      const diff = now - lastRequest;
      const twentyFourHours = 24 * 60 * 60 * 1000;
      
      if (diff < twentyFourHours) {
        setTimeLeft(twentyFourHours - diff);
      } else {
        setTimeLeft(0);
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [userData?.lastPayoutRequestAt]);

  const formatTimeLeft = (ms: number) => {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const mins = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((ms % (1000 * 60)) / 1000);
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const isTimerDone = timeLeft === 0 || timeLeft === null;

  const withdrawableProfit = useMemo(() => {
    if (!userData) return 0;
    const balance = userData.liveBalance || userData.balance || 0;
    const initial = userData.accountBalance || 100000;
    const profit = balance - initial;
    return profit > 0 ? profit : 0;
  }, [userData]);

  const payoutConstraints = useMemo(() => {
    if (!user?.uid) return [];
    return [
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(20)
    ];
  }, [user?.uid]);

  const { data: payouts, loading } = useCollection<any>(
    user?.uid ? 'payouts' : null, 
    payoutConstraints
  );

  const { data: trades } = useCollection<any>(
    (user?.uid && userData?.accountPlan?.toLowerCase().includes('instant'))
      ? `users/${user.uid}/trades` 
      : null
  );

  const instrumentCheck = useMemo(() => {
    if (!userData?.accountPlan?.toLowerCase().includes('instant')) return { valid: true, message: null };
    if (!trades || trades.length === 0) return { valid: true, message: null };

    const counts: Record<string, number> = {};
    trades.forEach((t: any) => {
      const sym = t.symbol || 'N/A';
      counts[sym] = (counts[sym] || 0) + 1;
    });

    const failed = Object.entries(counts).find(([_, count]) => count < 5);
    if (failed) {
      return {
        valid: false,
        message: `Payout requires minimum 5 trades per instrument. Symbol [${failed[0]}] only has [${failed[1]}] trades.`
      };
    }
    return { valid: true, message: null };
  }, [trades, userData?.accountPlan]);

  const stats = useMemo(() => {
    const data = payouts || [];
    const totalPaid = data.filter(p => p.status === 'done').reduce((acc, p) => acc + parseFloat(p.amount || 0), 0);
    const pending = data.filter(p => p.status === 'pending' || p.status === 'approved').reduce((acc, p) => acc + parseFloat(p.amount || 0), 0);
    return { totalPaid, pending };
  }, [payouts]);

  const kycStatus = userData?.kycStatus || 'none';
  const isKycVerified = userData?.kycVerified === true;
  const isThresholdMet = withdrawableProfit >= 25;

  const handleRequestPayout = async () => {
    if (!user || !isKycVerified || !isThresholdMet || !instrumentCheck.valid || !isTimerDone) return;
    
    const amountNum = parseFloat(payoutForm.amount);
    if (isNaN(amountNum) || amountNum < 25) {
      toast({ variant: "destructive", title: "Invalid Amount", description: "Minimum payout is $25.00" });
      return;
    }

    if (amountNum > withdrawableProfit) {
      toast({ variant: "destructive", title: "Insufficient Profit", description: "You cannot request more than your current withdrawable profit." });
      return;
    }

    setRequesting(true);
    const payoutData = {
      userId: user.uid,
      email: user.email,
      amount: amountNum.toFixed(2),
      method: payoutForm.method,
      address: payoutForm.address,
      status: "pending",
      date: new Date().toISOString(),
      createdAt: serverTimestamp()
    };
    
    try {
      await addDoc(collection(db, 'payouts'), payoutData);
      
      // Update User Last Payout Timestamp
      await updateDoc(doc(db, 'users', user.uid), {
        lastPayoutRequestAt: new Date().toISOString()
      });

      await addDoc(collection(db, 'users', user.uid, 'notifications'), {
        title: "💸 Payout Requested",
        message: `Your payout request for $${payoutData.amount} via ${payoutForm.method} has been submitted successfully.`,
        type: 'payout_requested',
        isRead: false,
        createdAt: serverTimestamp()
      });

      sendPayoutRequestedEmail(user.email!, payoutData.amount);
      toast({ title: "Request Submitted", description: "Your payout is now under review by our finance desk." });
      setIsFormOpen(false);
      setPayoutForm({ ...payoutForm, amount: '', address: '' });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Request Failed", description: err.message });
    } finally {
      setRequesting(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      <Navigation />
      <main className="flex-1 p-8 overflow-y-auto custom-scrollbar">
        <header className="mb-10 flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-headline font-bold mb-1 text-white">Payouts & Withdrawals</h1>
            <p className="text-muted-foreground">Monitor your earnings and request profit splits.</p>
          </div>

          <div className={cn(
            "px-6 py-3 rounded-2xl border flex items-center gap-3 transition-all",
            isTimerDone ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500" : "bg-amber-500/10 border-amber-500/30 text-amber-500"
          )}>
            {isTimerDone ? <CheckCircle2 className="w-5 h-5" /> : <Timer className="w-5 h-5 animate-pulse" />}
            <div className="text-left">
               <p className="text-[9px] font-black uppercase tracking-widest opacity-70">Availability Status</p>
               <p className="text-sm font-bold uppercase tracking-tight">
                 {isTimerDone ? "Payout Available Now ✅" : `Next Payout: ${formatTimeLeft(timeLeft || 0)}`}
               </p>
            </div>
          </div>
        </header>

        {/* KYC Section (Same as before) */}
        {!isKycVerified && (
           <div className="mb-8 p-6 rounded-2xl bg-destructive/10 border border-destructive/30 space-y-4">
            <div className="flex items-center gap-3 text-destructive">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="font-bold text-lg">KYC Verification Required</h3>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">You must complete KYC verification before requesting a payout.</p>
            <Button size="sm" className="bg-primary hover:bg-primary/90 font-bold cursor-pointer" asChild><Link href="/kyc">Complete KYC Now</Link></Button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className={cn("transition-all duration-300", (isKycVerified && isTimerDone) ? "bg-primary/10 border-primary/20" : "bg-secondary/20 border-border opacity-60")}>
            <CardContent className="pt-6">
              <div className="flex justify-between items-start mb-4">
                <p className="text-xs font-bold uppercase tracking-widest text-primary">Withdrawable Profit</p>
                <Wallet className="text-primary w-5 h-5" />
              </div>
              <h3 className="text-4xl font-headline font-bold mb-2">${withdrawableProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
              
              <Button 
                className="w-full mt-6 font-bold cursor-pointer cyan-box-glow" 
                disabled={!isKycVerified || !isThresholdMet || !instrumentCheck.valid || !isTimerDone}
                onClick={() => {
                  setPayoutForm({ ...payoutForm, amount: withdrawableProfit.toFixed(2) });
                  setIsFormOpen(true);
                }}
              >
                {!isTimerDone ? "Waiting Period Active" : "Request Payout"}
              </Button>

              {!isTimerDone && (
                <p className="mt-4 text-[10px] text-amber-500 font-bold uppercase tracking-widest text-center">
                  Payouts limited to once every 24 hours.
                </p>
              )}
            </CardContent>
          </Card>
          
          <StatBox title="Total Paid Out" value={`$${stats.totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} icon={<ArrowDownRight className="w-5 h-5" />} color="accent" />
          <StatBox title="Pending Payouts" value={`$${stats.pending.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} icon={<Clock className="w-5 h-5" />} />
        </div>

        <Card className="border-border/50 bg-card/40 backdrop-blur-sm">
          <CardHeader><CardTitle className="text-lg flex items-center gap-2 text-white"><History className="w-5 h-5" /> Payout History</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-border/50 text-muted-foreground uppercase text-[10px] font-bold tracking-widest">
                    <th className="pb-4 pt-0 px-2">Date</th>
                    <th className="pb-4 pt-0 px-2">Method</th>
                    <th className="pb-4 pt-0 px-2 text-right">Amount</th>
                    <th className="pb-4 pt-0 px-2 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {loading ? [1, 2, 3].map(i => (
                    <tr key={i}><td colSpan={4} className="py-4"><Skeleton className="h-10 w-full rounded-lg" /></td></tr>
                  )) : payouts?.length > 0 ? payouts.map((p: any) => (
                    <tr key={p.id} className="hover:bg-secondary/20 transition-colors">
                      <td className="py-4 px-2 font-medium text-white">{new Date(p.date).toLocaleDateString()}</td>
                      <td className="py-4 px-2 text-muted-foreground">{p.method}</td>
                      <td className="py-4 px-2 font-bold text-accent text-right">${parseFloat(p.amount).toLocaleString()}</td>
                      <td className="py-4 px-2 text-right">
                        <Badge variant="outline" className={cn("text-[10px] uppercase font-black px-3", p.status === 'done' ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : p.status === 'rejected' ? "bg-destructive/10 text-destructive border-destructive/20" : "bg-amber-500/10 text-amber-500 border-amber-500/20")}>{p.status}</Badge>
                      </td>
                    </tr>
                  )) : (<tr><td colSpan={4} className="py-10 text-center text-muted-foreground italic">No requests found.</td></tr>)}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </main>

      {/* Payout Form Dialog (Same as before) */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="bg-card border-primary/20 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-2xl font-headline font-bold">Request Withdrawal</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label className="text-xs font-black uppercase text-primary">Withdrawal Amount ($)</Label>
              <Input type="number" value={payoutForm.amount} onChange={(e) => setPayoutForm({ ...payoutForm, amount: e.target.value })} className="h-12 bg-background border-border text-lg font-bold" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-black uppercase text-primary">Destination Address</Label>
              <Input value={payoutForm.address} onChange={(e) => setPayoutForm({ ...payoutForm, address: e.target.value })} placeholder="Paste wallet address..." className="h-12 bg-background border-border font-mono text-xs" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsFormOpen(false)}>Cancel</Button>
            <Button className="font-black bg-primary text-black h-12 px-8" onClick={handleRequestPayout} disabled={requesting}>
              {requesting ? <Loader2 className="animate-spin" /> : <Send className="w-4 h-4 mr-2" />} Submit Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CheckCircle2(props: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>
  );
}
