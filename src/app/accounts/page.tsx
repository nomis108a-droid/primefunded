
"use client";

import { useMemo } from 'react';
import { Navigation } from '@/components/Navigation';
import { useAuth } from '@/context/AuthContext';
import { useCollection } from '@/firebase';
import { where, orderBy } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ShieldCheck, Plus, Terminal, Skull, AlertCircle, Activity, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

export default function AccountsPage() {
  const { user } = useAuth();

  const constraints = useMemo(() => {
    if (!user?.uid) return [];
    return [
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    ];
  }, [user?.uid]);

  const { data: accounts, loading } = useCollection<any>(
    user?.uid ? 'demoAccounts' : null,
    constraints
  );

  const activeAccounts = useMemo(() => 
    accounts.filter(a => a.status === 'active' || a.status === 'passed')
  , [accounts]);

  const breachedAccounts = useMemo(() => 
    accounts.filter(a => a.status === 'blown' || a.status === 'terminated')
  , [accounts]);

  return (
    <div className="flex min-h-screen bg-background">
      <Navigation />
      <main className="flex-1 p-4 md:p-8 overflow-y-auto custom-scrollbar">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-10">
          <div>
            <h1 className="text-3xl font-headline font-bold mb-1 text-white">Challenge Node Registry</h1>
            <p className="text-muted-foreground text-sm md:text-base">Managing your active evaluations and funding credentials.</p>
          </div>
          <Button asChild className="w-full md:w-auto font-bold rounded-xl cyan-box-glow cursor-pointer">
            <Link href="/challenges"><Plus className="w-4 h-4 mr-2" /> Start New Challenge</Link>
          </Button>
        </header>

        <div className="space-y-12">
          {/* Active Accounts Section */}
          <section>
            <div className="flex items-center gap-2 mb-6">
               <ShieldCheck className="w-5 h-5 text-primary" />
               <h2 className="text-xl font-headline font-bold text-white uppercase tracking-tight">Active Evaluations</h2>
            </div>
            <div className="grid gap-6">
              {loading ? (
                [1, 2].map(i => <Card key={i} className="border-border/50 bg-secondary/10 animate-pulse h-48 rounded-2xl" />)
              ) : activeAccounts.length === 0 ? (
                <Card className="border-2 border-dashed border-border/50 bg-secondary/5 p-20 flex flex-col items-center justify-center text-center space-y-4">
                    <Activity className="w-12 h-12 text-muted-foreground opacity-20" />
                    <p className="text-sm text-muted-foreground font-bold uppercase tracking-widest">No active trading nodes provisioned.</p>
                </Card>
              ) : (
                activeAccounts.map((acc) => (
                  <AccountCard key={acc.id} acc={acc} isActiveSection={true} />
                ))
              )}
            </div>
          </section>

          <Separator className="bg-white/5" />

          {/* Breached Accounts Section */}
          <section className="pb-20">
            <div className="flex items-center gap-2 mb-6">
               <Skull className="w-5 h-5 text-destructive" />
               <h2 className="text-xl font-headline font-bold text-white uppercase tracking-tight opacity-70">Archive / Terminated</h2>
            </div>
            <div className="grid gap-6">
              {loading ? (
                <Card className="border-border/50 bg-secondary/10 animate-pulse h-32 rounded-2xl" />
              ) : breachedAccounts.length === 0 ? (
                <div className="text-center p-10 border border-dashed border-border/30 rounded-2xl text-xs text-muted-foreground font-bold uppercase tracking-widest">
                  Zero liquidation records in history.
                </div>
              ) : (
                breachedAccounts.map((acc) => (
                  <AccountCard key={acc.id} acc={acc} isActiveSection={false} />
                ))
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function AccountCard({ acc, isActiveSection }: { acc: any, isActiveSection: boolean }) {
  const pnl = (acc.balance || 0) - (acc.startBalance || 0);
  
  return (
    <Card className={cn(
      "border-border/50 transition-all shadow-xl",
      isActiveSection ? "bg-primary/5 border-primary/20 hover:border-primary/40" : "bg-destructive/5 border-destructive/20 grayscale opacity-60"
    )}>
      <CardHeader className="flex flex-row items-center justify-between pb-6">
        <div className="flex items-center gap-3 md:gap-4">
          <div className={cn(
            "p-3 rounded-xl border shadow-lg",
            isActiveSection ? "bg-primary/10 border-primary/20 text-primary" : "bg-destructive/10 border-destructive/20 text-destructive"
          )}>
            {isActiveSection ? <ShieldCheck className="w-6 h-6" /> : <Skull className="w-6 h-6" />}
          </div>
          <div>
            <CardTitle className="text-xl font-headline font-bold text-white">
              {acc.label || 'Demo Challenge Account'}
            </CardTitle>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mt-1">Node ID: {acc.id?.slice(0, 12).toUpperCase()}</p>
          </div>
        </div>
        <Badge className={cn(
          "uppercase text-[10px] font-black tracking-widest px-3 py-1",
          isActiveSection ? "bg-primary text-black" : "bg-destructive text-white"
        )}>
          {acc.status || 'Active'}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
           <AccountMetric label="Node Balance" value={`$${(acc.balance || 0).toLocaleString()}`} />
           <AccountMetric label="Session Equity" value={`$${(acc.equity || 0).toLocaleString()}`} />
           <AccountMetric label="Net Performance" value={`${pnl >= 0 ? '+' : ''}$${pnl.toLocaleString()}`} color={pnl >= 0 ? 'text-emerald-500' : 'text-destructive'} />
           <AccountMetric label="Target Status" value={`$${(acc.profitTarget || 0).toLocaleString()}`} />
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          {isActiveSection ? (
            <Button className="h-11 px-8 rounded-xl font-black cyan-box-glow cursor-pointer" asChild>
              <Link href={`/demo?accountId=${acc.id}`}>
                <Terminal className="w-4 h-4 mr-2" /> Open Node Terminal <ChevronRight className="ml-2 w-4 h-4" />
              </Link>
            </Button>
          ) : (
            <p className="text-xs text-destructive font-bold uppercase tracking-widest flex items-center gap-2">
              <AlertCircle className="w-4 h-4" /> This node has been liquidated due to a risk breach.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function AccountMetric({ label, value, color = 'text-white' }: { label: string, value: string, color?: string }) {
  return (
    <div>
      <p className="text-[9px] font-black uppercase text-muted-foreground tracking-widest mb-1">{label}</p>
      <p className={cn("text-sm font-bold font-mono", color)}>{value}</p>
    </div>
  );
}
