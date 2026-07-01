'use client';

import { useEffect, useState, useCallback, useRef, memo } from 'react';
import { Navigation } from '@/components/Navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Activity, 
  RefreshCw, 
  AlertTriangle, 
  Loader2, 
  Database, 
  CheckCircle2, 
  XCircle,
  Clock,
  ShieldCheck,
  Zap,
  TrendingUp,
  Fingerprint
} from 'lucide-react';
import { db } from '@/lib/firebase';
import { doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { createChart, ColorType, IChartApi, ISeriesApi } from 'lightweight-charts';

/**
 * @fileOverview Institutional Price Synchronizer (Market Heartbeat)
 * High-frequency synchronization node that pumps external liquidity into Firestore.
 */

const SYMBOLS = [
  "XAUUSD", "XAGUSD", "XPTUSD", "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCHF", "USDCAD", "NZDUSD",
  "BTCUSD", "ETHUSD", "SOLUSD", "XRPUSD", "BNBUSD", "DOGEUSD", "ADAUSD"
];

const MiniChart = memo(({ symbol, data }: { symbol: string, data: any }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const historyRef = useRef<{ time: number, value: number }[]>([]);

  useEffect(() => {
    if (!chartContainerRef.current) return;
    const chart = createChart(chartContainerRef.current, {
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#71717a', fontSize: 10 },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      width: 180,
      height: 60,
      handleScroll: false,
      handleScale: false,
      timeScale: { visible: false },
      rightPriceScale: { visible: false },
    });
    const series = chart.addAreaSeries({
      lineColor: '#11b3f5',
      topColor: 'rgba(17, 179, 245, 0.2)',
      bottomColor: 'rgba(17, 179, 245, 0.0)',
      lineWidth: 2,
      crosshairMarkerVisible: false,
      lastValueVisible: false,
      priceLineVisible: false,
    });
    chartRef.current = chart;
    seriesRef.current = series;
    return () => { chart.remove(); };
  }, []);

  useEffect(() => {
    if (data?.price && seriesRef.current) {
      const now = Math.floor(Date.now() / 1000);
      historyRef.current = [...historyRef.current, { time: now, value: data.price }].slice(-50);
      seriesRef.current.setData(historyRef.current);
      chartRef.current?.timeScale().fitContent();
    }
  }, [data]);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between items-end mb-1">
        <span className="font-bold text-white text-xs">{symbol}</span>
        <span className="font-mono text-[10px] text-primary tabular-nums">
          {data?.price?.toLocaleString(undefined, { minimumFractionDigits: symbol.includes('JPY') ? 3 : (symbol.includes('USD') && !['BTCUSD', 'ETHUSD'].includes(symbol) ? 5 : 2) })}
        </span>
      </div>
      <div ref={chartContainerRef} className="h-[60px] w-full" />
    </div>
  );
});

