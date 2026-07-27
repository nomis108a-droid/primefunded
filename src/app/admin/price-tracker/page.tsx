
'use client';

import { useEffect, useState, memo, useRef, useMemo } from 'react';
import { Navigation } from '@/components/Navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Zap,
  RefreshCw,
  ShieldCheck,
  Activity,
  HeartPulse,
  Maximize,
  Camera,
  Crosshair as CrosshairIcon,
  MousePointer2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Search,
  ChevronDown
} from 'lucide-react';
import { rtdb } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { createChart, ColorType, CrosshairMode, IChartApi, ISeriesApi, PriceScaleMode, LineStyle, IPriceLine } from 'lightweight-charts';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const SYMBOLS = [
  "XAUUSD", "XAGUSD", "XPTUSD", "EURUSD",
  "GBPUSD", "USDJPY", "AUDUSD", "USDCHF",
  "USDCAD", "NZDUSD", "BTCUSD", "ETHUSD",
  "SOLUSD", "XRPUSD", "BNBUSD", "DOGEUSD",
  "ADAUSD"
];

const TIMEFRAMES = ["1S", "5S", "15S", "30S", "1M", "3M", "5M", "15M", "30M", "1H", "4H", "1D", "1W", "1MO"];

const intervalMapping: Record<string, string> = {
  "1M": "1min", "5M": "5min", "15M": "15min", "30M": "30min",
  "1H": "1h", "4H": "4h", "1D": "1day", "1W": "1week", "1MO": "1month"
};

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
  const [selectedTimeframe, setSelectedTimeframe] = useState("1M");
  const [isSyncing, setIsSyncing] = useState(false);
  const [currentTime, setCurrentTime] = useState("");
  const { toast } = useToast();

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<any> | null>(null);
  const priceLineRef = useRef<IPriceLine | null>(null);
  const candleState = useRef<{ time: number, open: number, high: number, low: number, close: number } | null>(null);

  useEffect(() => {
    const isVerified = localStorage.getItem('adminVerified') === 'true';
    setIsAuthenticated(isVerified);
    
    const clockTimer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now.toISOString().split('T')[1].split('.')[0] + " UTC");
    }, 1000);
    
    return () => clearInterval(clockTimer);
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
      height: 600,
      timeScale: { borderColor: '#27272a', timeVisible: true, secondsVisible: true },
      priceScale: { borderColor: '#27272a', mode: PriceScaleMode.Normal, autoScale: true },
      crosshair: { mode: CrosshairMode.Normal },
    });

    const series = chart.addCandlestickSeries({
      upColor: '#10b981', downColor: '#ef4444', borderVisible: false, wickUpColor: '#10b981', wickDownColor: '#ef4444',
    });

    chartInstanceRef.current = chart;
    seriesRef.current = series;

    const handleResize = () => {
      if (chartContainerRef.current && chartInstanceRef.current) {
        chartInstanceRef.current.applyOptions({ 
          width: chartContainerRef.current.clientWidth,
          height: 600 
        });
      }
    };
    
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(chartContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, [isAuthenticated]);

  // 3. Historical Data Fetch
  useEffect(() => {
    if (!seriesRef.current || !selectedSymbol) return;
    
    candleState.current = null;
    const interval = intervalMapping[selectedTimeframe] || "1min";

    fetch(`/api/terminal/candles?symbol=${selectedSymbol}&interval=${interval}&limit=200`)
      .then(res => res.json())
      .then(data => {
        if (data.candles && seriesRef.current) {
          const sorted = data.candles.sort((a: any, b: any) => a.time - b.time);
          seriesRef.current.setData(sorted);
          
          const last = sorted[sorted.length - 1];
          if (last) {
            candleState.current = { ...last };
          }
          
          chartInstanceRef.current?.timeScale().fitContent();
        }
      });
  }, [selectedSymbol, selectedTimeframe]);

  // 4. Live Update active Chart and Price Line
  useEffect(() => {
    const live = prices[selectedSymbol];
    if (live && seriesRef.current && candleState.current) {
      const isSeconds = selectedTimeframe.endsWith('S');
      const intervalSec = isSeconds ? parseInt(selectedTimeframe) : (parseInt(selectedTimeframe) || 1) * 60;
      const nowSec = Math.floor(Date.now() / 1000);
      const bucketTime = Math.floor(nowSec / intervalSec) * intervalSec;
      
      const price = Number(live.price);

      if (bucketTime > candleState.current.time) {
        candleState.current = {
          time: bucketTime,
          open: price,
          high: price,
          low: price,
          close: price
        };
      } else {
        candleState.current.high = Math.max(candleState.current.high, price);
        candleState.current.low = Math.min(candleState.current.low, price);
        candleState.current.close = price;
      }

      seriesRef.current.update(candleState.current as any);

      // Update Price Line
      if (priceLineRef.current) {
        seriesRef.current.removePriceLine(priceLineRef.current);
      }
      priceLineRef.current = seriesRef.current.createPriceLine({
        price: price,
        color: '#11b3f5',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: 'LIVE',
      });
    }
  }, [prices, selectedSymbol, selectedTimeframe]);

  const handleZoom = (factor: number) => {
    const ts = chartInstanceRef.current?.timeScale();
    if (ts) {
      const currentSpacing = ts.options().barSpacing;
      ts.applyOptions({ barSpacing: currentSpacing * factor });
    }
  };

  const activeStats = useMemo(() => {
    const live = prices[selectedSymbol];
    if (!live) return { spread: "0.00", high: "---", low: "---", last: "---" };
    const spread = Math.abs(live.ask - live.bid);
    const hist = history[selectedSymbol] || [];
    const high = hist.length ? Math.max(...hist) : live.price;
    const low = hist.length ? Math.min(...hist) : live.price;
    return {
      spread: spread.toFixed(getPrecision(selectedSymbol)),
      high: high.toLocaleString(undefined, { minimumFractionDigits: getPrecision(selectedSymbol) }),
      low: low.toLocaleString(undefined, { minimumFractionDigits: getPrecision(selectedSymbol) }),
      last: live.price.toLocaleString(undefined, { minimumFractionDigits: getPrecision(selectedSymbol) })
    };
  }, [prices, selectedSymbol, history]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <HeartPulse className="w-12 h-12 text-primary/40 mb-4" />
        <h2 className="text-xl font-headline font-bold text-white mb-2">Access Denied</h2>
        <p className="text-muted-foreground mb-8">Administrative credentials required to access the monitor.</p>
        <Button asChild><Link href="/admin">Return to Hub</Link></Button>
      </div>
    );
  }

  function getPrecision(sym: string) {
    const isForex = !['XAUUSD', 'BTCUSD', 'ETHUSD', 'SOLUSD', 'XAGUSD', 'XPTUSD', 'XRPUSD', 'BNBUSD', 'DOGEUSD', 'ADAUSD'].includes(sym);
    if (isForex) return 5;
    if (sym === 'DOGEUSD') return 5;
    if (sym === 'XRPUSD' || sym === 'ADAUSD') return 4;
    return 2;
  }

  const renderCard = (sym: string) => {
    const data = prices[sym];
    const hist = history[sym] || [];
    const isSelected = selectedSymbol === sym;
    const precision = getPrecision(sym);

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

  const handleScreenshot = () => {
    if (chartInstanceRef.current) {
      const canvas = chartInstanceRef.current.takeScreenshot();
      const link = document.createElement('a');
      link.download = `primefunded-chart-${selectedSymbol}-${Date.now()}.png`;
      link.href = canvas.toDataURL();
      link.click();
    }
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
          {SYMBOLS.slice(0, 12).map(renderCard)}
        </div>

        {/* Real-Time Terminal Chart Section */}
        <div className="flex flex-col gap-4 mb-10">
          {/* Professional Toolbar Row */}
          <div className="flex flex-wrap items-center justify-between gap-4 bg-zinc-900/40 p-2 rounded-xl border border-zinc-800">
            <div className="flex items-center gap-3">
               <Select value={selectedSymbol} onValueChange={setSelectedSymbol}>
                 <SelectTrigger className="w-[140px] bg-zinc-900 border-zinc-700 h-9 font-black uppercase text-[10px] tracking-widest">
                   <SelectValue />
                 </SelectTrigger>
                 <SelectContent className="bg-zinc-900 border-zinc-700 text-white">
                   {SYMBOLS.map(s => <SelectItem key={s} value={s} className="text-[10px] font-black">{s}</SelectItem>)}
                 </SelectContent>
               </Select>
               
               <div className="h-6 w-px bg-zinc-800" />
               
               <div className="flex items-center gap-1 overflow-x-auto no-scrollbar max-w-[400px]">
                 {TIMEFRAMES.map(tf => (
                   <button
                    key={tf}
                    onClick={() => setSelectedTimeframe(tf)}
                    className={cn(
                      "px-2 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all whitespace-nowrap",
                      selectedTimeframe === tf ? "bg-primary text-black" : "text-zinc-500 hover:text-white"
                    )}
                   >
                     {tf}
                   </button>
                 ))}
               </div>
            </div>

            <div className="flex items-center gap-1.5">
               <ToolbarButton icon={<CrosshairIcon size={14} />} onClick={() => chartInstanceRef.current?.applyOptions({ crosshair: { mode: CrosshairMode.Normal } })} />
               <ToolbarButton icon={<MousePointer2 size={14} />} onClick={() => chartInstanceRef.current?.applyOptions({ crosshair: { mode: CrosshairMode.Magnet } })} />
               <div className="h-6 w-px bg-zinc-800 mx-1" />
               <ToolbarButton icon={<ZoomIn size={14} />} onClick={() => handleZoom(1.2)} />
               <ToolbarButton icon={<ZoomOut size={14} />} onClick={() => handleZoom(0.8)} />
               <ToolbarButton icon={<RotateCcw size={14} />} onClick={() => chartInstanceRef.current?.timeScale().resetTimeScale()} />
               <div className="h-6 w-px bg-zinc-800 mx-1" />
               <ToolbarButton icon={<Camera size={14} />} onClick={handleScreenshot} />
               <ToolbarButton icon={<Maximize size={14} />} onClick={() => chartContainerRef.current?.requestFullscreen()} />
            </div>
          </div>

          {/* Main Terminal Card */}
          <Card className="bg-zinc-950 border-zinc-800/80 relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-full h-1 bg-primary/40 shadow-[0_0_15px_rgba(17,179,245,0.2)]" />
            
            {/* Extended Trading Header */}
            <div className="p-4 border-b border-zinc-900 flex flex-wrap justify-between items-center bg-zinc-900/20 gap-6">
               <div className="flex flex-wrap items-center gap-8">
                 <div className="flex items-center gap-3">
                   <Activity className="w-4 h-4 text-primary" />
                   <span className="font-headline font-black text-white uppercase tracking-wider text-sm">{selectedSymbol}</span>
                   <Badge variant="outline" className="text-[8px] h-5 px-1.5 border-emerald-500/50 text-emerald-500 animate-pulse uppercase">LIVE</Badge>
                 </div>
                 
                 <div className="flex gap-6 items-center">
                    <HeaderStat label="BID" value={prices[selectedSymbol]?.bid || '---'} precision={getPrecision(selectedSymbol)} />
                    <HeaderStat label="ASK" value={prices[selectedSymbol]?.ask || '---'} precision={getPrecision(selectedSymbol)} />
                    <HeaderStat label="SPREAD" value={activeStats.spread} color="text-primary" />
                    <HeaderStat label="LAST" value={activeStats.last} color="text-white" />
                    <HeaderStat label="HIGH" value={activeStats.high} color="text-emerald-500" />
                    <HeaderStat label="LOW" value={activeStats.low} color="text-red-500" />
                 </div>
               </div>

               <div className="flex items-center gap-4">
                  <div className="text-right">
                     <p className="text-[8px] font-black text-zinc-500 uppercase tracking-widest">UTC TIME</p>
                     <p className="text-xs font-mono font-bold text-primary tabular-nums">{currentTime}</p>
                  </div>
                  <Badge variant="secondary" className="bg-primary/10 text-primary uppercase font-black text-[9px] h-6 px-3">UTC LIVE</Badge>
               </div>
            </div>

            <div ref={chartContainerRef} className="w-full h-[600px] border-b border-zinc-900" />
          </Card>
        </div>

        {/* Bottom Symbols */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-20">
          {SYMBOLS.slice(12).map(renderCard)}
        </div>
      </main>
    </div>
  );
}

function ToolbarButton({ icon, onClick }: { icon: any, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-primary hover:bg-white/5 transition-all"
    >
      {icon}
    </button>
  );
}

function HeaderStat({ label, value, precision, color = "text-zinc-400" }: { label: string, value: any, precision?: number, color?: string }) {
  const displayValue = typeof value === 'number' && precision !== undefined ? value.toLocaleString(undefined, { minimumFractionDigits: precision }) : value;
  return (
    <div className="flex flex-col">
      <span className="text-[8px] font-black text-zinc-600 uppercase tracking-tighter">{label}</span>
      <span className={cn("text-[11px] font-mono font-black tabular-nums", color)}>{displayValue}</span>
    </div>
  );
}
