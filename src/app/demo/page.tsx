
'use client';

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { useCollection } from "@/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { 
  Loader2, ArrowLeft, Minus, Activity, Bell, Globe, Settings, 
  Crosshair, Circle, Slash, ArrowUpRight, ArrowRight,
  Square, Type, Ruler, ZoomIn, ZoomOut, Home, Eraser, SeparatorVertical,
  Clock as ClockIcon, AlertTriangle, Lock, Unlock, Magnet,
  TrendingUp, Eye, EyeOff, ShieldAlert, UserCircle, XCircle,
  MousePointer2, Move, Pencil, Share2, Layers, Trash2, ChevronDown,
  LayoutGrid
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { where, orderBy, limit } from "firebase/firestore";
import { createChart, ColorType, IChartApi, ISeriesApi, PriceScaleMode, CrosshairMode } from 'lightweight-charts';
import Link from 'next/link';
import Image from 'next/image';
import { useBrandSettings } from '@/hooks/use-brand-settings';
import { PositionsPanel } from './PositionsPanel';
import { DrawingLayer } from "./DrawingLayer";
import { ChartSettingsModal } from "./ChartSettingsModal";
import { useLivePrices } from "@/hooks/useLivePrice";
import { useTickStream } from "@/hooks/useTickStream";
import { useIsMobile } from "@/hooks/use-mobile";
import { CONTRACT_SIZE } from "@/lib/rulesConfig";

const SYMBOLS = [
  "XAUUSD", "XAGUSD", "XPTUSD", "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCHF", "USDCAD", "NZDUSD",
  "BTCUSD", "ETHUSD", "SOLUSD", "XRPUSD", "BNBUSD", "DOGEUSD", "ADAUSD"
];

const TIMEFRAMES = [
  { label: '1m', value: '1min', seconds: 60 },
  { label: '5m', value: '5min', seconds: 300 },
  { label: '15m', value: '15min', seconds: 900 },
  { label: '30m', value: '30min', seconds: 1800 },
  { label: '1H', value: '1h', seconds: 3600 },
  { label: '4H', value: '4h', seconds: 14400 },
  { label: '1D', value: '1day', seconds: 86400 },
  { label: '1W', value: '1week', seconds: 604800 },
  { label: '1M', value: '1month', seconds: 2592000 },
];