export default function AdminPriceTracker() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [prices, setPrices] = useState<Record<string, any>>({});
  const [isPumping, setIsPumping] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [status, setStatus] = useState({ oanda: 'idle', binance: 'idle' });
  const [errorCount, setErrorCount] = useState(0);

  useEffect(() => {
    const isVerified = localStorage.getItem('adminVerified') === 'true';
    setIsAuthenticated(isVerified);
    if (isVerified) setIsPumping(true);
  }, []);

  const pumpPrices = useCallback(async () => {
    try {
      const res = await fetch('/api/terminal/live-prices', { cache: 'no-store' });
      if (!res.ok) throw new Error('API Feed Offline');
      const data = await res.json();
      setPrices(data);
      setLastSync(new Date());

      const hasOanda = Object.keys(data).some(k => !['BTCUSD', 'ETHUSD', 'SOLUSD', 'XRPUSD', 'ADAUSD', 'DOGEUSD', 'BNBUSD'].includes(k));
      const hasCrypto = Object.keys(data).some(k => ['BTCUSD', 'ETHUSD', 'SOLUSD', 'XRPUSD', 'ADAUSD', 'DOGEUSD', 'BNBUSD'].includes(k));
      setStatus({ oanda: hasOanda ? 'online' : 'error', binance: hasCrypto ? 'online' : 'error' });

      if (Object.keys(data).length > 0) {
        const batch = writeBatch(db);
        Object.entries(data).forEach(([symbol, payload]) => {
          const ref = doc(db, 'livePrices', symbol);
          batch.set(ref, { ...(payload as any), symbol, updatedAt: serverTimestamp() }, { merge: true });
        });
        await batch.commit();
        setErrorCount(0);
      }
    } catch (err) {
      setErrorCount(prev => prev + 1);
      setStatus({ oanda: 'error', binance: 'error' });
    }
  }, []);

  useEffect(() => {
    if (!isPumping) return;
    pumpPrices();
    const interval = setInterval(pumpPrices, 2000);
    return () => clearInterval(interval);
  }, [isPumping, pumpPrices]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <Fingerprint className="w-12 h-12 text-primary/40 mb-4" />
        <h2 className="text-xl font-headline font-bold text-white mb-2">Restricted Access</h2>
        <p className="text-xs text-muted-foreground uppercase tracking-widest">Admin credentials required.</p>
        <Button className="mt-8 px-10 rounded-xl" asChild><a href="/admin">Go to Terminal</a></Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Navigation />
      <main className="flex-1 p-8 overflow-y-auto custom-scrollbar">
        <header className="mb-10 flex justify-between items-end">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Zap className="w-6 h-6 text-primary fill-primary" />
              <h1 className="text-3xl font-headline font-bold text-white uppercase tracking-tight">Price Synchronizer</h1>
            </div>
            <Badge variant="outline" className="text-[10px] font-black uppercase tracking-widest border-primary/30 text-primary">
              Institutional Market Heartbeat
            </Badge>
          </div>
          <div className="text-right">
             <p className="text-[10px] font-black text-zinc-500 uppercase mb-1">Status Control</p>
             <Button 
                onClick={() => setIsPumping(!isPumping)}
                variant={isPumping ? "destructive" : "default"}
                size="sm"
                className="font-bold rounded-lg h-9 px-6"
             >
               {isPumping ? <XCircle className="w-4 h-4 mr-2" /> : <Activity className="w-4 h-4 mr-2" />}
               {isPumping ? "STOP HEARTBEAT" : "START HEARTBEAT"}
             </Button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-12">
          <Card className="lg:col-span-2 bg-destructive/10 border-destructive/20 relative overflow-hidden">
             <CardContent className="p-6 flex items-start gap-4">
                <AlertTriangle className="text-destructive w-8 h-8 shrink-0" />
                <div>
                   <h3 className="text-destructive font-black text-sm uppercase tracking-tight mb-1">Critical Uptime Node</h3>
                   <p className="text-zinc-300 text-xs leading-relaxed font-medium">
                     Keep this tab open and active. This page is the primary source of truth for the entire platform. Closing this tab will freeze prices for all traders globally.
                   </p>
                </div>
             </CardContent>
          </Card>

          <Card className="bg-card/40 border-border/50">
            <CardContent className="p-6 flex justify-between items-center h-full">
              <div className="space-y-4 w-full">
                <FeedStatus label="OANDA FEED" status={status.oanda} />
                <FeedStatus label="BINANCE FEED" status={status.binance} />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/40 border-border/50">
            <CardContent className="p-6 text-center flex flex-col justify-center items-center h-full">
               <p className="text-[10px] font-black text-zinc-500 uppercase mb-1">Last Sync</p>
               <h4 className="text-2xl font-headline font-bold text-white">{lastSync ? format(lastSync, 'HH:mm:ss') : '--:--:--'}</h4>
               <p className={cn("text-[9px] font-bold mt-1", errorCount === 0 ? "text-emerald-500" : "text-destructive")}>
                 {errorCount === 0 ? "STABLE CONNECTION" : `${errorCount} RETRIES`}
               </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          {SYMBOLS.map(sym => (
            <Card key={sym} className="bg-card/30 border-border/50 p-4 hover:border-primary/30 transition-colors">
              <MiniChart symbol={sym} data={prices[sym]} />
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}

function FeedStatus({ label, status }: { label: string, status: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[9px] font-black text-zinc-500 tracking-widest">{label}</span>
      <div className="flex items-center gap-2">
        <div className={cn("w-2 h-2 rounded-full", status === 'online' ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-destructive animate-pulse")} />
        <span className={cn("text-[10px] font-bold", status === 'online' ? "text-white" : "text-destructive")}>
          {status === 'online' ? "ONLINE" : "OFFLINE"}
        </span>
      </div>
    </div>
  );
}
