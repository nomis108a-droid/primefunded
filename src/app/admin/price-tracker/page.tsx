
'use client';

import { useEffect, useState, memo, useRef } from 'react';
import { Navigation } from '@/components/Navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Zap,
  RefreshCw,
  ShieldCheck,
  Fingerprint,
  Activity,
  Target,
  BarChart3,
  Clock,
  HeartPulse
} from 'lucide-react';
import { rtdb } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { createChart, ColorType, CrosshairMode, IChartApi, ISeriesApi, PriceScaleMode } from 'lightweight-charts';

const SYMBOLS = [
  "XAUUSD", "XAGUSD", "BTCUSD", "ETHUSD", "EURUSD", "GBPUSD", "USDJPY", "USDCHF", "USDCAD", "NZDUSD", "AUDUSD", "XPTUSD"
];

const MiniChart = memo(({ history }: { history: number[] }) => {
  if (!history || history.length < 2) return <div className="h-[40px] w-full border-b border-zinc-800" />;
  const min = Math.min(...history);
  const max = Math.max(...history);
  const range = (max - min) || (min * 0.0001);
  const h = 40;
  const w = 200;
  const pts = history.map((val, i) => `${(i / (history.length - 1)) * w},${h - ((val - min) / range) * h}`).join(' ');
  return (
    <div className="h-[40px] w-full mt-2">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-full overflow-visible" preserveAspectRatio="none">
        <polyline fill="none" stroke="#11b3f5" strokeWidth="1.5" points={pts} className="drop-shadow-[0_0_5px_rgba(17,179,245,0.4)]" />
      </svg>
    </div>
  );
});

MiniChart.displayName = 'MiniChart';

