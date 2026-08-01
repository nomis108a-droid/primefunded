
"use client";

import { useMemo, useState, useEffect, memo } from 'react';
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
  Loader2,
  Trophy,
  Activity,
  Wallet,
  ArrowRight,
  ExternalLink,
  ShieldAlert,
  AlertTriangle,
  Info
} from 'lucide-react';
import { useCollection } from '@/firebase';
import { query, collection, orderBy, where, limit, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { generateSecureReferralCode } from '@/lib/referral';

const StatBox = memo(function StatBox({ title, value, icon, color = 'blue' }: { title: string, value: string | number, icon: any, color?: string }) {
  const colorMap: any = {
    blue: 'text-primary bg-primary/10 border-primary/20',
    amber: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
    green: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
    purple: 'text-purple-500 bg-purple-500/10 border-purple-500/20',
  };
  return (
    <Card className="bg-secondary/30 border-border/50 p-6 group hover:border-primary/20 transition-all duration-300">
      <div className={cn("p-3 rounded-xl w-fit mb-4 border transition-transform group-hover:scale-110 shadow-lg", colorMap[color])}>{icon}</div>
      <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">{title}</p>
      <p className="text-2xl font-bold font-headline tabular-nums text-white">{value}</p>
    </Card>
  );
});

export default function ReferralPage() {
  const { user, userData, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [migrating, setMigrating] = useState(false);

  // Auto-migration for legacy codes
  useEffect(() => {
    if (!authLoading && user && userData && !migrating) {
      const currentCode = userData.referralCode || "";
      // If code doesn't start with PF and isn't the new format, repair it
      const isLegacy = !currentCode.startsWith('PF') || currentCode.length < 10;
      
      if (isLegacy) {
        setMigrating(true);
        const newCode = generateSecureReferralCode();
        updateDoc(doc(db, 'users', user.uid), {
          referralCode: newCode,
          updatedAt: serverTimestamp()
        }).catch(console.error).finally(() => setMigrating(false));
      }
    }
  }, [userData, user, authLoading]);

  const referralLink = useMemo(() => {
    if (typeof window === 'undefined' || !userData?.referralCode) return '';
    return `${window.location.origin}/signup?ref=${userData.referralCode}`;
  }, [userData?.referralCode]);

  const referralConstraints = useMemo(() => {
    if (!user?.uid) return [];
    return [where('referrerId', '==', user.uid), orderBy('createdAt', 'desc'), limit(20)];
  }, [user?.uid]);

  const { data: referrals, loading } = useCollection<any>(
    user?.uid ? 'referrals' : null, 
    referralConstraints
  );

  const leaderboardConstraints = useMemo(() => [orderBy('referralEarnings.approved', 'desc'), limit(10)], []);
  const { data: leaderboard } = useCollection<any>('users', leaderboardConstraints);

  const stats = useMemo(() => {
    const s = userData?.referralStats || { clicks: 0, registrations: 0, purchases: 0 };
    const e = userData?.referralEarnings || { pending: 0, approved: 0, paid: 0, withdrawable: 0 };
    return { ...s, ...e };
  }, [userData]);

  const copyToClipboard = () => {
    if (!referralLink) return;
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Copied!", description: "Your referral link is ready to share." });
  };

  if (authLoading || migrating) return <div className="flex min-h-screen bg-background items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="flex min-h-screen bg-background text-white">
      <Navigation />
      <main className="flex-1 p-8 overflow-y-auto custom-scrollbar">
        <div className="max-w-7xl mx-auto">
          <header className="mb-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div>
              <h1 className="text-3xl font-headline font-bold mb-1">Referral Terminal</h1>
              <p className="text-muted-foreground text-sm">Earn 20% commission on every challenge purchase you refer.</p>
            </div>
            <div className="flex items-center gap-3 p-4 bg-secondary/50 border border-white/5 rounded-2xl">
               <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center text-accent">
                 <Wallet className="w-5 h-5" />
               </div>
               <div>
                 <p className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">Balance</p>
                 <p className="text-lg font-black text-accent tabular-nums">${(stats.withdrawable || 0).toFixed(2)}</p>
               </div>
               <Button size="sm" className="ml-4 h-9 font-bold bg-accent text-black hover:bg-accent/90" disabled={stats.withdrawable < 100}>
                 Withdraw
               </Button>
            </div>
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-10">
            <Card className="lg:col-span-1 border-primary/20 bg-primary/5 p-8 space-y-8 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-primary" />
              <div className="space-y-2">
                <h2 className="text-2xl font-headline font-bold">Your Invite Link</h2>
                <p className="text-xs text-muted-foreground">Share this link to track your referrals and earnings.</p>
              </div>
              
              <div className="p-4 rounded-xl bg-background/50 border border-white/10 font-mono text-xs text-primary break-all">
                {referralLink || 'Initializing code...'}
              </div>
              
              <div className="space-y-4">
                <Button onClick={copyToClipboard} className="w-full h-14 font-black text-base cyan-box-glow" disabled={!referralLink}>
                  {copied ? <CheckCircle2 className="w-5 h-5 mr-2" /> : <Copy className="w-5 h-5 mr-2" />}
                  {copied ? 'LINK COPIED' : 'COPY INVITE LINK'}
                </Button>
                
                <div className="grid grid-cols-3 gap-3">
                  <Button variant="outline" className="h-12 border-white/10 hover:bg-[#1DA1F2]/10 hover:text-[#1DA1F2] hover:border-[#1DA1F2]/30"><Twitter className="w-5 h-5" /></Button>
                  <Button variant="outline" className="h-12 border-white/10 hover:bg-[#25D366]/10 hover:text-[#25D366] hover:border-[#25D366]/30"><MessageCircle className="w-5 h-5" /></Button>
                  <Button variant="outline" className="h-12 border-white/10 hover:bg-[#0088cc]/10 hover:text-[#0088cc] hover:border-[#0088cc]/30"><Send className="w-5 h-5" /></Button>
                </div>
              </div>
              
              <div className="pt-6 border-t border-white/5 flex items-center justify-between">
                <p className="text-[10px] font-black uppercase text-zinc-500 tracking-[0.2em]">UNIQUE CODE:</p>
                <Badge variant="outline" className="font-mono text-xs font-bold text-white border-white/20 px-3 py-1">{userData?.referralCode || '...'}</Badge>
              </div>
            </Card>

            <div className="lg:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatBox title="Link Clicks" value={stats.clicks || 0} icon={<Activity />} color="blue" />
              <StatBox title="Registrations" value={stats.registrations || 0} icon={<Users />} color="amber" />
              <StatBox title="Conversions" value={stats.purchases || 0} icon={<CheckCircle2 />} color="green" />
              <StatBox title="Pending Earnings" value={`$${(stats.pending || 0).toFixed(2)}`} icon={<Clock />} color="purple" />
            </div>
          </div>

          <div className="grid lg:grid-cols-3 gap-8 mb-16">
            <Card className="lg:col-span-2 border-border/50 bg-card/40 backdrop-blur-md shadow-2xl">
              <CardHeader className="border-b border-white/5 pb-4">
                <CardTitle className="text-xl flex items-center gap-2">
                  <TrendingUp className="text-primary w-5 h-5" /> Recent Activity
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead>
                      <tr className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-black tracking-widest">
                        <th className="py-4 px-6">Timestamp</th>
                        <th className="py-4 px-6">Trader Email</th>
                        <th className="py-4 px-6">Status</th>
                        <th className="py-4 px-6 text-right">Commission</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {loading ? (
                        <tr><td colSpan={4} className="py-20 text-center"><Loader2 className="animate-spin inline mr-2 text-primary" /></td></tr>
                      ) : referrals.length === 0 ? (
                        <tr><td colSpan={4} className="py-32 text-center text-muted-foreground italic font-bold uppercase tracking-widest text-xs opacity-30">No referral activity logged yet.</td></tr>
                      ) : referrals.map((r: any) => (
                        <tr key={r.id} className="hover:bg-white/5 transition-colors group">
                          <td className="py-4 px-6 text-xs text-muted-foreground font-mono">{r.createdAt?.seconds ? format(r.createdAt.seconds * 1000, 'MMM d, HH:mm') : 'Recently'}</td>
                          <td className="py-4 px-6 font-bold text-white group-hover:text-primary transition-colors">{r.referredUserEmail ? `${r.referredUserEmail.slice(0, 3)}***@${r.referredUserEmail.split('@')[1]}` : 'Anonymous'}</td>
                          <td className="py-4 px-6">
                             <Badge variant="outline" className={cn(
                               "text-[8px] font-black uppercase px-2 py-0.5",
                               r.status === 'funded' ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-amber-500/10 text-amber-500 border-amber-500/20"
                             )}>
                               {r.status || 'joined'}
                             </Badge>
                          </td>
                          <td className="py-4 px-6 text-right font-black text-emerald-500 tabular-nums">${(r.amount || 0).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/50 bg-card/40 shadow-2xl overflow-hidden">
              <CardHeader className="bg-secondary/30 border-b border-white/5">
                <CardTitle className="text-lg flex items-center gap-2"><Trophy className="text-amber-500 w-5 h-5" /> Hall of Fame</CardTitle>
                <CardDescription className="text-[10px] uppercase font-black tracking-widest">Global Top Referrers</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-white/5">
                  {leaderboard?.map((l: any, i: number) => (
                    <div key={l.id} className="flex items-center justify-between p-4 hover:bg-white/5 transition-colors">
                      <div className="flex items-center gap-4">
                        <span className={cn(
                          "text-xs font-black w-6 h-6 flex items-center justify-center rounded-lg",
                          i === 0 ? "bg-amber-500 text-black shadow-[0_0_10px_rgba(245,158,11,0.4)]" : 
                          i === 1 ? "bg-zinc-400 text-black" :
                          i === 2 ? "bg-orange-600 text-black" : "text-zinc-600 border border-white/5"
                        )}>{i + 1}</span>
                        <div className="space-y-0.5">
                          <p className="text-sm font-bold text-white uppercase tracking-tight">{l.name?.slice(0, 12)}...</p>
                          <p className="text-[8px] font-black text-zinc-500 uppercase tracking-widest">{l.referralStats?.purchases || 0} CONVERSIONS</p>
                        </div>
                      </div>
                      <Badge variant="outline" className="font-mono text-[10px] text-primary border-primary/20 bg-primary/5 py-1 px-3">
                        ${(l.referralEarnings?.approved || 0).toLocaleString()}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Referral Program Terms Section */}
          <section className="mb-16">
            <div className="flex items-center gap-3 mb-10">
               <BookOpen className="text-primary w-6 h-6" />
               <h2 className="text-3xl font-headline font-bold text-white uppercase tracking-tighter italic">Referral Program Terms</h2>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Basic Rules */}
              <Card className="bg-emerald-500/5 border-emerald-500/20 overflow-hidden relative group">
                <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500" />
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <CardTitle className="text-lg font-bold text-emerald-500 uppercase tracking-tight">Basic Rules</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  <TermRule number="01" title="Referral Commission">
                    Earn 20% commission on every successful challenge purchase made through your referral link.
                  </TermRule>
                  <TermRule number="02" title="Customer Discount">
                    Your referred customers receive a 10% discount on all eligible Challenge Accounts.
                  </TermRule>
                  <TermRule number="03" title="Eligible Products">
                    Referral discounts and commissions apply only to:
                    <ul className="mt-2 space-y-1 opacity-80">
                      <li>• 1-Step Challenge</li>
                      <li>• 2-Step Challenge</li>
                      <li>• 3-Step Challenge</li>
                    </ul>
                    They do <strong className="text-emerald-400">NOT</strong> apply to Instant Funding or Instant Pro accounts.
                  </TermRule>
                  <TermRule number="04" title="Automatic Tracking">
                    Every referral is automatically tracked using your unique referral link and referral code.
                  </TermRule>
                </CardContent>
              </Card>

              {/* Important Rules */}
              <Card className="bg-amber-500/5 border-amber-500/20 overflow-hidden relative group">
                <div className="absolute top-0 left-0 w-full h-1 bg-amber-500" />
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500">
                      <Info className="w-5 h-5" />
                    </div>
                    <CardTitle className="text-lg font-bold text-amber-500 uppercase tracking-tight">Important Rules</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  <TermRule number="05" title="Successful Purchase Required" color="amber">
                    Referral commissions are generated only after the referred customer successfully completes payment.
                  </TermRule>
                  <TermRule number="06" title="Pending Approval" color="amber">
                    All referral commissions remain in Pending status until the payment has been verified by PrimeFunded.
                  </TermRule>
                  <TermRule number="07" title="Minimum Withdrawal" color="amber">
                    Referral earnings become withdrawable once your available referral balance reaches $100 USD.
                  </TermRule>
                  <TermRule number="08" title="Refund & Chargeback Policy" color="amber">
                    If a referred purchase is refunded, cancelled, disputed, or charged back, the corresponding referral commission will be cancelled automatically.
                  </TermRule>
                  <TermRule number="09" title="One Referral Per Purchase" color="amber">
                    Only one referral code can be applied to each challenge purchase. Referral codes cannot be combined with other promotional offers unless officially approved by PrimeFunded.
                  </TermRule>
                </CardContent>
              </Card>

              {/* Strict Rules */}
              <Card className="bg-destructive/5 border-destructive/20 overflow-hidden relative group">
                <div className="absolute top-0 left-0 w-full h-1 bg-destructive" />
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center text-destructive">
                      <ShieldAlert className="w-5 h-5" />
                    </div>
                    <CardTitle className="text-lg font-bold text-destructive uppercase tracking-tight">Strict Rules</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  <TermRule number="10" title="No Self Referrals" color="red">
                    Using your own referral link or referral code to purchase challenges is strictly prohibited.
                  </TermRule>
                  <TermRule number="11" title="No Multiple Accounts" color="red">
                    Creating multiple accounts to generate referral commissions is prohibited.
                  </TermRule>
                  <TermRule number="12" title="No Fake Referrals" color="red">
                    Fake registrations, automated signups, bots, payment manipulation, or artificial referrals are strictly forbidden.
                  </TermRule>
                  <TermRule number="13" title="Fraud Detection" color="red">
                    PrimeFunded actively monitors referral activity. Any suspicious activity may result in commission cancellation, referral account suspension, or permanent account termination.
                  </TermRule>
                  <TermRule number="14" title="Right to Review" color="red">
                    PrimeFunded reserves the right to review, approve, reject, or reverse any referral commission if suspicious activity is detected.
                  </TermRule>
                  <TermRule number="15" title="Final Decision" color="red">
                    All referral commission decisions and dispute resolutions made by PrimeFunded are final.
                  </TermRule>
                </CardContent>
              </Card>
            </div>

            {/* Warning Notice Card */}
            <Card className="mt-12 bg-destructive/10 border-destructive/30 p-8 relative overflow-hidden">
              <div className="flex items-center gap-4 mb-4">
                <AlertTriangle className="text-destructive w-8 h-8" />
                <h3 className="text-2xl font-headline font-bold text-white uppercase tracking-tight">Important Notice</h3>
              </div>
              <p className="text-zinc-300 text-base leading-relaxed font-medium">
                Referral commissions are earned only from genuine, successful challenge purchases. Any attempt to abuse, manipulate, or exploit the referral system may result in immediate suspension of referral privileges, cancellation of commissions, withdrawal restrictions, and permanent account termination.
              </p>
            </Card>
          </section>
        </div>
      </main>
    </div>
  );
}

function TermRule({ number, title, children, color = 'emerald' }: { number: string, title: string, children: React.ReactNode, color?: 'emerald' | 'amber' | 'red' }) {
  const colorClasses = {
    emerald: 'text-emerald-500/40 group-hover:text-emerald-500',
    amber: 'text-amber-500/40 group-hover:text-amber-500',
    red: 'text-destructive/40 group-hover:text-destructive'
  };

  return (
    <div className="space-y-1.5 group">
      <div className="flex items-center gap-2">
        <span className={cn("font-mono text-[10px] font-black transition-colors", colorClasses[color])}>
          Rule {number}
        </span>
        <div className="h-px flex-1 bg-white/5" />
      </div>
      <h4 className="text-sm font-bold text-zinc-100">{title}</h4>
      <div className="text-xs text-zinc-400 leading-relaxed font-medium">
        {children}
      </div>
    </div>
  );
}
