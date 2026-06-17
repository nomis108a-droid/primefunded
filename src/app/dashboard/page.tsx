
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
  Download
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

/**
 * Institutional temporal helper: Boundary at 7:30 AM IST (2:00 AM UTC)
 */
const getTradingDayKey = (date: Date) => {
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(date.getTime() + istOffset);
  const hours = istTime.getUTCHours();
  const minutes = istTime.getUTCMinutes();
  if (hours < 7 || (hours === 7 && minutes < 30)) {
    istTime.setUTCDate(istTime.getUTCDate() - 1);
  }
  return istTime.toISOString().split('T')[0];
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
  const { user, userData: contextUserData, loading: authLoading } = useAuth();
  const db = useFirestore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isDebug = searchParams.get('debug') === 'true';
  
  const effectiveUid = adminViewMode && targetUid ? targetUid : user?.uid;
  const [chartPeriod, setChartPeriod] = useState('7D');
  const { toast } = useToast();

  const [adminTargetData, setAdminTargetData] = useState<any>(null);
  
  useEffect(() => {
    if (adminViewMode && targetUid && db) {
      const unsub = onSnapshot(doc(db, 'users', targetUid), (snap) => {
        if (snap.exists()) setAdminTargetData(snap.data());
      });
      return () => unsub();
    }
  }, [adminViewMode, targetUid, db]);

  const userData = adminViewMode ? adminTargetData : contextUserData;
  const isBreached = userData?.accountStatus === 'breached';

  const metrics = useMemo(() => {
    const parseSize = (sizeStr: string) => {
      if (!sizeStr) return 0;
      return parseFloat(sizeStr.replace(/[$,]/g, '').replace(/k/i, '000')) || 0;
    };

    const staticBalance = userData?.accountBalance || parseSize(userData?.accountSize);
    const liveBalance = userData?.liveBalance !== undefined ? userData.liveBalance : staticBalance;
    const liveEquity = userData?.liveEquity !== undefined ? userData.liveEquity : liveBalance;
    
    return {
      balance: liveBalance,
      equity: liveEquity,
    };
  }, [userData]);

  const connectivityStatus = useMemo(() => {
    if (isBreached) return 'terminated';
    if (!userData?.lastMT5Update) return 'awaiting';
    
    try {
      const lastUpdate = userData.lastMT5Update?.seconds 
        ? new Date(userData.lastMT5Update.seconds * 1000) 
        : userData.lastMT5Update?.toDate?.() || new Date(userData.lastMT5Update);

      if (!isValid(lastUpdate)) return 'offline';

      const diffSeconds = Math.abs(Date.now() - lastUpdate.getTime()) / 1000;
      return diffSeconds < 65 ? 'live' : 'offline';
    } catch (e) {
      return 'offline';
    }
  }, [userData?.lastMT5Update, isBreached]);

  const performanceConstraints = useMemo(() => [
    orderBy('date', 'asc'),
    limit(31)
  ], []);

  const { data: performanceData, loading: perfLoading } = useCollection<any>(
    effectiveUid ? `users/${effectiveUid}/performance` : null,
    performanceConstraints
  );

  const filteredPerfData = useMemo(() => {
    if (!performanceData) return [];
    
    const now = new Date();
    let daysToKeep = 7;
    if (chartPeriod === '14D') daysToKeep = 14;
    if (chartPeriod === '1M') daysToKeep = 30;

    const dataMap = new Map();
    performanceData.forEach(d => dataMap.set(d.date, d));

    const sortedData = [...performanceData].sort((a, b) => a.date.localeCompare(b.date));

    const result = [];
    for (let i = daysToKeep - 1; i >= 0; i--) {
      const date = subDays(now, i);
      const key = getTradingDayKey(date);
      const todayDoc = dataMap.get(key);
      
      let dailyPnl = 0;
      if (todayDoc) {
        const prevDoc = sortedData.filter(d => d.date < key).pop();
        const todayCum = todayDoc.cumulativePnL || 0;
        const prevCum = prevDoc ? (prevDoc.cumulativePnL || 0) : 0;
        dailyPnl = todayCum - prevCum;
      }

      result.push({
        date: key,
        displayDate: format(date, daysToKeep <= 7 ? 'EEE' : 'MMM d'),
        amount: parseFloat(dailyPnl.toFixed(2))
      });
    }
    return result;
  }, [performanceData, chartPeriod]);

  const tradeConstraints = useMemo(() => [
    orderBy('date', 'desc'),
    limit(200)
  ], []);

  const { data: recentTrades, loading: tradesLoading } = useCollection<any>(
    effectiveUid ? `users/${effectiveUid}/trades` : null,
    tradeConstraints
  );

  const tradingDaysData = useMemo(() => {
    if (!recentTrades) return { count: 0, required: 5, progress: 0 };
    
    const days = new Set<string>();
    recentTrades.forEach(trade => {
      const date = getTradeDate(trade.time || trade.date);
      if (date && isValid(date)) {
        days.add(getTradingDayKey(date));
      }
    });

    const count = days.size;
    const plan = userData?.accountPlan?.toLowerCase() || '';
    const phase = userData?.currentPhase || 'evaluation';
    
    let required = 5;
    if (plan.includes('3-step')) {
      if (phase === 'phase1') required = 7;
      else if (phase === 'phase2') required = 6;
      else required = 5;
    } else if (plan.includes('instant')) {
      required = 1;
    }

    return {
      count,
      required,
      progress: Math.min((count / required) * 100, 100)
    };
  }, [recentTrades, userData]);

  const accountAgeData = useMemo(() => {
    const start = userData?.activatedAt?.toDate?.() || 
                  userData?.activatedAt || 
                  userData?.giftedAt || 
                  userData?.createdAt?.toDate?.() || 
                  userData?.createdAt;
    
    if (!start) return { days: 0, date: 'N/A' };
    const startDate = new Date(start);
    if (!isValid(startDate)) return { days: 0, date: 'N/A' };
    
    const diffDays = Math.max(0, differenceInDays(new Date(), startDate));
    return { 
      days: diffDays, 
      date: format(startDate, 'MMM d, yyyy') 
    };
  }, [userData]);

  const enrichedTrades = useMemo(() => {
    return enrichTrades(recentTrades, userData?.mt5Login || 'N/A');
  }, [recentTrades, userData?.mt5Login]);

  const tradeStats = useMemo(() => {
    if (!recentTrades || recentTrades.length === 0) return null;
    
    const closedTrades = recentTrades.filter(t => (t.pnl || t.profit || 0) !== 0);
    const winCount = closedTrades.filter(t => (t.pnl || t.profit || 0) > 0).length;
    const lossCount = closedTrades.filter(t => (t.pnl || t.profit || 0) < 0).length;
    const winRate = closedTrades.length > 0 ? (winCount / closedTrades.length) * 100 : 0;
    
    const totalProfit = closedTrades.reduce((acc, t) => acc + Math.max(0, t.pnl || t.profit || 0), 0);
    const totalLoss = closedTrades.reduce((acc, t) => acc + Math.abs(Math.min(0, t.pnl || t.profit || 0)), 0);
    
    const profits = closedTrades.map(t => t.pnl || t.profit || 0);
    const largestWin = Math.max(0, ...profits);
    const largestLoss = Math.min(0, ...profits);
    
    return {
      totalTrades: closedTrades.length,
      winRate,
      totalProfit,
      totalLoss,
      largestWin,
      largestLoss,
      winCount,
      lossCount
    };
  }, [recentTrades]);

  const dailyRiskMetrics = useMemo(() => {
    const initialBalance = userData?.accountBalance || 100000;
    const dailyClosedLosses = userData?.dailyClosedLosses || 0;
    
    const currentFloatingPnL = metrics.equity - metrics.balance;
    const currentFloatingLoss = currentFloatingPnL < 0 ? Math.abs(currentFloatingPnL) : 0;
    
    const totalDailyLoss = dailyClosedLosses + currentFloatingLoss;
    
    const getLimit = () => {
      const plan = userData?.accountPlan?.toLowerCase() || '';
      if (plan.includes('1-step')) return 3;
      if (plan.includes('2-step')) return 5;
      if (plan.includes('3-step')) return 4;
      if (plan.includes('instant')) return 3;
      return 3;
    };

    const limitPct = getLimit();
    const limitAmount = initialBalance * (limitPct / 100);
    
    const drawdownPct = initialBalance > 0 ? (totalDailyLoss / initialBalance) * 100 : 0;
    const usage = Math.min((totalDailyLoss / limitAmount) * 100, 100);

    const dailyStart = userData?.dailyStartBalance || metrics.balance;
    const pnl = metrics.balance - dailyStart;
    const pnlPct = dailyStart > 0 ? (pnl / dailyStart) * 100 : 0;

    return { 
      pnl, 
      pnlPct, 
      usage, 
      limit: limitPct, 
      limitAmount, 
      totalDailyLoss, 
      drawdownPct, 
      isPositive: pnl >= 0 
    };
  }, [userData, metrics]);

  const currentPhaseDisplay = useMemo(() => {
    const phase = userData?.currentPhase || 'evaluation';
    if (phase === 'funded') return { label: 'Funded Stage', icon: <Trophy className="w-3 h-3" />, className: 'bg-amber-500/10 text-amber-500 border-amber-500/20' };
    if (phase === 'phase1') return { label: 'Phase 1: Evaluation', icon: <Zap className="w-3 h-3" />, className: 'bg-primary/10 text-primary border-primary/20' };
    if (phase === 'phase2') return { label: 'Phase 2: Verification', icon: <Zap className="w-3 h-3" />, className: 'bg-primary/10 text-primary border-primary/20' };
    if (phase === 'phase3') return { label: 'Phase 3: Final Stage', icon: <Zap className="w-3 h-3" />, className: 'bg-primary/10 text-primary border-primary/20' };
    return { label: 'Evaluation Phase', icon: <Zap className="w-3 h-3" />, className: 'bg-primary/10 text-primary border-primary/20' };
  }, [userData?.currentPhase]);

  if (authLoading && !adminViewMode) return null;

  return (
    <div className="flex min-h-screen bg-background">
      {!adminViewMode && <Navigation />}
      
      <main className="flex-1 p-8 overflow-y-auto custom-scrollbar">
        {isDebug && (
          <div className="mb-8 p-4 rounded-xl bg-black border border-primary/50 font-mono text-[10px] text-primary space-y-1 shadow-2xl">
            <p className="font-bold border-b border-primary/20 pb-1 mb-2 uppercase flex items-center justify-between">
              Terminal Debug Protocol <span>[ACTIVE]</span>
            </p>
            <p>UID: {effectiveUid}</p>
            <p>Live Balance: {metrics.balance}</p>
            <p>Live Equity: {metrics.equity}</p>
            <p>Realized Session Loss: {userData?.dailyClosedLosses || 0}</p>
            <p>Daily Start (Baseline): {userData?.dailyStartBalance || 'N/A'}</p>
          </div>
        )}

        {isBreached && (
          <div className="mb-8 p-6 rounded-2xl bg-destructive/20 border border-destructive/40 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-destructive flex items-center justify-center text-white shrink-0">
                <Skull className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-headline font-bold text-white uppercase tracking-tight">Account Liquidated</h3>
                <p className="text-sm text-destructive-foreground">This account has been terminated due to a hard rule breach: <span className="font-bold text-white">{userData?.breachReason || 'Rule Violation'}</span>.</p>
              </div>
            </div>
            {!adminViewMode && (
              <Button size="lg" className="bg-destructive hover:bg-destructive/90 font-bold whitespace-nowrap px-8 h-12 rounded-xl" asChild>
                <Link href="/challenges">Start New Challenge <ArrowRight className="ml-2 w-4 h-4" /></Link>
              </Button>
            )}
          </div>
        )}

        <header className="flex justify-between items-start mb-10">
          <div>
            <h1 className="text-3xl font-headline font-bold mb-1 text-white">
              {adminViewMode ? `Previewing: ${userData?.name || 'Trader'}` : "Trader Terminal"}
            </h1>
            <p className="text-muted-foreground">
              {adminViewMode ? `UID: ${effectiveUid}` : `Welcome back, ${userData?.name || 'Trader'}.`}
            </p>
          </div>
          <div className="flex items-center gap-4">
            {!adminViewMode && <NotificationBell />}
            <Badge variant="outline" className={cn(
              "h-9 px-4 uppercase font-bold tracking-widest border-white/10",
              connectivityStatus === 'terminated' && "border-destructive/30 text-destructive",
              connectivityStatus === 'offline' && "border-destructive/30 text-destructive",
              connectivityStatus === 'live' && "border-accent/30 text-accent"
            )}>
              <div className={cn(
                "w-2 h-2 rounded-full mr-2", 
                connectivityStatus === 'live' ? 'bg-accent live-indicator' : 
                connectivityStatus === 'offline' || connectivityStatus === 'terminated' ? 'bg-destructive' : 'bg-muted'
              )} />
              {connectivityStatus === 'live' ? 'Live Sync' : 
               connectivityStatus === 'offline' ? 'EA Offline' : 
               connectivityStatus === 'terminated' ? 'Terminated' : 'Awaiting Sync'}
            </Badge>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
          <MetricCard 
            title="Account Balance" 
            value={`$${metrics.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} 
            icon={<Wallet className="text-primary" />} 
            disabled={isBreached} 
          />
          <MetricCard 
            title="Equity" 
            value={`$${metrics.equity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} 
            icon={<Activity className="text-accent" />} 
            disabled={isBreached} 
          />
          <MetricCard 
            title="Minimum Trading Days" 
            value={`${tradingDaysData.count} / ${tradingDaysData.required} days`} 
            icon={<Calendar className="text-emerald-500" />} 
            progress={tradingDaysData.progress}
            progressLabel={`${tradingDaysData.progress.toFixed(0)}% Completed`}
          />
          <MetricCard 
            title="Account Age" 
            value={`${accountAgeData.days} Days`} 
            icon={<Clock className="text-amber-500" />} 
            footer={`Trading since ${accountAgeData.date}`}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <Card className={cn("border-border/50 bg-card/40 transition-opacity", isBreached && "opacity-40 grayscale")}>
            <CardContent className="p-6">
              <div className="flex justify-between mb-4">
                <span className="text-[10px] font-black uppercase text-muted-foreground">Daily P&L</span>
                {dailyRiskMetrics.isPositive ? <TrendingUp className="text-emerald-500 w-4 h-4" /> : <TrendingDown className="text-destructive w-4 h-4" />}
              </div>
              <p className={cn("text-3xl font-bold font-headline", dailyRiskMetrics.isPositive ? 'text-emerald-500' : 'text-destructive')}>
                {dailyRiskMetrics.isPositive ? '+' : ''}${dailyRiskMetrics.pnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-[10px] font-bold text-muted-foreground uppercase mt-1">
                {dailyRiskMetrics.pnlPct.toFixed(2)}% of session start 
              </p>
            </CardContent>
          </Card>

          <Card className={cn("border-border/50 bg-card/40 transition-opacity", isBreached && "opacity-40 grayscale")}>
            <CardContent className="p-6">
              <div className="flex justify-between mb-4">
                <span className="text-[10px] font-black uppercase text-muted-foreground">Daily Drawdown (Gross Loss)</span>
                <span className="text-[10px] font-bold text-muted-foreground">Threshold: ${dailyRiskMetrics.limitAmount.toLocaleString()}</span>
              </div>
              <p className="text-3xl font-bold font-headline text-white">${dailyRiskMetrics.totalDailyLoss.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              <div className="mt-4 space-y-1.5">
                <Progress value={dailyRiskMetrics.usage} className="h-1.5" />
                <p className={cn("text-[9px] font-black uppercase", dailyRiskMetrics.usage > 80 ? 'text-destructive' : 'text-primary')}>
                  ${dailyRiskMetrics.totalDailyLoss.toFixed(2)} of ${dailyRiskMetrics.limitAmount.toFixed(2)} limit used
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
           <StatMiniCard title="Total Trades" value={tradeStats?.totalTrades || 0} icon={<PieChart className="w-3 h-3" />} />
           <StatMiniCard title="Win Rate" value={`${tradeStats?.winRate.toFixed(1) || 0}%`} icon={<TrendingUp className="w-3 h-3" />} color="emerald" />
           <StatMiniCard title="Total Profit" value={`$${tradeStats?.totalProfit.toLocaleString() || 0}`} icon={<ArrowUpRight className="w-3 h-3" />} color="emerald" />
           <StatMiniCard title="Total Loss" value={`$${tradeStats?.totalLoss.toLocaleString() || 0}`} icon={<ArrowDownRight className="w-3 h-3" />} color="destructive" />
           <StatMiniCard title="Largest Win" value={`$${tradeStats?.largestWin.toLocaleString() || 0}`} icon={<TrendingUp className="w-3 h-3" />} color="emerald" />
           <StatMiniCard title="Largest Loss" value={`$${tradeStats?.largestLoss.toLocaleString() || 0}`} icon={<TrendingDown className="w-3 h-3" />} color="destructive" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
          <div className="lg:col-span-2">
            <Card className={cn("border-border/50 bg-card/40", isBreached && "opacity-40 grayscale")}>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-xl font-headline text-white flex items-center gap-2"><BarChart3 className="w-5 h-5 text-primary" /> Performance</CardTitle>
                <Tabs value={chartPeriod} onValueChange={setChartPeriod}>
                  <TabsList className="bg-secondary/50">
                    <TabsTrigger value="7D" className="text-[10px] font-bold">7D</TabsTrigger>
                    <TabsTrigger value="14D" className="text-[10px] font-bold">14D</TabsTrigger>
                    <TabsTrigger value="1M" className="text-[10px] font-bold">1M</TabsTrigger>
                  </TabsList>
                </Tabs>
              </CardHeader>
              <CardContent className="h-[300px] w-full pt-4">
                {isBreached ? (
                  <div className="h-full flex items-center justify-center text-muted-foreground italic text-sm">No data visible for liquidated accounts.</div>
                ) : perfLoading ? (
                  <div className="h-full flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
                ) : filteredPerfData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={filteredPerfData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                      <XAxis dataKey="displayDate" stroke="#ffffff40" fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis stroke="#ffffff40" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(value) => `$${value}`} />
                      <ChartTooltip 
                        cursor={{ fill: '#ffffff05' }}
                        contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)' }} 
                        itemStyle={{ fontSize: '12px', fontWeight: 'bold', color: '#f8fafc' }} 
                        labelStyle={{ color: '#94a3b8', fontSize: '10px', marginBottom: '4px', textTransform: 'uppercase', fontWeight: '900' }} 
                        formatter={(value: number) => [`$${value.toLocaleString()}`, 'Daily P&L']}
                      />
                      <ReferenceLine y={0} stroke="#ffffff10" />
                      <Bar dataKey="amount" radius={[4, 4, 0, 0]} animationDuration={1000}>
                        {filteredPerfData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.amount >= 0 ? '#10b981' : '#ef4444'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground italic text-sm">Waiting for institutional performance data...</div>
                )}
              </CardContent>
            </Card>
          </div>
          
          <div className="space-y-6">
            <Card className={cn("border-primary/20 bg-primary/5", isBreached && "border-destructive/20 bg-destructive/5 grayscale")}>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2 text-white">
                  {isBreached ? <Skull className="w-5 h-5 text-destructive" /> : <ShieldCheck className="w-5 h-5 text-primary" />}
                  My Account
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-xl bg-background/50 border border-white/5">
                   <div className="space-y-1">
                      <p className="text-[9px] font-black text-muted-foreground uppercase">Current Phase</p>
                      <Badge className={cn("gap-1.5 py-1 px-3", isBreached ? "bg-destructive/10 text-destructive border-destructive/20" : currentPhaseDisplay.className)}>
                        {isBreached ? <Skull className="w-3 h-3" /> : currentPhaseDisplay.icon}
                        {isBreached ? 'Breached' : currentPhaseDisplay.label}
                      </Badge>
                   </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1"><p className="text-[9px] font-black text-muted-foreground uppercase">Plan</p><p className="text-xs font-bold text-white">{userData?.accountPlan || 'None'}</p></div>
                  <div className="space-y-1"><p className="text-[9px] font-black text-muted-foreground uppercase">Size</p><p className="text-xs font-bold text-white">{userData?.accountSize || 'N/A'}</p></div>
                  <div className="space-y-1"><p className="text-[9px] font-black text-muted-foreground uppercase">MT5 Login</p><p className="text-xs font-bold text-white font-mono">{userData?.mt5Login || 'PENDING'}</p></div>
                  <div className="space-y-1"><p className="text-[9px] font-black text-muted-foreground uppercase">Status</p><p className="text-xs font-bold text-white uppercase">{userData?.accountStatus || 'INACTIVE'}</p></div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <Card className={cn("border-border/50 bg-card/40 backdrop-blur-sm", isBreached && "opacity-40 grayscale")}>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-xl font-headline text-white flex items-center gap-2">
              <History className="w-5 h-5 text-primary" /> Position Journal
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-black tracking-widest">
                  <tr>
                    <th className="py-4 px-6">Symbol</th>
                    <th className="py-4 px-4">Account</th>
                    <th className="py-4 px-4">Type</th>
                    <th className="py-4 px-4">Time</th>
                    <th className="py-4 px-4">Duration</th>
                    <th className="py-4 px-4 text-right">Lots</th>
                    <th className="py-4 px-6 text-right">P&L</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {tradesLoading ? (
                    [...Array(3)].map((_, i) => (
                      <tr key={i} className="animate-pulse"><td colSpan={7} className="py-6 px-6"><div className="h-4 bg-secondary/50 rounded w-full" /></td></tr>
                    ))
                  ) : enrichedTrades.length > 0 ? (
                    enrichedTrades.slice(0, 30).map((trade: any) => (
                      <tr key={trade.id} className="hover:bg-primary/5 transition-colors">
                        <td className="py-4 px-6 font-bold text-white">{trade.symbol || 'N/A'}</td>
                        <td className="py-4 px-4 font-mono text-[10px] text-muted-foreground">{trade.login}</td>
                        <td className="py-4 px-4">
                          <Badge variant="outline" className={cn(
                            "text-[9px] font-black uppercase px-2",
                            trade.type?.toLowerCase() === 'buy' ? 'border-emerald-500/30 text-emerald-500 bg-emerald-500/5' : 'border-destructive/30 text-destructive bg-destructive/5'
                          )}>{trade.type || 'N/A'}</Badge>
                        </td>
                        <td className="py-4 px-4 text-xs text-muted-foreground font-mono">{trade.closeTime ? format(getTradeDate(trade.closeTime)!, 'MMM d, HH:mm') : 'N/A'}</td>
                        <td className="py-4 px-4 text-xs text-muted-foreground flex items-center gap-1.5 pt-5"><Clock className="w-3 h-3" />{trade.duration}</td>
                        <td className="py-4 px-4 text-right text-white font-mono">{trade.lots || '0.00'}</td>
                        <td className={cn("py-4 px-6 text-right font-bold tabular-nums", (trade.pnl || 0) >= 0 ? 'text-emerald-500' : 'text-destructive')}>
                          {(trade.pnl || 0) >= 0 ? '+' : ''}${(trade.pnl || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr><td colSpan={7} className="py-20 text-center text-muted-foreground italic text-sm">No trades recorded yet. MT5 executions will appear here live.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function StatMiniCard({ title, value, icon, color = 'primary' }: { title: string, value: string | number, icon: React.ReactNode, color?: string }) {
  const colors: any = {
    primary: 'text-primary bg-primary/10 border-primary/20',
    emerald: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
    destructive: 'text-destructive bg-destructive/10 border-destructive/20',
  };
  return (
    <Card className="bg-secondary/30 border-border/50">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">{title}</p>
          <div className={cn("p-1 rounded", colors[color])}>{icon}</div>
        </div>
        <p className="text-sm font-bold text-white font-mono">{value}</p>
      </CardContent>
    </Card>
  );
}