export default function DemoPage() {
  const { user, userData, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const branding = useBrandSettings();
  const isMobile = useIsMobile();

  const [hasMounted, setHasMounted] = useState(false);
  const [currentAccountId, setCurrentAccountId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [isChartLoading, setIsChartLoading] = useState(true);
  const [isChartReady, setIsChartReady] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState("XAUUSD");
  const [selectedInterval, setSelectedInterval] = useState("1min");
  const [lotsInput, setLotsInput] = useState("0.10");
  const [sl, setSl] = useState("");
  const [tp, setTp] = useState("");
  const [bottomPanelOpen, setBottomPanelOpen] = useState(true);
  const [activeTool, setActiveTool] = useState('crosshair');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isOrderSheetOpen, setIsOrderSheetOpen] = useState(false);
  const [drawingsLocked, setDrawingsLocked] = useState(false);
  const [drawingsHidden, setDrawingsHidden] = useState(false);

  // Time & Countdown States
  const [currentTime, setCurrentTime] = useState(new Date());
  const [candleCountdown, setCandleCountdown] = useState("");

  useEffect(() => { setHasMounted(true); }, []);

  // Sync Clock & Countdown
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      setCurrentTime(now);
      
      const timeframeSeconds = TIMEFRAMES.find(t => t.value === selectedInterval)?.seconds || 60;
      const nowSeconds = Math.floor(now.getTime() / 1000);
      const remaining = timeframeSeconds - (nowSeconds % timeframeSeconds);
      
      const h = Math.floor(remaining / 3600);
      const m = Math.floor((remaining % 3600) / 60);
      const s = remaining % 60;
      
      if (h > 0) {
        setCandleCountdown(`${h}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`);
      } else {
        setCandleCountdown(`${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [selectedInterval]);

  const { tick: streamTick } = useTickStream(selectedSymbol);
  const livePrices = useLivePrices(SYMBOLS);

  const activePrice = useMemo(() => {
    const sym = selectedSymbol.toUpperCase();
    if (streamTick?.price) return streamTick;
    const rtdbTick = livePrices[sym];
    if (rtdbTick?.price) return rtdbTick;
    return null;
  }, [streamTick, livePrices, selectedSymbol]);

  const accountConstraints = useMemo(() => user?.uid ? [where("userId", "==", user.uid)] : [], [user?.uid]);
  const { data: accounts, loading: accountsLoading } = useCollection<any>(user?.uid ? "demoAccounts" : null, accountConstraints);
  const activeAccounts = useMemo(() => accounts.filter(a => a.status === 'active' || a.status === 'passed'), [accounts]);
  const selectedAccount = useMemo(() => activeAccounts.find(a => a.id === currentAccountId) || activeAccounts[0] || null, [activeAccounts, currentAccountId]);

  const tradeConstraints = useMemo(() => user?.uid ? [where("userId", "==", user.uid), orderBy("openedAt", "desc")] : [], [user?.uid]);
  const { data: allUserTrades } = useCollection<any>(tradeConstraints.length ? "demoTrades" : null, tradeConstraints);
  const trades = useMemo(() => allUserTrades.filter(t => t.accountId === (currentAccountId || activeAccounts[0]?.id)), [allUserTrades, currentAccountId, activeAccounts]);
  const openTrades = useMemo(() => trades.filter(t => t.status === 'open'), [trades]);
  const closedTrades = useMemo(() => trades.filter(t => t.status === 'closed'), [trades]);

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<IChartApi | null>(null);
  const mainSeriesRef = useRef<ISeriesApi<any> | null>(null);

  // EXECUTION LOGIC
  async function placeTrade(type: 'buy' | 'sell') {
    if (actionLoading || !user || !selectedAccount || !activePrice) return;
    setActionLoading(true);
    try {
      const token = await user.getIdToken(true);
      const res = await fetch('/api/terminal/trades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ 
          accountId: selectedAccount.id, 
          symbol: selectedSymbol, 
          type, 
          lots: parseFloat(lotsInput),
          sl: sl ? parseFloat(sl) : null,
          tp: tp ? parseFloat(tp) : null
        })
      });
      if (!res.ok) {
        const err = await res.json();
        toast({ title: "Order Rejected", description: err.error, variant: "destructive" });
      } else {
        toast({ title: "✓ Position Opened" });
        setIsOrderSheetOpen(false);
      }
    } catch(e) { toast({ title: "Network Error", variant: "destructive" }); } finally { setActionLoading(false); }
  }

  async function closeTrade(tradeId: string) {
    if (actionLoading || !user) return;
    setActionLoading(true);
    try {
      const trade = openTrades.find(t => t.id === tradeId);
      if (!trade) return;
      const priceData = livePrices[trade.symbol.toUpperCase()] || activePrice;
      const closePrice = trade.type === 'buy' ? priceData?.bid : priceData?.ask;

      const token = await user.getIdToken(true);
      const res = await fetch(`/api/terminal/trades/${tradeId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ closePrice })
      });
      if (res.ok) toast({ title: "✓ Position Closed" });
    } catch(e) {} finally { setActionLoading(false); }
  }

  // CHART INITIALIZATION
  useEffect(() => {
    if (!chartContainerRef.current) return;
    
    const chart = createChart(chartContainerRef.current, {
      layout: { 
        background: { type: ColorType.Solid, color: '#09090b' }, 
        textColor: '#71717a',
        fontSize: 11,
        fontFamily: 'Inter, sans-serif',
      },
      grid: { 
        vertLines: { color: '#18181b', style: 0 }, 
        horzLines: { color: '#18181b', style: 0 } 
      },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
      timeScale: { 
        rightOffset: 20, 
        barSpacing: 8, 
        borderColor: '#27272a',
        timeVisible: true,
        secondsVisible: false,
      },
      priceScale: {
        borderColor: '#27272a',
        autoScale: true,
        mode: PriceScaleMode.Normal,
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: '#71717a', width: 0.5, style: 1, labelBackgroundColor: '#111' },
        horzLine: { color: '#71717a', width: 0.5, style: 1, labelBackgroundColor: '#111' },
      },
    });

    const series = chart.addCandlestickSeries({ 
      upColor: '#10b981', 
      downColor: '#ef4444', 
      borderVisible: false, 
      wickUpColor: '#10b981', 
      wickDownColor: '#ef4444',
      priceFormat: { type: 'price', precision: selectedSymbol.includes('JPY') ? 3 : (selectedSymbol === 'XAUUSD' ? 3 : 5), minMove: 0.00001 }
    });

    chartInstanceRef.current = chart;
    mainSeriesRef.current = series;
    setIsChartReady(true);

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth, height: chartContainerRef.current.clientHeight });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [selectedSymbol]);

  // FETCH HISTORY
  useEffect(() => {
    if (!isChartReady) return;
    const fetchHistory = async () => {
      setIsChartLoading(true);
      try {
        const res = await fetch(`/api/terminal/candles?symbol=${selectedSymbol}&interval=${selectedInterval}&limit=500`);
        const data = await res.json();
        if (data.candles && mainSeriesRef.current) {
          mainSeriesRef.current.setData(data.candles);
          chartInstanceRef.current?.timeScale().fitContent();
        }
      } catch(e) {} finally { setIsChartLoading(false); }
    };
    fetchHistory();
  }, [selectedSymbol, selectedInterval, isChartReady]);

  // LIVE TICK UPDATE
  useEffect(() => {
    if (activePrice && mainSeriesRef.current && isChartReady) {
      const lastCandle = mainSeriesRef.current.data().slice(-1)[0] as any;
      if (lastCandle) {
        mainSeriesRef.current.update({
          ...lastCandle,
          close: activePrice.price,
          high: Math.max(lastCandle.high, activePrice.price),
          low: Math.min(lastCandle.low, activePrice.price),
        });
      }
    }
  }, [activePrice, isChartReady]);

  return (
    <div className="fixed inset-0 h-screen w-screen bg-[#09090b] flex flex-col text-zinc-300 overflow-hidden">
      {/* Institutional Top Header */}
      <header className="h-10 border-b border-zinc-800 flex items-center justify-between px-3 bg-zinc-950 shrink-0 z-50">
        <div className="flex items-center gap-4 h-full">
          <Link href="/dashboard" className="flex items-center gap-2 pr-3 border-r border-zinc-800 h-6 group">
            <ArrowLeft className="w-3.5 h-3.5 text-zinc-500 group-hover:text-primary transition-colors" />
            <Image src={branding.logoUrl} alt="Logo" width={18} height={18} className="rounded-full" />
            <span className="font-bold text-[11px] text-white">PRIME TERMINAL</span>
          </Link>

          {/* Symbol & Timeframes */}
          <div className="flex items-center gap-1">
             <button className="flex items-center gap-2 px-3 py-1 bg-white/5 rounded border border-white/5 hover:border-primary/20 transition-all">
                <span className="font-black text-[11px] text-white tracking-widest">{selectedSymbol}</span>
                <ChevronDown className="w-3 h-3 text-zinc-500" />
             </button>
             <div className="w-px h-4 bg-zinc-800 mx-1" />
             <div className="flex items-center gap-0.5">
               {TIMEFRAMES.map(tf => (
                 <button 
                   key={tf.value} 
                   onClick={() => setSelectedInterval(tf.value)}
                   className={cn(
                     "px-2 py-1 rounded text-[10px] font-black uppercase transition-all",
                     selectedInterval === tf.value ? "bg-primary text-black" : "text-zinc-500 hover:text-white hover:bg-white/5"
                   )}
                 >
                   {tf.label}
                 </button>
               ))}
             </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
           <div className="hidden md:flex items-center gap-4 text-[10px] font-black uppercase tracking-widest text-zinc-500 pr-4 border-r border-zinc-800">
              <div className="flex items-center gap-1.5"><ClockIcon className="w-3 h-3 text-primary" /> {currentTime.toLocaleTimeString('en-US', { hour12: false })}</div>
              <div className="flex items-center gap-1.5"><UserCircle className="w-3 h-3 text-primary" /> ID: {userData?.traderId}</div>
           </div>
           
           <div className="flex items-center gap-2">
             {activePrice && (
               <div className="flex items-center gap-2 mr-2">
                 <div className="flex flex-col items-end">
                    <span className="text-[9px] text-zinc-500 leading-none">BID</span>
                    <span className="font-mono text-[10px] text-white leading-none">{activePrice.bid?.toFixed(selectedSymbol.includes('JPY') ? 3 : 5)}</span>
                 </div>
                 <div className="flex flex-col items-end">
                    <span className="text-[9px] text-zinc-500 leading-none">ASK</span>
                    <span className="font-mono text-[10px] text-white leading-none">{activePrice.ask?.toFixed(selectedSymbol.includes('JPY') ? 3 : 5)}</span>
                 </div>
               </div>
             )}
             <Button size="sm" className="bg-primary text-black font-black text-[10px] h-7 px-4 rounded" onClick={() => setIsOrderSheetOpen(true)}>TRADE</Button>
             <button onClick={() => setIsSettingsOpen(true)} className="p-1.5 hover:bg-white/5 rounded transition-colors"><Settings className="w-4 h-4 text-zinc-500" /></button>
           </div>
        </div>
      </header>

      {/* Main Terminal Grid */}
      <div className="flex-1 flex min-h-0 relative">
        
        {/* TradingView-Style Left Toolbar */}
        <aside className="w-10 border-r border-zinc-800 bg-zinc-950 flex flex-col items-center py-2 gap-2 shrink-0 z-40">
           <ToolButton active={activeTool === 'crosshair'} onClick={() => setActiveTool('crosshair')} icon={<Crosshair size={18} />} tooltip="Crosshair (C)" />
           <ToolButton active={activeTool === 'dot'} onClick={() => setActiveTool('dot')} icon={<MousePointer2 size={18} />} tooltip="Dot" />
           <div className="w-6 h-[1px] bg-zinc-800 my-1" />
           <ToolButton active={activeTool === 'trend'} onClick={() => setActiveTool('trend')} icon={<Slash size={18} className="rotate-45" />} tooltip="Trend Line" />
           <ToolButton active={activeTool === 'ray'} onClick={() => setActiveTool('ray')} icon={<ArrowRight size={18} className="-rotate-45" />} tooltip="Ray" />
           <ToolButton active={activeTool === 'hline'} onClick={() => setActiveTool('hline')} icon={<Minus size={18} />} tooltip="Horizontal Line" />
           <ToolButton active={activeTool === 'vline'} onClick={() => setActiveTool('vline')} icon={<SeparatorVertical size={18} />} tooltip="Vertical Line" />
           <div className="w-6 h-[1px] bg-zinc-800 my-1" />
           <ToolButton active={activeTool === 'rect'} onClick={() => setActiveTool('rect')} icon={<Square size={18} />} tooltip="Rectangle" />
           <ToolButton active={activeTool === 'circle'} onClick={() => setActiveTool('circle')} icon={<Circle size={18} />} tooltip="Circle" />
           <ToolButton active={activeTool === 'brush'} onClick={() => setActiveTool('brush')} icon={<Pencil size={18} />} tooltip="Brush" />
           <ToolButton active={activeTool === 'text'} onClick={() => setActiveTool('text')} icon={<Type size={18} />} tooltip="Text" />
           <div className="w-6 h-[1px] bg-zinc-800 my-1" />
           <ToolButton active={activeTool === 'fib'} onClick={() => setActiveTool('fib')} icon={<LayoutGrid size={18} />} tooltip="Fibonacci Retracement" />
           <ToolButton active={activeTool === 'measure'} onClick={() => setActiveTool('measure')} icon={<Ruler size={18} />} tooltip="Measure" />
           <div className="mt-auto space-y-1 pb-2">
             <ToolButton active={drawingsLocked} onClick={() => setDrawingsLocked(!drawingsLocked)} icon={drawingsLocked ? <Lock size={16} /> : <Unlock size={16} />} tooltip="Lock All" />
             <ToolButton active={drawingsHidden} onClick={() => setDrawingsHidden(!drawingsHidden)} icon={drawingsHidden ? <EyeOff size={16} /> : <Eye size={16} />} tooltip="Hide Drawings" />
             <ToolButton active={false} onClick={() => setActiveTool('eraser')} icon={<Eraser size={16} />} tooltip="Clear All" />
           </div>
        </aside>

        {/* Dynamic Chart Container */}
        <div className="flex-1 relative min-h-0 bg-[#09090b] flex flex-col">
          <div className="flex-1 relative overflow-hidden" ref={chartContainerRef}>
            {/* Candle Countdown HUD */}
            <div className="absolute top-4 right-4 z-40 pointer-events-none text-right">
              <div className="bg-zinc-900/80 backdrop-blur px-3 py-1.5 rounded border border-white/5 flex flex-col items-end">
                <span className="text-[8px] font-black uppercase text-zinc-500 tracking-widest leading-none mb-1">Candle Closes In</span>
                <span className="font-mono text-xs font-bold text-primary leading-none tabular-nums">{candleCountdown}</span>
              </div>
            </div>

            {/* Drawing SVG Overlay */}
            {isChartReady && chartInstanceRef.current && mainSeriesRef.current && (
              <DrawingLayer 
                chart={chartInstanceRef.current} 
                series={mainSeriesRef.current} 
                symbol={selectedSymbol}
                activeTool={activeTool}
                setActiveTool={setActiveTool}
                locked={drawingsLocked}
                hidden={drawingsHidden}
              />
            )}

            {isChartLoading && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-zinc-950/80 backdrop-blur-sm">
                <Loader2 className="animate-spin text-primary w-8 h-8" />
                <p className="text-[10px] font-black mt-4 uppercase tracking-[0.2em] text-zinc-400">Syncing Liquidity Feed...</p>
              </div>
            )}
          </div>

          <PositionsPanel 
            openTrades={openTrades} 
            closedTrades={closedTrades} 
            alerts={[]} 
            livePrices={livePrices} 
            closeTrade={closeTrade} 
            deleteAlert={async () => {}} 
            user={user} 
            alertsLoading={false} 
            panelOpen={bottomPanelOpen} 
            setPanelOpen={setBottomPanelOpen} 
          />
        </div>

        {/* Institutional Order Panel (Right) */}
        <aside className="hidden xl:flex w-72 border-l border-zinc-800 bg-zinc-950 p-5 flex-col gap-6 shrink-0 z-40">
          <div className="space-y-4">
             <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <h3 className="font-black text-[10px] uppercase tracking-[0.2em] text-white">Execution Node</h3>
                <Badge variant="outline" className="text-[8px] font-black bg-emerald-500/5 text-emerald-500 border-emerald-500/20">LIVE</Badge>
             </div>
             
             <Select value={currentAccountId ?? ""} onValueChange={setCurrentAccountId}>
                <SelectTrigger className="bg-zinc-900 border-zinc-800 h-10 text-[11px] font-bold">
                  <SelectValue placeholder="Select Account" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                  {activeAccounts.map(a => <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>)}
                </SelectContent>
             </Select>
          </div>

          <OrderControls 
            actionLoading={actionLoading} 
            activePrice={activePrice} 
            selectedSymbol={selectedSymbol} 
            lotsInput={lotsInput} 
            setLotsInput={setLotsInput} 
            sl={sl} 
            setSl={setSl} 
            tp={tp} 
            setTp={setTp} 
            placeTrade={placeTrade}
          />
        </aside>
      </div>

      <ChartSettingsModal 
        open={isSettingsOpen} 
        onOpenChange={setIsSettingsOpen} 
        settings={{ canvas: { background: { color: '#09090b', type: 'solid' }, grid: { type: 'both', vert: { color: '#18181b' }, horz: { color: '#18181b' } }, candles: { upColor: '#10b981', downColor: '#ef4444' }, watermark: { visible: true, text: 'PRIME FUNDED' }, sessionBreaks: { enabled: true } }, scales: { type: 'regular', labels: { currentPrice: true, ohlc: true, tradeLines: true } } }} 
        onSettingsChange={() => {}} 
        onResetScale={() => {
           chartInstanceRef.current?.timeScale().fitContent();
        }}
      />
    </div>
  );
}

