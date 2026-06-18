"use client";

import { useMemo, useState, memo } from 'react';
import { Navigation } from '@/components/Navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Wallet, ArrowDownRight, History, Clock, AlertTriangle, ShieldCheck, XCircle, Info, Loader2, CreditCard, Send } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useCollection, useFirestore } from '@/firebase';
import { where, addDoc, collection, serverTimestamp, limit, orderBy } from 'firebase/firestore';
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

  const withdrawableProfit = useMemo(() => {
    if (!userData) return 0;
    const balance = userData.liveBalance || userData.balance || 0;
    const initial = userData.accountBalance || 100000;
    const profit = balance - initial;
    return profit > 0 ? profit : 0;
  }, [userData]);

  const payoutConstraints = useMemo(() => {
    if (!user?.uid) return [];
    return [where('userId', '==', user.uid), limit(20)];
  }, [user?.uid]);

  const { data: payouts, loading } = useCollection<any>('payouts', payoutConstraints);

  // Added: Query trades to verify instrument diversity for Instant Funding plans
  const { data: trades } = useCollection<any>(
    user && userData?.accountPlan?.toLowerCase().includes('instant') 
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
    const totalPaid = payouts?.filter(p => p.status === 'done').reduce((acc, p) => acc + parseFloat(p.amount || 0), 0) || 0;
    const pending = payouts?.filter(p => p.status === 'pending' || p.status === 'approved').reduce((acc, p) => acc + parseFloat(p.amount || 0), 0) || 0;
    return { totalPaid, pending };
  }, [payouts]);

  const kycStatus = userData?.kycStatus || 'none';
  const isKycVerified = userData?.kycVerified === true;
  const isThresholdMet = withdrawableProfit >= 25;

  const handleRequestPayout = async () => {
    if (!user || !isKycVerified || !isThresholdMet || !instrumentCheck.valid) return;
    
    const amountNum = parseFloat(payoutForm.amount);
    if (isNaN(amountNum) || amountNum < 25) {
      toast({ variant: "destructive", title: "Invalid Amount", description: "Minimum payout is $25.00" });
      return;
    }

    if (amountNum > withdrawableProfit) {
      toast({ variant: "destructive", title: "Insufficient Profit", description: "You cannot request more than your current withdrawable profit." });
      return;
    }

    if (!payoutForm.address || payoutForm.address.length < 10) {
      toast({ variant: "destructive", title: "Invalid Address", description: "Please enter a valid wallet destination address." });
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
      await addDoc(collection(db, 'users', user.uid, 'notifications'), {
        title: "💸 Payout Requested",
        message: `Your payout request for $${payoutData.amount} via ${payoutData.method} has been submitted successfully.`,
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

  const renderKycWarning = () => {
    if (isKycVerified) return (
      <div className="mb-8 p-4 rounded-xl bg-accent/10 border border-accent/30 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShieldCheck className="text-accent w-5 h-5" />
          <div>
            <p className="text-sm font-bold text-accent">KYC Verified - Payouts Unlocked</p>
            <p className="text-xs text-muted-foreground">Account eligible for profit withdrawals.</p>
          </div>
        </div>
        <Badge className="bg-accent text-accent-foreground">VERIFIED</Badge>
      </div>
    );

    if (kycStatus === 'pending') return (
      <div className="mb-8 p-6 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-4">
        <div className="flex items-center gap-3 text-amber-500">
          <Clock className="w-6 h-6" />
          <h3 className="font-bold text-lg">KYC Under Review</h3>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Your documents are being reviewed. Payouts will be unlocked once approved (24-48 hours).
        </p>
        <Badge variant="outline" className="border-amber-500 text-amber-500">PENDING REVIEW</Badge>
      </div>
    );

    return (
      <div className="mb-8 p-6 rounded-2xl bg-destructive/10 border border-destructive/30 space-y-4">
        <div className="flex items-center gap-3 text-destructive">
          <AlertTriangle className="w-6 h-6" />
          <h3 className="font-bold text-lg">KYC Verification Required</h3>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          You must complete KYC verification before requesting a payout.
        </p>
        <Button size="sm" className="bg-primary hover:bg-primary/90 font-bold cursor-pointer" asChild>
          <Link href="/kyc">Complete KYC Now</Link>
        </Button>
      </div>
    );
  };

  return (
    <div className="flex min-h-screen bg-background">
      <Navigation />
      <main className="flex-1 p-8 overflow-y-auto custom-scrollbar">
        <header className="mb-10">
          <h1 className="text-3xl font-headline font-bold mb-1 text-white">Payouts & Withdrawals</h1>
          <p className="text-muted-foreground">Monitor your earnings and request profit splits.</p>
        </header>

        {renderKycWarning()}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className={cn(
            "transition-all duration-300",
            isKycVerified ? "bg-primary/10 border-primary/20" : "bg-secondary/20 border-border opacity-60"
          )}>
            <CardContent className="pt-6">
              <div className="flex justify-between items-start mb-4">
                <p className="text-xs font-bold uppercase tracking-widest text-primary">Withdrawable Profit</p>
                <Wallet className="text-primary w-5 h-5" />
              </div>
              <h3 className="text-4xl font-headline font-bold mb-2">${withdrawableProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
              
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="w-full">
                      <Button 
                        className="w-full mt-6 font-bold cursor-pointer cyan-box-glow" 
                        disabled={!isKycVerified || !isThresholdMet || !instrumentCheck.valid}
                        onClick={() => {
                          setPayoutForm({ ...payoutForm, amount: withdrawableProfit.toFixed(2) });
                          setIsFormOpen(true);
                        }}
                      >
                        Request Payout
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {!isKycVerified ? (
                    <TooltipContent className="bg-destructive text-white border-none">
                      <p className="text-xs font-bold">Complete KYC to unlock payouts</p>
                    </TooltipContent>
                  ) : !isThresholdMet ? (
                    <TooltipContent className="bg-amber-500 text-black border-none">
                      <p className="text-xs font-bold">Minimum payout amount is $25.00</p>
                    </TooltipContent>
                  ) : !instrumentCheck.valid ? (
                    <TooltipContent className="bg-destructive text-white border-none max-w-xs">
                      <p className="text-xs font-bold">{instrumentCheck.message}</p>
                    </TooltipContent>
                  ) : null}
                </Tooltip>
              </TooltipProvider>

              {(!isThresholdMet && isKycVerified) && (
                <p className="mt-4 text-[10px] text-amber-500 font-bold uppercase tracking-widest text-center">
                  Minimum withdrawal threshold: $25.00
                </p>
              )}
              {!instrumentCheck.valid && (
                <p className="mt-4 text-[10px] text-destructive font-bold uppercase tracking-widest text-center">
                  {instrumentCheck.message}
                </p>
              )}
            </CardContent>
          </Card>
          
          <StatBox title="Total Paid Out" value={`$${stats.totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} icon={<ArrowDownRight className="w-5 h-5" />} color="accent" />
          <StatBox title="Pending Payouts" value={`$${stats.pending.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} icon={<Clock className="w-5 h-5" />} />
        </div>

        <Card className="border-border/50 bg-card/40 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2 text-white">
              <History className="w-5 h-5" /> Payout History
            </CardTitle>
          </CardHeader>
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
                  {loading ? (
                    [1, 2, 3].map(i => (
                      <tr key={i}><td colSpan={4} className="py-4"><Skeleton className="h-10 w-full rounded-lg" /></td></tr>
                    ))
                  ) : payouts?.length > 0 ? payouts.map((p: any) => (
                    <tr key={p.id} className="hover:bg-secondary/20 transition-colors">
                      <td className="py-4 px-2 font-medium text-white">{new Date(p.date).toLocaleDateString()}</td>
                      <td className="py-4 px-2 text-muted-foreground">{p.method}</td>
                      <td className="py-4 px-2 font-bold text-accent text-right">${parseFloat(p.amount).toLocaleString()}</td>
                      <td className="py-4 px-2 text-right">
                        <Badge variant="outline" className={cn(
                          "text-[10px] uppercase font-black px-3",
                          p.status === 'done' ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : 
                          p.status === 'rejected' ? "bg-destructive/10 text-destructive border-destructive/20" :
                          "bg-amber-500/10 text-amber-500 border-amber-500/20"
                        )}>{p.status}</Badge>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={4} className="py-10 text-center text-muted-foreground italic">No requests found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </main>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="bg-card border-primary/20 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-2xl font-headline font-bold">Request Withdrawal</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Provide your crypto destination details. All payouts are verified within 1-4 hours.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            {!instrumentCheck.valid && (
              <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
                <div className="flex gap-2">
                  <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
                  <p className="text-xs font-bold text-destructive">{instrumentCheck.message}</p>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-xs font-black uppercase text-primary tracking-widest">Withdrawal Amount ($)</Label>
              <div className="relative">
                <Input 
                  type="number" 
                  value={payoutForm.amount} 
                  onChange={(e) => setPayoutForm({ ...payoutForm, amount: e.target.value })}
                  placeholder="25.00"
                  className="h-12 bg-background border-border text-lg font-bold pl-10"
                />
                <Wallet className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              </div>
              <p className={cn("text-[10px] font-bold uppercase", parseFloat(payoutForm.amount) < 25 ? "text-destructive" : "text-muted-foreground")}>
                {parseFloat(payoutForm.amount) < 25 ? "Minimum payout is $25" : `Max available: $${withdrawableProfit.toFixed(2)}`}
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-black uppercase text-primary tracking-widest">Payout Network</Label>
              <Select value={payoutForm.method} onValueChange={(v) => setPayoutForm({ ...payoutForm, method: v })}>
                <SelectTrigger className="h-12 bg-background border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USDT (TRC20)">USDT (TRC20) - Fast / Low Fee</SelectItem>
                  <SelectItem value="USDT (ERC20)">USDT (ERC20)</SelectItem>
                  <SelectItem value="BTC">Bitcoin (BTC)</SelectItem>
                  <SelectItem value="ETH">Ethereum (ETH)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-black uppercase text-primary tracking-widest">Destination Address</Label>
              <div className="relative">
                <Input 
                  value={payoutForm.address} 
                  onChange={(e) => setPayoutForm({ ...payoutForm, address: e.target.value })}
                  placeholder="Paste your wallet address here..."
                  className="h-12 bg-background border-border font-mono text-xs pr-10"
                />
                <CreditCard className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              </div>
              <p className="text-[9px] text-destructive font-bold uppercase">⚠️ Warning: Ensure the address is correct for the selected network.</p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setIsFormOpen(false)} className="font-bold">Cancel</Button>
            <Button 
              className="font-black bg-primary text-black h-12 px-8 flex-1 sm:flex-none" 
              onClick={handleRequestPayout}
              disabled={requesting || parseFloat(payoutForm.amount) < 25 || !instrumentCheck.valid}
            >
              {requesting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
              Submit Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
