
'use client';

import { useEffect, useState, useMemo, memo } from 'react';
import { Navigation } from '@/components/Navigation';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { 
  Wallet, 
  Activity, 
  History, 
  Trophy, 
  Terminal,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Calendar,
  Zap,
  ArrowRight,
  Clock,
  PieChart,
  Award,
  Target,
  ChevronRight,
  ShieldAlert,
  Loader2,
  XCircle
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from "@/components/ui/skeleton";
import { useFirestore, useCollection } from '@/firebase';
import { where, orderBy, onSnapshot, doc, limit } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { NotificationBell } from '@/components/NotificationBell';
import { cn } from '@/lib/utils';
import { format, isValid } from 'date-fns';
import { getTradeDate } from '@/lib/tradeUtils';

const MetricCard = memo(function MetricCard({ 
  title, 
  value, 
  icon, 
  color = 'primary',
  trend
}: { 
  title: string, 
  value: string, 
  icon: React.ReactNode, 
  color?: string,
  trend?: { val: string, positive: boolean }
}) {
  return (
    <Card className="border-border/50 bg-card/40 transition-all duration-300 hover:border-primary/30 group">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground group-hover:text-primary transition-colors">{title}</span>
          <div className={cn("p-2 rounded-lg border border-border group-hover:border-primary/20 transition-colors bg-secondary/50")}>
            {icon}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-3xl font-bold font-headline tabular-nums leading-none text-white">{value}</span>
          {trend && (
            <div className={cn("flex items-center gap-1 text-[10px] font-bold uppercase", trend.positive ? "text-emerald-500" : "text-destructive")}>
              {trend.positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {trend.val}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
});

export default function DashboardPage() {
  const { user, userData, loading: authLoading } = useAuth();
  const db = useFirestore();
  const { toast } = useToast();
  const [livePrices, setLivePrices] = useState<Record<string, any>>({});

  // 1. Fetch Demo Accounts
  const accountConstraints = useMemo(() => {
    if (!user?.uid) return [];
    return [
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    ];
  }, [user?.uid]);

  const { data: accounts, loading: accountsLoading } = useCollection<any>(
    user?.uid ? 'demoAccounts' : null,
    accountConstraints
  );

  // 2. Fetch Trades
  const tradeConstraints = useMemo(() => {
    if (!user?.uid) return [];
    return [
      where('userId', '==', user.uid),
      orderBy('openedAt', 'desc')
    ];
  }, [user?.uid]);

  const { data: allTrades, loading: tradesLoading } = useCollection<any>(
    user?.uid ? 'demoTrades' : null,
    tradeConstraints
  );

  // 3. Separate Open and Closed Trades
  const openTrades = useMemo(() => allTrades.filter(t => t.status === 'open'), [allTrades]);
  const closedTrades = useMemo(() => allTrades.filter(t => t.status === 'closed'), [allTrades]);

  // 4. Live Prices for Open Trade P&L Calculation
  useEffect(() => {
    const fetchPrices = async () => {
      try {
        const res = await fetch('/api/terminal/live-prices');
        if (res.ok) {
          const data = await res.json();
          setLivePrices(data);
        }
      } catch (e) {}
    };
    fetchPrices();
    const interval = setInterval(fetchPrices, 5000);
    return () => clearInterval(interval);
  }, []);

  // 5. Compute Stats from Closed History
  const stats = useMemo(() => {
    if (closedTrades.length === 0) return { total: 0, winRate: 0, totalPnl: 0, best: 0, worst: 0 };
    const wins = closedTrades.filter(t => (t.pnl || 0) > 0);
    const totalPnl = closedTrades.reduce((acc, t) => acc + (t.pnl || 0), 0);
    const best = Math.max(...closedTrades.map(t => (t.pnl || 0)));
    const worst = Math.min(...closedTrades.map(t => (t.pnl || 0)));
    return {
      total: closedTrades.length,
      winRate: (wins.length / closedTrades.length) * 100,
      totalPnl,
      best,
      worst
    };
  }, [closedTrades]);

  const calculateOpenPnl = (trade: any) => {
    const priceData = livePrices[trade.symbol];
    if (!priceData) return 0;
    const currentPrice = trade.type === 'buy' ? priceData.bid : priceData.ask;
    const diff = trade.type === 'buy' ? currentPrice - trade.openPrice : trade.openPrice - currentPrice;
    
    // Contract size approximation
    const isForex = !['XAUUSD', 'BTCUSD', 'ETHUSD'].includes(trade.symbol);
    const contractSize = isForex ? 100000 : (trade.symbol === 'XAUUSD' ? 100 : 1);
    return diff * trade.lots * contractSize;
  };

  const closeTrade = async (tradeId: string) => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/terminal/trades/${tradeId}/close`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) toast({ title: "Trade Closed Successfully" });
      else throw new Error("Failed to close trade");
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    }
  };

  if (authLoading) return null;

  return (
    <div className="flex min-h-screen bg-background">
      <Navigation />
      
      <main className="flex-1 p-4 md:p-8 overflow-y-auto custom-scrollbar">
        <header className="flex flex-col md:flex-row justify-between items-start mb-10 gap-6">
          <div>
            <h1 className="text-3xl font-headline font-bold mb-1 text-white">Trader Terminal</h1>
            <p className="text-muted-foreground">Monitoring active challenges and node performance.</p>
          </div>
          <div className="flex items-center gap-4">
            <NotificationBell />
            <Button className="font-bold cyan-box-glow cursor-pointer" asChild>
              <Link href="/challenges"><Zap className="w-4 h-4 mr-2" /> New Challenge</Link>
            </Button>
          </div>
        </header>

        {/* 1. CHALLENGE ACCOUNTS SECTION */}
        <section className="mb-12">
          <div className="flex items-center gap-2 mb-6">
            <Trophy className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-headline font-bold text-white uppercase tracking-tight">Active Challenges</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {accountsLoading ? (
              [1, 2, 3].map(i => <Skeleton key={i} className="h-64 rounded-3xl bg-secondary/20" />)
            ) : accounts.length === 0 ? (
              <Card className="col-span-full border-2 border-dashed border-border/50 bg-secondary/5 p-12 text-center flex flex-col items-center justify-center space-y-6">
                 <Terminal className="w-16 h-16 text-muted-foreground opacity-20" />
                 <div className="max-w-sm">
                   <h3 className="text-xl font-bold text-white mb-2">No active challenges</h3>
                   <p className="text-muted-foreground text-sm leading-relaxed">You haven't started any evaluations yet. Purchase a challenge to begin your institutional funding journey.</p>
                 </div>
                 <Button className="font-bold cyan-box-glow px-10 h-12 rounded-xl" asChild>
                   <Link href="/challenges">Buy a Challenge <ArrowRight className="ml-2 w-4 h-4" /></Link>
                 </Button>
              </Card>
            ) : (
              accounts.map((acc: any) => {
                const pnl = (acc.balance || 0) - (acc.startBalance || 0);
                const targetGap = (acc.profitTarget || 0) - (acc.startBalance || 0);
                const progress = targetGap > 0 ? Math.min(100, Math.max(0, (pnl / targetGap) * 100)) : 0;
                
                return (
                  <Card key={acc.id} className="bg-card/40 border-border/50 hover:border-primary/40 transition-all overflow-hidden relative group shadow-xl">
                    <div className={cn(
                      "absolute top-0 left-0 w-full h-1.5",
                      acc.status === 'blown' ? "bg-destructive" : acc.status === 'passed' ? "bg-amber-500" : "bg-primary"
                    )} />
                    <CardHeader className="pb-4">
                      <div className="flex justify-between items-start">
                         <Badge className={cn(
                           "uppercase text-[9px] font-black border-none px-3 py-1",
                           acc.status === 'active' ? "bg-emerald-500/20 text-emerald-500" : 
                           acc.status === 'blown' ? "bg-destructive/20 text-destructive" :
                           "bg-amber-500/20 text-amber-500"
                         )}>
                           {acc.status || 'Active'}
                         </Badge>
                         <span className="text-[10px] font-mono text-muted-foreground">ID: {acc.id?.slice(0, 8)}</span>
                      </div>
                      <CardTitle className="text-xl font-headline font-bold text-white group-hover:text-primary transition-colors mt-2">{acc.label}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                       <div className="grid grid-cols-2 gap-4 border-b border-white/5 pb-4">
                          <div>
                             <p className="text-[9px] font-black uppercase text-muted-foreground tracking-widest mb-1">Balance</p>
                             <p className="text-lg font-bold text-white font-mono">${(acc.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                          </div>
                          <div>
                             <p className="text-[9px] font-black uppercase text-muted-foreground tracking-widest mb-1">P&L</p>
                             <p className={cn("text-lg font-bold font-mono", pnl >= 0 ? 'text-emerald-500' : 'text-destructive')}>
                               {pnl >= 0 ? '+' : ''}${pnl.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                             </p>
                          </div>
                       </div>
                       
                       <div className="space-y-2">
                         <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest">
                           <span className="text-muted-foreground">Profit Progress</span>
                           <span className="text-white">${(acc.profitTarget || 0).toLocaleString()} Target</span>
                         </div>
                         <Progress value={progress} className="h-1.5" />
                       </div>

                       <div className="grid grid-cols-2 gap-4 pt-2">
                          <div className="p-3 rounded-xl bg-secondary/30 border border-border">
                             <p className="text-[8px] font-black uppercase text-muted-foreground mb-1">Daily Loss Limit</p>
                             <p className="text-xs font-bold text-white">${(acc.dailyLoss || 0).toLocaleString()}</p>
                          </div>
                          <div className="p-3 rounded-xl bg-secondary/30 border border-border">
                             <p className="text-[8px] font-black uppercase text-muted-foreground mb-1">Max Loss Limit</p>
                             <p className="text-xs font-bold text-white">${(acc.maxLoss || 0).toLocaleString()}</p>
                          </div>
                       </div>
                    </CardContent>
                    <CardFooter className="pt-2 pb-6 px-6">
                       <Button className="w-full font-black cyan-box-glow h-12 rounded-xl" asChild disabled={acc.status === 'blown'}>
                          <Link href={`/demo?accountId=${acc.id}`}>
                            <Terminal className="w-4 h-4 mr-2" /> Open Node Terminal
                          </Link>
                       </Button>
                    </CardFooter>
                  </Card>
                );
              })
            )}
          </div>
        </section>

        {/* 2. STATS ROW */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 mb-12">
          <MetricCard title="Total Trades" value={stats.total.toString()} icon={<Activity className="text-primary w-4 h-4" />} />
          <MetricCard title="Win Rate" value={`${stats.winRate.toFixed(1)}%`} icon={<Award className="text-amber-500 w-4 h-4" />} color="amber" />
          <MetricCard title="Total Net P&L" value={`$${stats.totalPnl.toLocaleString()}`} icon={<Wallet className="text-emerald-500 w-4 h-4" />} trend={{ val: 'Closed Only', positive: stats.totalPnl >= 0 }} />
          <MetricCard title="Best Trade" value={`$${stats.best.toLocaleString()}`} icon={<TrendingUp className="text-emerald-500 w-4 h-4" />} color="green" />
          <MetricCard title="Worst Trade" value={`$${stats.worst.toLocaleString()}`} icon={<TrendingDown className="text-destructive w-4 h-4" />} color="red" />
        </div>

        {/* 3. OPEN POSITIONS SECTION */}
        <section className="mb-12">
          <Card className="border-border/50 bg-card/40 backdrop-blur-sm overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between border-b border-white/5 pb-4">
              <div>
                <CardTitle className="text-xl font-headline text-white flex items-center gap-2">
                  <Activity className="w-5 h-5 text-accent" /> Live Terminal Positions
                </CardTitle>
                <CardDescription>Real-time execution monitoring.</CardDescription>
              </div>
              <Badge variant="outline" className="animate-pulse bg-accent/5 text-accent border-accent/30 uppercase text-[9px] font-black tracking-widest h-6">
                <div className="w-1.5 h-1.5 rounded-full bg-accent mr-2" /> Live Sync
              </Badge>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-black tracking-widest">
                    <tr>
                      <th className="py-4 px-6">Symbol</th>
                      <th className="py-4 px-4">Type</th>
                      <th className="py-4 px-4">Lots</th>
                      <th className="py-4 px-4">Entry Price</th>
                      <th className="py-4 px-4 text-right">Current P&L</th>
                      <th className="py-4 px-6 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {tradesLoading ? (
                      [1, 2].map(i => <tr key={i} className="animate-pulse"><td colSpan={6} className="py-6 px-6"><div className="h-4 bg-secondary/50 rounded w-full" /></td></tr>)
                    ) : openTrades.length === 0 ? (
                      <tr><td colSpan={6} className="py-20 text-center text-muted-foreground italic text-sm">No live positions in the terminal.</td></tr>
                    ) : (
                      openTrades.map((t: any) => {
                        const openPnl = calculateOpenPnl(t);
                        return (
                          <tr key={t.id} className="hover:bg-white/5 transition-colors">
                            <td className="py-4 px-6 font-bold text-white">{t.symbol}</td>
                            <td className="py-4 px-4">
                              <Badge variant="outline" className={cn(
                                "text-[9px] font-black uppercase",
                                t.type === 'buy' ? 'text-emerald-500 border-emerald-500/30' : 'text-destructive border-destructive/30'
                              )}>{t.type}</Badge>
                            </td>
                            <td className="py-4 px-4 font-mono text-zinc-400">{t.lots}</td>
                            <td className="py-4 px-4 font-mono text-white">${t.openPrice.toLocaleString()}</td>
                            <td className={cn("py-4 px-4 text-right font-bold tabular-nums", openPnl >= 0 ? 'text-emerald-500' : 'text-destructive')}>
                              {openPnl >= 0 ? '+' : ''}${openPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="py-4 px-6 text-right">
                              <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-destructive/20 text-destructive/50 hover:text-destructive cursor-pointer" onClick={() => closeTrade(t.id)}>
                                <XCircle className="w-5 h-5" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* 4. TRADE HISTORY SECTION */}
        <section className="mb-20">
          <Card className="border-border/50 bg-card/40 backdrop-blur-sm overflow-hidden">
            <CardHeader className="border-b border-white/5 pb-4">
              <CardTitle className="text-xl font-headline text-white flex items-center gap-2">
                <History className="w-5 h-5 text-primary" /> Execution Ledger
              </CardTitle>
              <CardDescription>Archive of the last 50 closed positions.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-black tracking-widest">
                    <tr>
                      <th className="py-4 px-6">Symbol</th>
                      <th className="py-4 px-4">Type</th>
                      <th className="py-4 px-4">Lots</th>
                      <th className="py-4 px-4">Entry</th>
                      <th className="py-4 px-4">Exit Price</th>
                      <th className="py-4 px-4">Closed At</th>
                      <th className="py-4 px-6 text-right">Final P&L</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {tradesLoading ? (
                      [1, 2, 3].map(i => <tr key={i} className="animate-pulse"><td colSpan={7} className="py-6 px-6"><div className="h-4 bg-secondary/50 rounded w-full" /></td></tr>)
                    ) : closedTrades.length === 0 ? (
                      <tr><td colSpan={7} className="py-20 text-center text-muted-foreground italic text-sm">No historical records found.</td></tr>
                    ) : (
                      closedTrades.slice(0, 50).map((t: any) => (
                        <tr key={t.id} className="hover:bg-primary/5 transition-colors">
                          <td className="py-4 px-6 font-bold text-white">{t.symbol}</td>
                          <td className="py-4 px-4">
                            <Badge variant="outline" className={cn(
                              "text-[9px] font-black uppercase",
                              t.type === 'buy' ? 'text-emerald-500 border-emerald-500/30' : 'text-destructive border-destructive/30'
                            )}>{t.type}</Badge>
                          </td>
                          <td className="py-4 px-4 font-mono text-zinc-400">{t.lots}</td>
                          <td className="py-4 px-4 font-mono text-xs text-muted-foreground">${t.openPrice.toLocaleString()}</td>
                          <td className="py-4 px-4 font-mono text-xs text-white">${t.closePrice?.toLocaleString()}</td>
                          <td className="py-4 px-4 text-xs text-muted-foreground">
                             {t.closedAt ? format(getTradeDate(t.closedAt)!, 'MMM d, HH:mm') : '—'}
                          </td>
                          <td className={cn("py-4 px-6 text-right font-bold tabular-nums", (t.pnl || 0) >= 0 ? 'text-emerald-500' : 'text-destructive')}>
                            {(t.pnl || 0) >= 0 ? '+' : ''}${(t.pnl || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