function ToolButton({ active, onClick, icon, tooltip }: any) {
  return (
    <button 
      onClick={onClick}
      title={tooltip}
      className={cn(
        "w-8 h-8 rounded flex items-center justify-center transition-all cursor-pointer group relative",
        active ? "bg-primary text-black shadow-[0_0_10px_rgba(17,179,245,0.3)]" : "text-zinc-500 hover:text-white hover:bg-white/5"
      )}
    >
      {icon}
    </button>
  );
}

function OrderControls({ actionLoading, activePrice, selectedSymbol, lotsInput, setLotsInput, sl, setSl, tp, setTp, placeTrade }: any) {
  const precision = selectedSymbol.includes('JPY') ? 3 : (selectedSymbol === 'XAUUSD' ? 3 : 5);
  const spread = activePrice ? Math.abs(activePrice.ask - activePrice.bid) : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-px bg-zinc-800 border border-zinc-800 rounded-lg overflow-hidden">
        <div className="bg-zinc-900/50 p-2 text-center">
           <span className="text-[8px] font-black uppercase text-zinc-500 block mb-1">BID</span>
           <span className="font-mono text-xs text-white">{activePrice?.bid?.toFixed(precision) || '—'}</span>
        </div>
        <div className="bg-zinc-900/50 p-2 text-center">
           <span className="text-[8px] font-black uppercase text-zinc-500 block mb-1">ASK</span>
           <span className="font-mono text-xs text-white">{activePrice?.ask?.toFixed(precision) || '—'}</span>
        </div>
      </div>
      
      <div className="text-center">
         <span className="text-[8px] font-black text-primary/60 uppercase tracking-[0.2em]">SPREAD: {spread.toFixed(precision)}</span>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">Volume (Lots)</Label>
          <div className="flex gap-2">
            <button onClick={() => setLotsInput((Math.max(0.01, parseFloat(lotsInput) - 0.01)).toFixed(2))} className="w-10 h-10 bg-zinc-900 rounded border border-zinc-800 font-bold hover:bg-zinc-800">-</button>
            <Input
              type="text"
              value={lotsInput}
              onChange={(e) => setLotsInput(e.target.value)}
              className="h-10 bg-zinc-900/50 text-center font-mono font-bold text-white border-zinc-800 focus:border-primary/50"
            />
            <button onClick={() => setLotsInput((parseFloat(lotsInput) + 0.01).toFixed(2))} className="w-10 h-10 bg-zinc-900 rounded border border-zinc-800 font-bold hover:bg-zinc-800">+</button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-[9px] font-black uppercase text-zinc-500">Stop Loss</Label>
            <Input placeholder="0.00" value={sl} onChange={(e) => setSl(e.target.value)} className="h-9 bg-zinc-900/50 border-zinc-800 text-xs" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[9px] font-black uppercase text-zinc-500">Take Profit</Label>
            <Input placeholder="0.00" value={tp} onChange={(e) => setTp(e.target.value)} className="h-9 bg-zinc-900/50 border-zinc-800 text-xs" />
          </div>
        </div>

        <div className="pt-4 grid grid-cols-2 gap-3">
          <button 
            type="button" 
            onClick={() => placeTrade('buy')} 
            disabled={actionLoading || !activePrice} 
            className="h-14 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[11px] uppercase tracking-widest transition-all active:scale-95 disabled:opacity-50"
          >
            {actionLoading ? <Loader2 className="animate-spin w-4 h-4 mx-auto" /> : "Buy / Long"}
          </button>
          <button 
            type="button" 
            onClick={() => placeTrade('sell')} 
            disabled={actionLoading || !activePrice} 
            className="h-14 rounded bg-red-600 hover:bg-red-700 text-white font-black text-[11px] uppercase tracking-widest transition-all active:scale-95 disabled:opacity-50"
          >
            {actionLoading ? <Loader2 className="animate-spin w-4 h-4 mx-auto" /> : "Sell / Short"}
          </button>
        </div>
      </div>
    </div>
  );
}
