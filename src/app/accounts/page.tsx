
"use client";

import { useMemo } from 'react';
import { Navigation } from '@/components/Navigation';
import { useAuth } from '@/context/AuthContext';
import { useCollection } from '@/firebase';
import { limit, where } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ShieldCheck, Plus, Copy, SearchX, Terminal } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export default function AccountsPage() {
  const { user, userData } = useAuth();
  const { toast } = useToast();

  const constraints = useMemo(() => [
    where('userId', '==', user?.uid || '_none_'),
    limit(20)
  ], [user?.uid]);

  const { data: accounts, loading } = useCollection<any>(
    user ? 'mt5_accounts' : null,
    constraints
  );

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: "Account detail copied to clipboard." });
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

        <div className="grid gap-6">
          {loading ? (
            [1, 2].map(i => (
              <Card key={i} className="border-border/50 bg-secondary/10 animate-pulse h-48 rounded-2xl" />
            ))
          ) : accounts.length === 0 ? (
            <Card className="border-2 border-dashed border-border/50 bg-secondary/5">
              <CardContent className="flex flex-col items-center justify-center p-20 text-center space-y-6">
                <div className="p-6 bg-secondary/50 rounded-full border border-border">
                  <SearchX className="w-12 h-12 text-muted-foreground opacity-20" />
                </div>
                <div className="max-w-xs space-y-2">
                  <h3 className="text-xl font-bold text-white">No active accounts</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    You don't have any active trading evaluations or funded accounts at the moment.
                  </p>
                </div>
                <Button variant="outline" className="font-bold border-primary/20 text-primary cursor-pointer" asChild>
                  <Link href="/challenges">Browse Challenges</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            accounts.map((acc) => (
              <Card key={acc.id} className={cn(
                "border-border/50 transition-all hover:border-primary/30",
                acc.status === 'active' ? "bg-primary/5 border-primary/20" : "opacity-60 grayscale bg-card/50"
              )}>
                <CardHeader className="flex flex-row items-center justify-between pb-6">
                  <div className="flex items-center gap-3 md:gap-4">
                    <div className={cn(
                      "p-3 rounded-xl border",
                      acc.status === 'active' ? "bg-primary/10 border-primary/20 text-primary" : "bg-secondary border-border text-muted-foreground"
                    )}>
                      <ShieldCheck className="w-6 h-6" />
                    </div>
                    <div>
                      <CardTitle className="text-xl font-headline font-bold text-white">
                        {acc.accountBalance ? `$${(acc.accountBalance / 1000).toFixed(0)}k` : 'Standard'} {acc.accountPlan || 'Account'}
                      </CardTitle>
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Account ID: PF-{acc.login || 'PENDING'}</p>
                    </div>
                  </div>
                  <Badge className={cn(
                    "uppercase text-[10px] font-black tracking-widest px-3 py-1",
                    acc.status === 'active' ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-muted text-muted-foreground"
                  )}>
                    {acc.status || 'Active'}
                  </Badge>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8 mb-8 p-6 bg-background/40 rounded-2xl border border-border/30">
                    <CredentialItem label="Platform" value="MetaTrader 5" />
                    <CredentialItem label="Server" value={acc.mt5Server || 'MetaQuotes-Demo'} />
                    <CredentialItem 
                      label="Login" 
                      value={acc.login || 'Generating...'} 
                      onCopy={acc.login ? () => copyToClipboard(acc.login) : undefined} 
                    />
                    <CredentialItem 
                      label="Password" 
                      value={acc.password ? "••••••••" : "Pending"} 
                      onCopy={acc.password ? () => copyToClipboard(acc.password) : undefined} 
                    />
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button variant="outline" size="sm" className="h-10 px-6 rounded-xl font-bold border-border/50 hover:bg-secondary cursor-pointer" asChild>
                      <Link href="/mt5-account">
                        <Terminal className="w-4 h-4 mr-2" /> Live Metrics
                      </Link>
                    </Button>
                    {acc.status === 'active' && (
                      <Button variant="secondary" size="sm" className="h-10 px-6 rounded-xl font-bold cursor-pointer">
                        Help Center
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </main>
    </div>
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