export default function AdminPriceTracker() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [prices, setPrices] = useState<Record<string, any>>({});
  const [history, setHistory] = useState<Record<string, number[]>>({}); 
  const [selectedSymbol, setSelectedSymbol] = useState("XAUUSD");
  const [isSyncing, setIsSyncing] = useState(false);
  const { toast } = useToast();

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<any> | null>(null);

  useEffect(() => {
    const isVerified = localStorage.getItem('adminVerified') === 'true';
    setIsAuthenticated(isVerified);
  }, []);

  // 1. RTDB Global Listener
  useEffect(() => {
    if (!isAuthenticated || !rtdb) return;
    setIsSyncing(true);
    
    const pricesRef = ref(rtdb, 'livePrices');
    const unsub = onValue(pricesRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) return;

      const newPrices: Record<string, any> = {};
      setHistory(prev => {
        const next = { ...prev };
        Object.entries(data).forEach(([key, tick]: [string, any]) => {
          const sym = key.toUpperCase();
          if (SYMBOLS.includes(sym)) {
            newPrices[sym] = tick;
            if (tick.price) {
              const current = next[sym] || [];
              if (current[current.length - 1] !== tick.price) {
                next[sym] = [...current, tick.price].slice(-30);
              }
            }
          }
        });
        return next;
      });
      setPrices(prev => ({ ...prev, ...newPrices }));
      setIsSyncing(false);
    }, (err: any) => {
      toast({ variant: "destructive", title: "RTDB Sync Failure", description: err.message });
    });

    return () => unsub();
  }, [isAuthenticated, toast]);

  // 2. Main Chart Initialization
  useEffect(() => {
    if (!isAuthenticated || !chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: { background: { type: ColorType.Solid, color: '#09090b' }, textColor: '#71717a', fontSize: 11 },
      grid: { vertLines: { color: '#18181b' }, horzLines: { color: '#18181b' } },
      width: chartContainerRef.current.clientWidth,
      height: 400,
      timeScale: { borderColor: '#27272a', timeVisible: true },
      priceScale: { borderColor: '#27272a', mode: PriceScaleMode.Normal },
      crosshair: { mode: CrosshairMode.Normal },
    });

    const series = chart.addCandlestickSeries({
      upColor: '#10b981', downColor: '#ef4444', borderVisible: false, wickUpColor: '#10b981', wickDownColor: '#ef4444',
    });

    chartInstanceRef.current = chart;
    seriesRef.current = series;

    const handleResize = () => {
      if (chartContainerRef.current && chartInstanceRef.current) {
        chartInstanceRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [isAuthenticated]);

  // 3. Historical Data Fetch for Chart
  useEffect(() => {
    if (!seriesRef.current || !selectedSymbol) return;

    fetch(`/api/terminal/candles?symbol=${selectedSymbol}&interval=1min&limit=100`)
      .then(res => res.json())
      .then(data => {
        if (data.candles && seriesRef.current) {
          seriesRef.current.setData(data.candles);
          chartInstanceRef.current?.timeScale().fitContent();
        }
      });
  }, [selectedSymbol]);

  // 4. Live Update Active Chart
  useEffect(() => {
    const live = prices[selectedSymbol];
    if (live && seriesRef.current) {
      const lastCandleTime = Math.floor(Date.now() / 60000) * 60;
      seriesRef.current.update({
        time: lastCandleTime as any,
        open: live.price, // Simple approximation for admin view
        high: live.price,
        low: live.price,
        close: live.price
      });
    }
  }, [prices, selectedSymbol]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <Fingerprint className="w-12 h-12 text-primary/40 mb-4" />
        <h2 className="text-xl font-headline font-bold text-white mb-2">Access Denied</h2>
        <p className="text-muted-foreground mb-8">Administrative credentials required to access the monitor.</p>
        <Button asChild><Link href="/admin">Return to Hub</Link></Button>
      </div>
    );
  }

  const renderCard = (sym: string) => {
    const data = prices[sym];
    const hist = history[sym] || [];
    const isSelected = selectedSymbol === sym;
    const isForex = !['XAUUSD', 'BTCUSD', 'ETHUSD', 'SOLUSD', 'XAGUSD'].includes(sym);
    const precision = isForex ? 5 : 2;

    return (
      <Card 
        key={sym} 
        onClick={() => setSelectedSymbol(sym)}
        className={cn(
          "bg-zinc-900/40 border-zinc-800/60 p-5 hover:border-primary/40 transition-all group relative overflow-hidden cursor-pointer",
          isSelected && "border-primary/60 bg-primary/5 ring-1 ring-primary/20"
        )}
      >
        <div className="flex flex-col gap-3">
          <div className="flex justify-between items-start">
            <div className="space-y-0.5">
              <span className="font-headline font-black text-lg text-white group-hover:text-primary transition-colors">{sym}</span>
              <p className="text-[8px] font-black uppercase text-zinc-500 tracking-widest">Live Execution</p>
            </div>
            <div className="text-right">
              <span className="font-mono text-base font-black text-primary drop-shadow-[0_0_8px_rgba(17,179,245,0.3)]">
                {data?.price ? data.price.toLocaleString(undefined, { minimumFractionDigits: precision }) : '---'}
              </span>
            </div>
          </div>

          <MiniChart history={hist} />

          <div className="grid grid-cols-2 gap-4 pt-3 border-t border-white/5">
            <div>
              <p className="text-[8px] text-zinc-600 font-black uppercase tracking-widest">Bid</p>
              <p className="text-[11px] font-mono font-bold text-zinc-400 tabular-nums">{data?.bid?.toLocaleString(undefined, { minimumFractionDigits: precision }) || '---'}</p>
            </div>
            <div className="text-right">
              <p className="text-[8px] text-zinc-600 font-black uppercase tracking-widest">Ask</p>
              <p className="text-[11px] font-mono font-bold text-zinc-400 tabular-nums">{data?.ask?.toLocaleString(undefined, { minimumFractionDigits: precision }) || '---'}</p>
            </div>
          </div>
        </div>
      </Card>
    );
  };

  return (
    <div className="flex min-h-screen bg-[#0a0a0a]">
      <Navigation />
      <main className="flex-1 p-8 overflow-y-auto custom-scrollbar">
        <header className="mb-10 flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-[0_0_20px_rgba(17,179,245,0.2)]">
                <HeartPulse size={22} className="fill-current" />
              </div>
              <h1 className="text-4xl font-headline font-bold text-white tracking-tighter uppercase italic">SYSTEM HEARTBEAT</h1>
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-[11px] font-black uppercase tracking-[0.3em] text-primary/80">Institutional Liquidity Monitor</p>
              <div className="h-0.5 w-full bg-gradient-to-r from-primary/60 to-transparent rounded-full" />
            </div>
          </div>
          
          <div className="flex flex-col items-end gap-3">
            <div className="flex items-center gap-6">
              <div className="text-right">
                <p className="text-[10px] font-black uppercase text-zinc-500 tracking-widest mb-1">DATA FLOW</p>
                <p className="text-xs font-bold text-white flex items-center gap-2">
                  BACKGROUND SYNC: <span className="text-emerald-500">ACTIVE</span>
                </p>
              </div>
              <Badge variant="outline" className="h-10 px-6 bg-emerald-500/10 border-emerald-500/30 text-emerald-500 flex items-center gap-2 rounded-xl shadow-[0_0_15px_rgba(16,185,129,0.1)]">
                <ShieldCheck className="w-4 h-4" />
                <span className="text-[10px] font-black uppercase tracking-widest">SYSTEM STATUS: HEALTHY</span>
              </Badge>
            </div>
            <Button variant="outline" size="sm" onClick={() => window.location.reload()} className="h-10 px-6 rounded-xl font-black text-[10px] uppercase tracking-widest border-white/10 hover:bg-white/5">
              <RefreshCw className={cn("w-4 h-4 mr-2", isSyncing && "animate-spin")} /> Refresh UI
            </Button>
          </div>
        </header>

        {/* Top Symbols */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
          {SYMBOLS.slice(0, 4).map(renderCard)}
        </div>

        {/* Primary Chart Area */}
        <Card className="bg-zinc-950 border-zinc-800/80 mb-10 relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-1 bg-primary/40 shadow-[0_0_15px_rgba(17,179,245,0.2)]" />
          <div className="p-4 border-b border-zinc-900 flex justify-between items-center bg-zinc-900/20">
             <div className="flex items-center gap-3">
               <Activity className="w-4 h-4 text-primary" />
               <span className="font-headline font-black text-white uppercase tracking-wider">{selectedSymbol} <span className="text-zinc-600 font-bold ml-1 text-xs">Primary Execution Feed</span></span>
             </div>
             <div className="flex items-center gap-4">
                <div className="flex flex-col items-end">
                   <span className="text-[8px] font-black text-zinc-500 uppercase">Tick Capture</span>
                   <span className="text-[10px] font-mono font-bold text-primary">{(prices[selectedSymbol]?.updatedAt ? new Date(prices[selectedSymbol].updatedAt).toLocaleTimeString() : 'WAITING...')}</span>
                </div>
                <div className="h-8 w-px bg-zinc-800" />
                <Badge variant="secondary" className="bg-primary/10 text-primary uppercase font-black text-[9px] h-6 px-3">Real-Time Terminal</Badge>
             </div>
          </div>
          <div ref={chartContainerRef} className="w-full" />
        </Card>

        {/* Bottom Symbols */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-20">
          {SYMBOLS.slice(4).map(renderCard)}
        </div>
      </main>
    </div>
  );
}
