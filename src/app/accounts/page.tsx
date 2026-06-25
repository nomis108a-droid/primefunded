"use client";

import { useMemo } from 'react';
import { Navigation } from '@/components/Navigation';
import { useAuth } from '@/context/AuthContext';
import { useCollection, useFirestore } from '@/firebase';
import { limit, where, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ShieldCheck, Plus, Copy, SearchX, Activity, Skull, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export default function AccountsPage() {
  const { user, userData } = useAuth();
  const db = useFirestore();
  const { toast } = useToast();

  const constraints = useMemo(() => [
    where('userId', '==', user?.uid || '_none_'),
    limit(20)
  ], [user?.uid]);

  const { data: accounts, loading } = useCollection<any>(
    user ? 'mt5_accounts' : null,
    constraints
  );

  const activeAccounts = useMemo(() => 
    accounts.filter(a => a.status === 'active' || a.status === 'pending_activation')
  , [accounts]);

  const breachedAccounts = useMemo(() => 
    accounts.filter(a => a.status === 'breached' || a.status === 'terminated')
  , [accounts]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: "Account ID copied to clipboard." });
  };

  const handleSetActive = async (acc: any) => {
    if (!user || !db) return;
    try {
      await updateDoc(doc(db, "users", user.uid), {
        mt5Login: acc.login,
        accountPlan: acc.accountPlan,
        accountSize: acc.accountSize || ('$' + (acc.accountBalance/1000).toFixed(0) + 'k'),
        accountBalance: acc.accountBalance,
        accountStatus: 'active',
        currentPhase: acc.phase,
        updatedAt: serverTimestamp()
      });
      toast({ title: "Node set as active", description: `Dashboard now synced with Node ${acc.login}` });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: "Failed to set active account." });
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      <Navigation />
      <main className="flex-1 p-4 md:p-8 overflow-y-auto custom-scrollbar">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-10">
          <div>
            <h1 className="text-3xl font-headline font-bold mb-1 text-white">Your Trading Accounts</h1>
            <p className="text-muted-foreground text-sm md:text-base">Manage your evaluations and funded credentials.</p>
          </div>
          <Button asChild className="w-full md:w-auto font-bold rounded-xl cyan-box-glow cursor-pointer">
            <Link href="/challenges"><Plus className="w-4 h-4 mr-2" /> New Challenge</Link>
          </Button>
        </header>

        <div className="space-y-12">
          {/* Active Accounts Section */}
          <section>
            <div className="flex items-center gap-2 mb-6">
               <ShieldCheck className="w-5 h-5 text-primary" />
               <h2 className="text-xl font-headline font-bold text-white uppercase tracking-tight">Active Challenges</h2>
            </div>
            <div className="grid gap-6">
              {loading ? (
                [1].map(i => (
                  <Card key={i} className="border-border/50 bg-secondary/10 animate-pulse h-48 rounded-2xl" />
                ))
              ) : activeAccounts.length === 0 ? (
                <Card className="border-2 border-dashed border-border/50 bg-secondary/5">
                  <CardContent className="flex flex-col items-center justify-center p-12 text-center space-y-4">
                    <p className="text-sm text-muted-foreground">No active trading evaluations found.</p>
                  </CardContent>
                </Card>
              ) : (
                activeAccounts.map((acc) => (
                  <AccountCard 
                    key={acc.id} 
                    acc={acc} 
                    isActiveSection={true} 
                    isCurrentActive={userData?.mt5Login === acc.login}
                    onCopy={copyToClipboard}
                    onSetActive={handleSetActive}
                  />
                ))
              )}
            </div>
          </section>

          <Separator className="bg-white/5" />

          {/* Breached Accounts Section */}
          <section className="pb-20">
            <div className="flex items-center gap-2 mb-6">
               <Skull className="w-5 h-5 text-destructive" />
               <h2 className="text-xl font-headline font-bold text-white uppercase tracking-tight opacity-70">Terminated Accounts</h2>
            </div>
            <div className="grid gap-6">
              {loading ? (
                [1].map(i => (
                  <Card key={i} className="border-border/50 bg-secondary/10 animate-pulse h-48 rounded-2xl" />
                ))
              ) : breachedAccounts.length === 0 ? (
                <div className="text-center p-10 border border-dashed border-border/30 rounded-2xl text-xs text-muted-foreground font-bold uppercase tracking-widest">
                  Zero liquidation records in history.
                </div>
              ) : (
                breachedAccounts.map((acc) => (
                  <AccountCard 
                    key={acc.id} 
                    acc={acc} 
                    isActiveSection={false} 
                    onCopy={copyToClipboard}
                    onSetActive={() => {}}
                  />
                ))
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function AccountCard({ 
  acc, 
  isActiveSection, 
  isCurrentActive,
  onCopy,
  onSetActive 
}: { 
  acc: any, 
  isActiveSection: boolean, 
  isCurrentActive?: boolean,
  onCopy: (text: string) => void,
  onSetActive: (acc: any) => void
}) {
  return (
    <Card className={cn(
      "border-border/50 transition-all",
      isActiveSection ? "bg-primary/5 border-primary/20 hover:border-primary/40" : "bg-destructive/5 border-destructive/20 grayscale opacity-60"
    )}>
      <CardHeader className="flex flex-row items-center justify-between pb-6">
        <div className="flex items-center gap-3 md:gap-4">
          <div className={cn(
            "p-3 rounded-xl border",
            isActiveSection ? "bg-primary/10 border-primary/20 text-primary" : "bg-destructive/10 border-destructive/20 text-destructive"
          )}>
            {isActiveSection ? <ShieldCheck className="w-6 h-6" /> : <Skull className="w-6 h-6" />}
          </div>
          <div>
            <CardTitle className="text-xl font-headline font-bold text-white">
              {acc.accountBalance ? `$${(acc.accountBalance / 1000).toFixed(0)}k` : 'Standard'} {acc.accountPlan || 'Account'}
            </CardTitle>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Account ID: {acc.login || 'PENDING'}</p>
              {acc.login && (
                <button onClick={() => onCopy(acc.login)} className="text-muted-foreground hover:text-primary transition-colors cursor-pointer">
                  <Copy className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isCurrentActive && (
            <Badge className="bg-emerald-500 text-black font-black text-[9px] uppercase px-2 py-1">Synced to Dashboard</Badge>
          )}
          <Badge className={cn(
            "uppercase text-[10px] font-black tracking-widest px-3 py-1",
            isActiveSection ? "bg-primary/20 text-primary" : "bg-destructive text-white"
          )}>
            {isActiveSection ? (acc.status || 'Active') : 'BREACHED'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col sm:flex-row gap-3">
          {isActiveSection ? (
            <>
              <Button variant="outline" size="sm" className="h-10 px-6 rounded-xl font-bold border-border/50 hover:bg-secondary cursor-pointer" asChild>
                <Link href="/dashboard">
                  <Activity className="w-4 h-4 mr-2" /> View Terminal
                </Link>
              </Button>
              {!isCurrentActive && (
                <Button variant="secondary" size="sm" className="h-10 px-6 rounded-xl font-bold cursor-pointer" onClick={() => onSetActive(acc)}>
                   Set as Active Node
                </Button>
              )}
            </>
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