
'use client';

import { useEffect, useState, useCallback, useRef, memo } from 'react';
import { Navigation } from '@/components/Navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Activity, 
  AlertTriangle, 
  Database, 
  XCircle,
  Zap,
  Fingerprint,
  RefreshCw,
  Clock,
  ShieldCheck,
  Server
} from 'lucide-react';
import { db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { createChart, ColorType, IChartApi, ISeriesApi } from 'lightweight-charts';

/**
 * @fileOverview Institutional Price Monitor (Heartbeat Dashboard)
 * Monitors server-side automated price sync jobs.
 * This page is now a monitoring tool only; liquidity is synced by the server.
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
    try {
      const chart = createChart(chartContainerRef.current, {
        layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#71717a', fontSize: 10 },
        grid: { vertLines: { visible: false }, horzLines: { visible: false } },
        width: 180,
        height: 60,
        handleScroll: false,
        handleScale: false,
        timeScale: { visible: false },
        rightPriceScale: { 
          visible: false,
          autoScale: true 
        },
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
    } catch (e) {}
    return () => { chartRef.current?.remove(); };
  }, []);

  useEffect(() => {
    if (data?.price && seriesRef.current) {
      const now = Math.floor(Date.now() / 1000);
      
      // Update history buffer
      const newPoint = { time: now, value: data.price };
      
      // Ensure we don't have duplicate timestamps which crashes the chart
      const lastPoint = historyRef.current[historyRef.current.length - 1];
      if (lastPoint && lastPoint.time === now) {
        historyRef.current[historyRef.current.length - 1] = newPoint;
      } else {
        historyRef.current.push(newPoint);
      }

      // Limit to 50 points
      if (historyRef.current.length > 50) {
        historyRef.current = historyRef.current.slice(-50);
      }

      // Update series
      seriesRef.current.setData(historyRef.current);
      chartRef.current?.timeScale().fitContent();
    }
  }, [data]);

  const priceFormatted = data?.price ? data.price.toLocaleString(undefined, { 
    minimumFractionDigits: symbol.includes('JPY') ? 3 : (symbol.includes('USD') && !['BTCUSD', 'ETHUSD', 'BNBUSD'].includes(symbol) ? 5 : 2) 
  }) : '---';

  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between items-end mb-1">
        <span className="font-bold text-white text-xs">{symbol}</span>
        <span className="font-mono text-[10px] text-primary tabular-nums">
          {priceFormatted}
        </span>
      </div>
      <div ref={chartContainerRef} className="h-[60px] w-full" />
    </div>
  );
});

MiniChart.displayName = 'MiniChart';

export default function AdminPriceTracker() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [prices, setPrices] = useState<Record<string, any>>({});
  const [lastSync, setLastSync] = useState<Date | null>(null);

  useEffect(() => {
    const isVerified = localStorage.getItem('adminVerified') === 'true';
    setIsAuthenticated(isVerified);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;

    // Listen to all symbols in real-time from Firestore (Synced by server)
    const unsubs = SYMBOLS.map(sym => {
      return onSnapshot(doc(db, 'livePrices', sym), (doc) => {
        if (doc.exists()) {
          const data = doc.data();
          setPrices(prev => ({ ...prev, [sym]: data }));
          if (data.updatedAt) {
            setLastSync(data.updatedAt.toDate());
          }
        }
      });
    });

    return () => unsubs.forEach(u => u());
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <Fingerprint className="w-12 h-12 text-primary/40 mb-4" />
        <h2 className="text-xl font-headline font-bold text-white mb-2">Restricted Access</h2>
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
              <h1 className="text-3xl font-headline font-bold text-white uppercase tracking-tight">System Heartbeat</h1>
            </div>
            <Badge variant="outline" className="text-[10px] font-black uppercase tracking-widest border-primary/30 text-primary">
              Institutional Monitoring Node
            </Badge>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden md:block">
              <p className="text-[10px] font-black uppercase text-emerald-500 flex items-center gap-2">
                <Server className="w-3 h-3" /> Server-Side Sync Active
              </p>
              <p className="text-[8px] text-zinc-500 uppercase font-bold tracking-widest">Autonomous operation enabled</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => window.location.reload()} className="h-9 px-4 rounded-xl">
              <RefreshCw className="w-4 h-4 mr-2" /> Refresh State
            </Button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-12">
          <Card className="lg:col-span-2 relative overflow-hidden bg-emerald-500/5 border-emerald-500/20">
             <div className="p-6 flex items-start gap-4">
                <ShieldCheck className="w-8 h-8 shrink-0 text-emerald-500" />
                <div>
                   <h3 className="font-black text-sm uppercase tracking-tight mb-1 text-emerald-500">
                     Autonomous Liquidity Engine
                   </h3>
                   <p className="text-zinc-300 text-xs leading-relaxed font-medium">
                     Market data is automatically synchronized by the server-side cron engine every minute. You do not need to keep this tab open to maintain trading operations.
                   </p>
                </div>
             </div>
          </Card>

          <Card className="bg-card/40 border-border/50">
            <div className="p-6 flex flex-col justify-center items-center h-full">
               <p className="text-[10px] font-black text-zinc-500 uppercase mb-1">Network Status</p>
               <div className="flex items-center gap-2">
                 <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse" />
                 <h4 className="text-lg font-bold text-white uppercase">Operational</h4>
               </div>
            </div>
          </Card>

          <Card className="bg-card/40 border-border/50">
            <div className="p-6 text-center flex flex-col justify-center items-center h-full">
               <p className="text-[10px] font-black text-zinc-500 uppercase mb-1">Last Server Tick</p>
               <h4 className="text-2xl font-headline font-bold text-white tabular-nums flex items-center gap-2">
                 <Clock className="w-4 h-4 text-primary" />
                 {lastSync ? format(lastSync, 'HH:mm:ss') : '--:--:--'}
               </h4>
            </div>
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
