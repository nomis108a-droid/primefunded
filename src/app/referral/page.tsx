
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
  ExternalLink
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
               <Button size="sm" className="ml-4 h-9 font-bold bg-accent text-black hover:bg-accent/90" disabled={stats.withdrawable < 30}>
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

          <div className="grid lg:grid-cols-3 gap-8">
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
        </div>
      </main>
    </div>
  );
}
