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
import { ShieldCheck, Plus, Copy, SearchX, Terminal, Activity, Skull } from 'lucide-react';
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
    toast({ title: "Copied", description: "Account detail copied to clipboard." });
  };

  const handleSetActive = async (acc: any) => {
    if (!user || !db) return;
    try {
      await updateDoc(doc(db, "users", user.uid), {
        mt5Login: acc.login,
        mt5Password: acc.password,
        mt5Server: acc.mt5Server || 'MetaQuotes-Demo',
        accountPlan: acc.accountPlan,
        accountSize: acc.accountSize || ('$' + (acc.accountBalance/1000).toFixed(0) + 'k'),
        accountBalance: acc.accountBalance,
        accountStatus: 'active',
        currentPhase: acc.phase,
        updatedAt: serverTimestamp()
      });
      toast({ title: "Account set as active", description: `Terminal now synced with PF-${acc.login}` });
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
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Account ID: PF-{acc.login || 'PENDING'}</p>
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8 mb-8 p-6 bg-background/40 rounded-2xl border border-border/30">
          <CredentialItem label="Platform" value="MetaTrader 5" />
          <CredentialItem label="Server" value={acc.mt5Server || 'MetaQuotes-Demo'} />
          
          {isActiveSection && (
            <>
              <CredentialItem 
                label="Login" 
                value={acc.login || 'Generating...'} 
                onCopy={acc.login ? () => onCopy(acc.login) : undefined} 
              />
              <CredentialItem 
                label="Password" 
                value={acc.password ? "••••••••" : "Pending"} 
                onCopy={acc.password ? () => onCopy(acc.password) : undefined} 
              />
            </>
          )}
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3">
          {isActiveSection ? (
            <>
              <Button variant="outline" size="sm" className="h-10 px-6 rounded-xl font-bold border-border/50 hover:bg-secondary cursor-pointer" asChild>
                <Link href="/mt5-account">
                  <Terminal className="w-4 h-4 mr-2" /> Live Metrics
                </Link>
              </Button>
              {!isCurrentActive && (
                <Button variant="secondary" size="sm" className="h-10 px-6 rounded-xl font-bold cursor-pointer" onClick={() => onSetActive(acc)}>
                   <Activity className="w-4 h-4 mr-2" /> Set as Active
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

function CredentialItem({ label, value, onCopy }: { label: string, value: string, onCopy?: () => void }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[9px] uppercase font-black text-muted-foreground tracking-[0.2em]">{label}</p>
      <div className="flex items-center gap-2">
        <p className="font-mono text-sm font-bold text-white truncate">{value}</p>
        {onCopy && (
          <button onClick={onCopy} className="text-muted-foreground hover:text-primary transition-colors cursor-pointer p-1">
            <Copy className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

import { AlertCircle } from 'lucide-react';
