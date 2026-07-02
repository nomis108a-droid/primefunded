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
  Loader2,
  Trophy,
  Star
} from 'lucide-react';
import { useCollection, useFirestore } from '@/firebase';
import { doc, updateDoc, query, collection, getDocs, setDoc, serverTimestamp, limit, orderBy, where } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

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

export default function ReferralPage() {
  const { user, userData } = useAuth();
  const db = useFirestore();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const referralLink = useMemo(() => {
    if (typeof window === 'undefined' || !userData?.referralCode) return '';
    return `${window.location.origin}/signup?ref=${userData.referralCode}`;
  }, [userData?.referralCode]);

  const referralConstraints = useMemo(() => {
    if (!user?.uid) return [];
    return [where('referrerId', '==', user.uid), orderBy('createdAt', 'desc'), limit(50)];
  }, [user?.uid]);

  const { data: referrals, loading } = useCollection<any>(
    user?.uid ? 'referrals' : null, 
    referralConstraints
  );

  // Leaderboard fetch
  const { data: leaderboard } = useCollection<any>(
    'users',
    useMemo(() => [orderBy('referralEarnings', 'desc'), limit(10)], [])
  );

  const stats = useMemo(() => {
    const data = referrals || [];
    const totalEarned = userData?.referralEarnings || 0;
    const paidOut = userData?.paidReferralEarnings || 0;
    const pending = totalEarned - paidOut;
    
    return {
      totalSignups: data.length,
      activeTraders: data.filter((r: any) => r.status === 'funded').length,
      totalEarned,
      pending,
      paidOut
    };
  }, [referrals, userData]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Copied!", description: "Link copied to clipboard." });
  };

  return (
    <div className="flex min-h-screen bg-background">
      <Navigation />
      <main className="flex-1 p-8 overflow-y-auto custom-scrollbar">
        <header className="mb-10">
          <h1 className="text-3xl font-headline font-bold mb-1 text-white">Referral Hub</h1>
          <p className="text-muted-foreground">Invite elite talent and earn 10% on every challenge purchase.</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-10">
          <Card className="lg:col-span-1 border-primary/20 bg-primary/5 p-6 space-y-6">
            <h2 className="text-xl font-headline font-bold text-white">Share Link</h2>
            <div className="p-4 rounded-xl bg-background/50 border border-border font-mono text-xs text-primary break-all">
              {referralLink || 'Generating link...'}
            </div>
            <Button onClick={() => copyToClipboard(referralLink)} className="w-full h-12 font-bold cyan-box-glow" disabled={!referralLink}>
              {copied ? <CheckCircle2 className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
              {copied ? 'Copied!' : 'Copy Link'}
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1"><Twitter className="w-4 h-4" /></Button>
              <Button variant="outline" className="flex-1"><Send className="w-4 h-4" /></Button>
              <Button variant="outline" className="flex-1"><MessageCircle className="w-4 h-4" /></Button>
            </div>
          </Card>

          <div className="lg:col-span-2 grid grid-cols-2 md:grid-cols-3 gap-4">
            <StatSmall title="Total Joins" value={stats.totalSignups} icon={<Users />} />
            <StatSmall title="Total Commission" value={`$${stats.totalEarned.toFixed(2)}`} icon={<TrendingUp />} />
            <StatSmall title="Pending Pay" value={`$${stats.pending.toFixed(2)}`} icon={<Clock />} color="amber" />
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          <Card className="lg:col-span-2 border-border/50 bg-card/40">
            <CardHeader><CardTitle className="text-white">Recent Joins</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="border-b border-border bg-secondary/30 text-muted-foreground uppercase text-[10px] font-bold tracking-widest">
                      <th className="py-4 px-6">Date</th>
                      <th className="py-4 px-6">User Email</th>
                      <th className="py-4 px-6 text-right">Commission</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {loading ? <tr><td colSpan={3} className="py-10 text-center"><Loader2 className="animate-spin inline mr-2" /></td></tr> : (referrals && referrals.length > 0) ? referrals.map((r: any) => (
                      <tr key={r.id} className="hover:bg-secondary/10">
                        <td className="py-4 px-6 text-xs text-muted-foreground">{r.createdAt?.seconds ? format(r.createdAt.seconds * 1000, 'MMM d, yyyy') : 'Recently'}</td>
                        <td className="py-4 px-6 font-bold text-white">{r.referredUserEmail ? `${r.referredUserEmail.slice(0, 3)}***@${r.referredUserEmail.split('@')[1]}` : 'Anonymous'}</td>
                        <td className="py-4 px-6 text-right font-bold text-emerald-500">${(r.amount || 0).toFixed(2)}</td>
                      </tr>
                    )) : <tr><td colSpan={3} className="py-20 text-center text-muted-foreground italic">No referrals yet.</td></tr>}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50 bg-card/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Trophy className="text-amber-500 w-5 h-5" /> Top Referrers</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {leaderboard?.map((l: any, i: number) => (
                <div key={l.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/20">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-black text-muted-foreground w-4">{i + 1}.</span>
                    <p className="text-sm font-bold text-white">{l.name.slice(0, 10)}...</p>
                  </div>
                  <Badge variant="outline" className="font-mono text-[10px] text-accent border-accent/20">
                    ${(l.referralEarnings || 0).toLocaleString()}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}