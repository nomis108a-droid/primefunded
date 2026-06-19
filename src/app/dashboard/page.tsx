
'use client';

import { useEffect, useState, useMemo, memo } from 'react';
import { Navigation } from '@/components/Navigation';
import { useAuth } from '@/context/AuthContext';
import { useRouter, useSearchParams } from 'next/navigation';
import { 
  Wallet, 
  Activity, 
  Server, 
  ShieldCheck, 
  Copy, 
  Check, 
  AlertTriangle, 
  ExternalLink, 
  Users, 
  DollarSign, 
  Skull,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Calendar,
  History,
  Trophy,
  Zap,
  ArrowRight,
  Clock,
  Loader2,
  PieChart,
  ArrowUpRight,
  ArrowDownRight,
  Award,
  Download,
  Target,
  ChevronRight,
  ShieldAlert
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useFirestore, useCollection } from '@/firebase';
import { where, doc, limit, orderBy, onSnapshot, collection, query, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { NotificationBell } from '@/components/NotificationBell';
import { cn } from '@/lib/utils';
import { 
  BarChart, 
  Bar, 
  Cell,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as ChartTooltip, 
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';
import { format, subDays, subMonths, differenceInSeconds, isValid, startOfDay, differenceInDays } from 'date-fns';
import { getTradeDate, enrichTrades } from '@/lib/tradeUtils';
import { RULES_CONFIG, getPlanKey } from '@/lib/rulesConfig';

const getTradingDayKey = (date: Date) => {
  const adjusted = new Date(date.getTime() - (2 * 60 * 60 * 1000));
  return adjusted.toISOString().split('T')[0];
};

interface DashboardPageProps {
  adminViewMode?: boolean;
  targetUid?: string;
}

const MetricCard = memo(function MetricCard({ 
  title, 
  value, 
  icon, 
  footer, 
  disabled, 
  progress, 
  progressLabel 
}: { 
  title: string, 
  value: string, 
  icon: React.ReactNode, 
  footer?: string, 
  disabled?: boolean,
  progress?: number,
  progressLabel?: string
}) {
  return (
    <Card className={cn(
      "border-border/50 bg-card/40 transition-all duration-300 group",
      disabled ? "opacity-40 grayscale" : "hover:border-primary/30"
    )}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground group-hover:text-primary transition-colors">{title}</span>
          <div className="p-2 bg-secondary rounded-lg border border-border group-hover:border-primary/20 transition-colors">
            {icon}
          </div>
        </div>
        <div className="flex items-end gap-2 mb-4">
          <span className="text-3xl font-bold font-headline tabular-nums leading-none text-white">{value}</span>
        </div>
        
        {progress !== undefined && (
          <div className="space-y-1.5 mb-4">
            <Progress value={progress} className="h-1" />
            <p className="text-[8px] font-black uppercase tracking-wider text-primary">{progressLabel}</p>
          </div>
        )}

        {footer && <p className="text-[10px] text-muted-foreground flex items-center gap-1.5 font-bold uppercase tracking-wider text-wrap break-all"><Server className="w-3 h-3 shrink-0" /> {footer}</p>}
      </CardContent>
    </Card>
  );
});

export default function DashboardPage({ adminViewMode = false, targetUid }: DashboardPageProps) {
  const { user, userData, loading: authLoading } = useAuth();
  const db = useFirestore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isDebug = searchParams.get('debug') === 'true';
  const effectiveUid = adminViewMode && targetUid ? targetUid : user?.uid;
  const { toast } = useToast();

  const [activeLogin, setActiveLogin] = useState<string | null>(null);
  const [chartPeriod, setChartPeriod] = useState('7D');

  // FETCH ALL ACCOUNTS FOR THIS USER - NO MERGING
  const accountConstraints = useMemo(() => [
    where('userId', '==', effectiveUid || '_none_'),
    orderBy('createdAt', 'desc')
  ], [effectiveUid]);

  const { data: userAccounts, loading: accountsLoading } = useCollection<any>(
    effectiveUid ? 'mt5_accounts' : null,
    accountConstraints
  );

  // Set default active account if not set
  useEffect(() => {
    if (userAccounts.length > 0 && !activeLogin) {
      // Prioritize the login defined in the main user profile if it exists in the accounts list
      const profileLogin = userData?.mt5Login;
      if (profileLogin && userAccounts.find(a => String(a.id) === String(profileLogin))) {
        setActiveLogin(String(profileLogin));
      } else {
        setActiveLogin(String(userAccounts[0].id));
      }
    }
  }, [userAccounts, userData?.mt5Login, activeLogin]);

  const activeAccount = useMemo(() => 
    userAccounts.find(a => String(a.id) === String(activeLogin)) || userAccounts[0]
  , [userAccounts, activeLogin]);

  const isBreached = activeAccount?.status === 'breached';

  // DERIVE METRICS EXCLUSIVELY FROM ACTIVE ACCOUNT DOCUMENT
  const metrics = useMemo(() => {
    if (!activeAccount) return { balance: 0, equity: 0, initial: 100000 };
    
    const initial = parseFloat(String(activeAccount.accountBalance || 100000));
    const balance = parseFloat(String(activeAccount.liveBalance ?? activeAccount.balance ?? initial));
    const equity = parseFloat(String(activeAccount.liveEquity ?? activeAccount.equity ?? balance));
    
    return { balance, equity, initial };
  }, [activeAccount]);

  const connectivityStatus = useMemo(() => {
    if (!activeAccount) return 'offline';
    if (isBreached) return 'terminated';
    
    const rawTs = activeAccount?.lastMT5Update;
    const lastUpdateMs = rawTs?.seconds
      ? rawTs.seconds * 1000
      : rawTs instanceof Date
        ? rawTs.getTime()
        : rawTs ? Number(rawTs) : 0;
    
    const isEAOnline = lastUpdateMs > 0 && Math.floor((Date.now() - lastUpdateMs) / 1000) <= 120;

    if (isEAOnline) return 'live';
    if (activeAccount?.login && !rawTs) return 'awaiting';
    return 'offline';
  }, [activeAccount, isBreached]);

  // ISOLATED TRADES & PERFORMANCE
  const tradeConstraints = useMemo(() => [
    orderBy('date', 'desc'),
    limit(500)
  ], []);

  const { data: rawTrades, loading: tradesLoading } = useCollection<any>(
    effectiveUid ? `users/${effectiveUid}/trades` : null,
    tradeConstraints
  );

  const filteredTrades = useMemo(() => {
    if (!rawTrades || !activeAccount) return [];
    return rawTrades.filter(t => String(t.login) === String(activeAccount.id));
  }, [rawTrades, activeAccount]);

  const enrichedTrades = useMemo(() => {
    return enrichTrades(filteredTrades, activeAccount?.id || 'N/A');
  }, [filteredTrades, activeAccount?.id]);

  // RISK CALCULATIONS
  const dailyRiskMetrics = useMemo(() => {
    if (!activeAccount) return { pnl: 0, pnlPct: 0, usage: 0, limit: 3, limitAmount: 0, totalDailyLoss: 0, drawdownPct: 0, isPositive: true };
    
    const initialBalance = metrics.initial;
    const planKey = getPlanKey(activeAccount.accountPlan || '1-Step Pro');
    const phase = activeAccount.phase || 'evaluation';
    const rules = RULES_CONFIG.plans[planKey]?.[phase] || RULES_CONFIG.plans['1-step-pro']['evaluation'];
    
    const limitPct = rules.dailyDrawdown;
    const limitAmount = initialBalance * (limitPct / 100);
    
    const dailyClosedLosses = activeAccount.dailyGrossLoss ?? 0;
    const currentFloatingPnL = metrics.equity - metrics.balance;
    const currentFloatingLoss = currentFloatingPnL < 0 ? Math.abs(currentFloatingPnL) : 0;
    const totalDailyLoss = dailyClosedLosses + currentFloatingLoss;
    
    const usage = Math.min((totalDailyLoss / limitAmount) * 100, 100);
    const dailyStart = activeAccount.dailyStartBalance || initialBalance;
    const pnl = metrics.balance - dailyStart;
    const pnlPct = dailyStart > 0 ? (pnl / dailyStart) * 100 : 0;

    return { pnl, pnlPct, usage, limit: limitPct, limitAmount, totalDailyLoss, isPositive: pnl >= 0 };
  }, [activeAccount, metrics]);

  const profitTargetData = useMemo(() => {
    if (!activeAccount) return { targetPct: 0, progress: 0, hasTarget: false };
    
    const initial = metrics.initial;
    const planKey = getPlanKey(activeAccount.accountPlan || '');
    const phase = activeAccount.phase || 'evaluation';
    const rules = RULES_CONFIG.plans[planKey]?.[phase];
    
    const targetPct = rules?.profitTarget || 0;
    const targetAmount = initial * (targetPct / 100);
    const currentProfit = metrics.balance - initial;
    const progress = targetAmount > 0 ? Math.max(0, Math.min((currentProfit / targetAmount) * 100, 100)) : 0;
    
    return { targetPct, targetAmount, currentProfit, progress, hasTarget: targetPct > 0 };
  }, [activeAccount, metrics]);

  const tradingDaysData = useMemo(() => {
    if (!filteredTrades || !activeAccount) return { count: 0, required: 5, progress: 0 };
    const days = new Set<string>();
    filteredTrades.forEach(t => {
      const date = getTradeDate(t.time || t.date);
      if (date && isValid(date)) days.add(getTradingDayKey(date));
    });

    const count = days.size;
    const plan = activeAccount.accountPlan?.toLowerCase() || '';
    const phase = activeAccount.phase || 'evaluation';
    
    let required = 5;
    if (plan.includes('3-step')) {
      required = phase === 'phase1' ? 7 : phase === 'phase2' ? 6 : 5;
    } else if (plan.includes('instant')) {
      required = 1;
    }

    return { count, required, progress: Math.min((count / required) * 100, 100) };
  }, [filteredTrades, activeAccount]);

  const instrumentCheck = useMemo(() => {
    if (!activeAccount?.accountPlan?.toLowerCase().includes('instant')) return null;
    const symbolCounts: Record<string, number> = {};
    filteredTrades.forEach((t: any) => {
      const sym = t.symbol || 'N/A';
      symbolCounts[sym] = (symbolCounts[sym] || 0) + 1;
    });
    const entries = Object.entries(symbolCounts);
    const qualified = entries.filter(([_, count]) => count >= 5).length;
    const progress = entries.length > 0 ? (qualified / entries.length) * 100 : 0;
    return { qualified, total: entries.length, progress };
  }, [filteredTrades, activeAccount]);

  if (authLoading && !adminViewMode) return null;

  return (
    <div className="flex min-h-screen bg-background">
      {!adminViewMode && <Navigation />}
      
      <main className="flex-1 p-8 overflow-y-auto custom-scrollbar">
        <header className="flex flex-col md:flex-row justify-between items-start mb-10 gap-6">
          <div>
            <h1 className="text-3xl font-headline font-bold mb-1 text-white">
              {adminViewMode ? `Previewing: ${userData?.name || 'Trader'}` : "Institutional Terminal"}
            </h1>
            <p className="text-muted-foreground">Manage your funding nodes and risk protocols.</p>
          </div>
          <div className="flex items-center gap-4">
            {!adminViewMode && <NotificationBell />}
            <Badge variant="outline" className={cn(
              "h-9 px-4 uppercase font-bold tracking-widest border-white/10",
              connectivityStatus === 'live' && "border-accent/30 text-accent"
            )}>
              <div className={cn(
                "w-2 h-2 rounded-full mr-2", 
                connectivityStatus === 'live' ? 'bg-accent live-indicator' : 
                connectivityStatus === 'offline' || connectivityStatus === 'terminated' ? 'bg-destructive' : 'bg-amber-500'
              )} />
              {connectivityStatus === 'live' ? 'Live Sync' : 
               connectivityStatus === 'offline' ? 'Terminal Offline' : 
               connectivityStatus === 'terminated' ? 'Terminated' : 'Awaiting Data'}
            </Badge>
          </div>
        </header>

        {/* ACCOUNT NODE SELECTOR */}
        <section className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <Server className="w-4 h-4 text-primary" />
            <h2 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Select Active Node</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {accountsLoading ? (
              [1, 2].map(i => <Skeleton key={i} className="h-24 rounded-2xl bg-secondary/20" />)
            ) : userAccounts.length === 0 ? (
              <Card className="col-span-full border-dashed border-border/50 bg-secondary/5 p-12 text-center">
                 <p className="text-muted-foreground mb-6">No institutional nodes found. Begin your evaluation to start trading.</p>
                 <Button className="font-bold cyan-box-glow px-10 h-12 rounded-xl" asChild>
                    <Link href="/challenges">Start New Challenge <ArrowRight className="ml-2 w-4 h-4" /></Link>
                 </Button>
              </Card>
            ) : (
              userAccounts.map((acc: any) => (
                <Card 
                  key={acc.id} 
                  onClick={() => setActiveLogin(acc.id)}
                  className={cn(
                    "cursor-pointer transition-all duration-300 relative overflow-hidden group",
                    activeLogin === acc.id ? "bg-primary/10 border-primary shadow-[0_0_20px_rgba(17,179,245,0.1)]" : "bg-card/40 border-border/50 hover:border-primary/30"
                  )}
                >
                  <CardContent className="p-5">
                    <div className="flex justify-between items-start mb-3">
                       <Badge className={cn(
                         "text-[9px] font-black uppercase",
                         acc.status === 'breached' ? "bg-destructive/20 text-destructive" : "bg-secondary text-white"
                       )}>
                         {acc.status || 'Active'}
                       </Badge>
                       <span className="font-mono text-[10px] text-muted-foreground">PF-{acc.login}</span>
                    </div>
                    <p className="text-sm font-bold text-white mb-0.5">{acc.accountPlan}</p>
                    <p className="text-lg font-black text-primary font-headline">${(parseFloat(acc.accountBalance || 100000) / 1000).toFixed(0)}k Node</p>
                    {activeLogin === acc.id && (
                       <div className="absolute bottom-0 left-0 w-full h-1 bg-primary" />
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </section>

        {activeAccount ? (
          <>
            {isBreached && (
              <div className="mb-8 p-6 rounded-2xl bg-destructive/20 border border-destructive/40 flex items-center gap-6">
                <Skull className="w-10 h-10 text-destructive shrink-0" />
                <div>
                  <h3 className="text-xl font-headline font-bold text-white uppercase">Node Liquidated</h3>
                  <p className="text-sm text-destructive-foreground">Terminated: <span className="font-bold text-white">{activeAccount.breachReason || 'Institutional Risk Violation'}</span></p>
                </div>
              </div>
            )}

            <div className={cn(
              "grid grid-cols-1 md:grid-cols-2 gap-6 mb-6",
              instrumentCheck ? "lg:grid-cols-3 xl:grid-cols-5" : "lg:grid-cols-4"
            )}>
              <MetricCard 
                title="Current Balance" 
                value={`$${metrics.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} 
                icon={<Wallet className="text-primary" />} 
                disabled={isBreached} 
              />
              <MetricCard 
                title="Current Equity" 
                value={`$${metrics.equity.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} 
                icon={<Activity className="text-accent" />} 
                disabled={isBreached} 
              />
              <MetricCard 
                title="Trading Days" 
                value={`${tradingDaysData.count} / ${tradingDaysData.required} Days`} 
                icon={<Calendar className="text-emerald-500" />} 
                progress={tradingDaysData.progress}
                progressLabel={`${tradingDaysData.progress.toFixed(0)}% Completed`}
              />
              {instrumentCheck ? (
                <MetricCard 
                  title="Asset Diversity" 
                  value={`${instrumentCheck.qualified} Qualified`} 
                  icon={<ShieldCheck className="text-accent" />} 
                  progress={instrumentCheck.progress}
                  progressLabel="Min 5 trades per instrument"
                  footer="Mandatory for payouts."
                />
              ) : (
                <MetricCard 
                  title="Profit Target" 
                  value={profitTargetData.hasTarget ? `$${metrics.balance.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : 'Live Node'} 
                  icon={<Target className="text-amber-500" />} 
                  progress={profitTargetData.hasTarget ? profitTargetData.progress : undefined}
                  progressLabel={profitTargetData.hasTarget ? `${profitTargetData.progress.toFixed(1)}% to Target` : 'Funded Stage: No Target'}
                />
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <Card className={cn("border-border/50 bg-card/40", isBreached && "opacity-40")}>
                <CardContent className="p-6">
                  <div className="flex justify-between mb-4">
                    <span className="text-[10px] font-black uppercase text-muted-foreground">Daily Session P&L</span>
                    {dailyRiskMetrics.isPositive ? <TrendingUp className="text-emerald-500 w-4 h-4" /> : <TrendingDown className="text-destructive w-4 h-4" />}
                  </div>
                  <p className={cn("text-3xl font-bold font-headline", dailyRiskMetrics.isPositive ? 'text-emerald-500' : 'text-destructive')}>
                    {dailyRiskMetrics.isPositive ? '+' : ''}${dailyRiskMetrics.pnl.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase mt-1">
                    {dailyRiskMetrics.pnlPct.toFixed(2)}% session change
                  </p>
                </CardContent>
              </Card>

              <Card className={cn("border-border/50 bg-card/40", isBreached && "opacity-40")}>
                <CardContent className="p-6">
                  <div className="flex justify-between mb-4">
                    <span className="text-[10px] font-black uppercase text-muted-foreground">Daily Drawdown Status</span>
                    <span className="text-[10px] font-bold text-muted-foreground">Limit: ${dailyRiskMetrics.limitAmount.toLocaleString()}</span>
                  </div>
                  <p className="text-3xl font-bold font-headline text-white">${dailyRiskMetrics.totalDailyLoss.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                  <div className="mt-4 space-y-1.5">
                    <Progress value={dailyRiskMetrics.usage} className="h-1.5" />
                    <p className={cn("text-[9px] font-black uppercase", dailyRiskMetrics.usage > 80 ? 'text-destructive' : 'text-primary')}>
                      {dailyRiskMetrics.usage.toFixed(1)}% of institutional limit used
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className={cn("border-border/50 bg-card/40 backdrop-blur-sm", isBreached && "opacity-40")}>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-xl font-headline text-white flex items-center gap-2">
                  <History className="w-5 h-5 text-primary" /> Position Journal (Isolated)
                </CardTitle>
                <Badge variant="outline" className="text-[9px] font-black uppercase">PF-{activeAccount.login}</Badge>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-black tracking-widest">
                      <tr>
                        <th className="py-4 px-6">Symbol</th>
                        <th className="py-4 px-4">Type</th>
                        <th className="py-4 px-4">Close Time</th>
                        <th className="py-4 px-4">Duration</th>
                        <th className="py-4 px-4 text-right">Lots</th>
                        <th className="py-4 px-6 text-right">P&L</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {tradesLoading ? (
                        [1, 2, 3].map(i => <tr key={i} className="animate-pulse"><td colSpan={6} className="py-6 px-6"><div className="h-4 bg-secondary/50 rounded w-full" /></td></tr>)
                      ) : enrichedTrades.length > 0 ? (
                        enrichedTrades.slice(0, 50).map((trade: any) => (
                          <tr key={trade.id} className="hover:bg-primary/5 transition-colors">
                            <td className="py-4 px-6 font-bold text-white">{trade.symbol}</td>
                            <td className="py-4 px-4">
                              <Badge variant="outline" className={cn(
                                "text-[9px] font-black uppercase",
                                trade.type?.toLowerCase() === 'buy' ? 'text-emerald-500 border-emerald-500/30' : 'text-destructive border-destructive/30'
                              )}>{trade.type}</Badge>
                            </td>
                            <td className="py-4 px-4 text-xs text-muted-foreground font-mono">{trade.closeTime ? format(getTradeDate(trade.closeTime)!, 'MMM d, HH:mm') : '—'}</td>
                            <td className="py-4 px-4 text-xs text-muted-foreground flex items-center gap-1.5 pt-5"><Clock className="w-3 h-3" />{trade.duration}</td>
                            <td className="py-4 px-4 text-right text-white font-mono">{trade.lots || trade.volume}</td>
                            <td className={cn("py-4 px-6 text-right font-bold tabular-nums", (trade.pnl || 0) >= 0 ? 'text-emerald-500' : 'text-destructive')}>
                              {(trade.pnl || 0) >= 0 ? '+' : ''}${(trade.pnl || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr><td colSpan={6} className="py-20 text-center text-muted-foreground italic text-sm">No executions recorded for node PF-{activeAccount.login}.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </>
        ) : !accountsLoading && (
          <div className="h-[60vh] flex flex-col items-center justify-center text-center space-y-6">
             <ShieldAlert className="w-16 h-16 text-muted-foreground opacity-20" />
             <h3 className="text-2xl font-headline font-bold text-white uppercase tracking-tight">Access Terminal</h3>
             <p className="text-muted-foreground max-w-sm">No active institutional nodes were detected for your profile. Select a challenge to begin your verification.</p>
             <Button size="lg" className="h-14 px-12 font-bold text-lg cyan-box-glow rounded-2xl" asChild>
                <Link href="/challenges">Start Challenge <ChevronRight className="ml-2 w-5 h-5" /></Link>
             </Button>
          </div>
        )}
      </main>
    </div>
  );
}
