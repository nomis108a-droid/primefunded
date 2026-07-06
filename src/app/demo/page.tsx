'use client';

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { useCollection } from "@/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { 
  Loader2, ArrowLeft, Minus, Activity, Bell, Globe, Settings, 
  Crosshair, Circle, Slash, ArrowUpRight, ArrowRight,
  Square, Type, Ruler, ZoomIn, ZoomOut, Home, Eraser, SeparatorVertical,
  Clock as ClockIcon, AlertTriangle, Lock, Unlock, Magnet,
  TrendingUp, Eye, EyeOff, ShieldAlert, UserCircle, XCircle,
  MousePointer2, Move, Pencil, Share2, Layers, Trash2, ChevronDown,
  LayoutGrid, Plus, History, LayoutDashboard, Wallet
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
  const [mobileTab, setMobileTab] = useState<'chart' | 'positions' | 'history' | 'account'>('chart');

  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [candleCountdown, setCandleCountdown] = useState<string | null>(null);

  useEffect(() => { 
    setHasMounted(true); 
  }, []);

  useEffect(() => {
    if (!hasMounted) return;

    const updateTime = () => {
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
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [selectedInterval, hasMounted]);

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

  const getPrecision = (s: string) => {
    if (s.includes('JPY')) return 3;
    if (['XAUUSD', 'BTCUSD', 'ETHUSD', 'SOLUSD', 'BNBUSD'].includes(s.toUpperCase())) return 3;
    return 5;
  };

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
      priceFormat: { 
        type: 'price', 
        precision: getPrecision(selectedSymbol),
        minMove: selectedSymbol.includes('JPY') || selectedSymbol.includes('XAU') ? 0.001 : 0.00001 
      }
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

  useEffect(() => {
    if (activePrice && mainSeriesRef.current && isChartReady) {
      const data = mainSeriesRef.current.data();
      if (data.length === 0) return;

      const lastCandle = data[data.length - 1] as any;
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

  if (authLoading) {
    return (
      <div className="fixed inset-0 bg-background flex flex-col items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground animate-pulse">Syncing Terminal Node...</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 h-screen w-screen bg-[#09090b] flex flex-col text-zinc-300 overflow-hidden pb-safe">
      {/* Institutional Top Header */}
      <header className="h-10 border-b border-zinc-800 flex items-center justify-between px-3 bg-zinc-950 shrink-0 z-50">
        <div className="flex items-center gap-2 md:gap-4 h-full">
          <Link href="/dashboard" className="flex items-center gap-2 pr-2 md:pr-3 border-r border-zinc-800 h-6 group">
            <ArrowLeft className="w-3.5 h-3.5 text-zinc-500 group-hover:text-primary transition-colors" />
            <Image src={branding.logoUrl} alt="Logo" width={18} height={18} className="rounded-full" />
            {!isMobile && <span className="font-bold text-[11px] text-white">PRIME TERMINAL</span>}
          </Link>

          <div className="flex items-center gap-1">
             <Select value={selectedSymbol} onValueChange={setSelectedSymbol}>
               <SelectTrigger className="flex items-center gap-2 px-2 md:px-3 py-1 bg-white/5 rounded border border-white/5 hover:border-primary/20 transition-all h-8 text-[10px] md:text-[11px] font-black text-white tracking-widest outline-none ring-0 focus:ring-0">
                  <SelectValue placeholder="Symbol" />
               </SelectTrigger>
               <SelectContent className="bg-zinc-900 border-zinc-800 text-white max-h-[300px]">
                 {SYMBOLS.map(sym => (
                   <SelectItem key={sym} value={sym} className="text-[10px] font-black tracking-widest">{sym}</SelectItem>
                 ))}
               </SelectContent>
             </Select>
             
             {!isMobile && <div className="w-px h-4 bg-zinc-800 mx-1" />}
             <div className="flex items-center gap-0.5 overflow-x-auto no-scrollbar max-w-[120px] md:max-w-none">
               {TIMEFRAMES.filter(tf => isMobile ? ['1m', '5m', '15m', '1H', '1D'].includes(tf.label) : true).map(tf => (
                 <button 
                   key={tf.value} 
                   onClick={() => setSelectedInterval(tf.value)}
                   className={cn(
                     "px-2 py-1 rounded text-[10px] font-black uppercase transition-all whitespace-nowrap",
                     selectedInterval === tf.value ? "bg-primary text-black" : "text-zinc-500 hover:text-white hover:bg-white/5"
                   )}
                 >
                   {tf.label}
                 </button>
               ))}
             </div>
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-4">
           {!isMobile && (
             <div className="flex items-center gap-4 text-[10px] font-black uppercase tracking-widest text-zinc-500 pr-4 border-r border-zinc-800">
                <div className="flex items-center gap-1.5">
                  <ClockIcon className="w-3 h-3 text-primary" /> 
                  {hasMounted && currentTime ? currentTime.toLocaleTimeString('en-US', { hour12: false }) : '--:--:--'}
                </div>
                <div className="flex items-center gap-1.5"><UserCircle className="w-3 h-3 text-primary" /> ID: {userData?.traderId}</div>
             </div>
           )}
           
           <div className="flex items-center gap-2">
             {activePrice && (
               <div className="flex items-center gap-2 mr-1 md:mr-2">
                 <div className="flex flex-col items-end">
                    <span className="text-[8px] md:text-[9px] text-zinc-500 leading-none font-bold uppercase">BID</span>
                    <span className="font-mono text-[9px] md:text-[10px] text-white leading-none">{activePrice.bid?.toFixed(getPrecision(selectedSymbol))}</span>
                 </div>
                 <div className="flex flex-col items-end">
                    <span className="text-[8px] md:text-[9px] text-zinc-500 leading-none font-bold uppercase">ASK</span>
                    <span className="font-mono text-[9px] md:text-[10px] text-white leading-none">{activePrice.ask?.toFixed(getPrecision(selectedSymbol))}</span>
                 </div>
               </div>
             )}
             <Button size="sm" className="bg-primary text-black font-black text-[9px] md:text-[10px] h-7 px-3 md:px-4 rounded" onClick={() => setIsOrderSheetOpen(true)}>TRADE</Button>
             <button onClick={() => setIsSettingsOpen(true)} className="p-1.5 hover:bg-white/5 rounded transition-colors"><Settings className="w-4 h-4 text-zinc-500" /></button>
           </div>
        </div>
      </header>

      {/* Main Terminal Grid */}
      <div className="flex-1 flex min-h-0 relative mb-[env(safe-area-inset-bottom)]">
        
        {/* TradingView-Style Left Toolbar */}
        {!isMobile && (
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
             <div className="mt-auto space-y-1 pb-2">
               <ToolButton active={drawingsLocked} onClick={() => setDrawingsLocked(!drawingsLocked)} icon={drawingsLocked ? <Lock size={16} /> : <Unlock size={16} />} tooltip="Lock All" />
               <ToolButton active={drawingsHidden} onClick={() => setDrawingsHidden(!drawingsHidden)} icon={drawingsHidden ? <EyeOff size={16} /> : <Eye size={16} />} tooltip="Hide Drawings" />
               <ToolButton active={false} onClick={() => setActiveTool('eraser')} icon={<Eraser size={16} />} tooltip="Clear All" />
             </div>
          </aside>
        )}

        {/* Dynamic Chart Container */}
        <div className="flex-1 relative min-h-0 bg-[#09090b] flex flex-col">
          <div className={cn("flex-1 relative overflow-hidden", isMobile && mobileTab !== 'chart' && "hidden")} ref={chartContainerRef}>
            {/* Candle Countdown HUD */}
            <div className="absolute top-4 right-4 z-40 pointer-events-none text-right">
              <div className="bg-zinc-900/80 backdrop-blur px-3 py-1.5 rounded border border-white/5 flex flex-col items-end">
                <span className="text-[8px] font-black uppercase text-zinc-500 tracking-widest leading-none mb-1">Candle Closes In</span>
                <span className="font-mono text-xs font-bold text-primary leading-none tabular-nums">
                  {hasMounted && candleCountdown ? candleCountdown : '--:--'}
                </span>
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
            
            {/* Mobile Trade FAB */}
            {isMobile && mobileTab === 'chart' && (
              <button 
                onClick={() => setIsOrderSheetOpen(true)}
                className="absolute bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-primary text-black flex items-center justify-center shadow-[0_0_25px_rgba(17,179,245,0.6)] animate-in fade-in zoom-in duration-500 hover:scale-110 active:scale-95 transition-all"
              >
                <Plus size={28} strokeWidth={3} />
              </button>
            )}
          </div>

          {!isMobile ? (
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
          ) : (
            <div className={cn("flex-1 overflow-y-auto bg-zinc-950", mobileTab === 'chart' && "hidden")}>
               {mobileTab === 'positions' && (
                 <PositionsPanel 
                   openTrades={openTrades} 
                   closedTrades={closedTrades} 
                   alerts={[]} 
                   livePrices={livePrices} 
                   closeTrade={closeTrade} 
                   deleteAlert={async () => {}} 
                   user={user} 
                   alertsLoading={false} 
                   panelOpen={true} 
                   setPanelOpen={() => {}}
                   defaultTab="positions"
                 />
               )}
               {mobileTab === 'history' && (
                 <PositionsPanel 
                   openTrades={openTrades} 
                   closedTrades={closedTrades} 
                   alerts={[]} 
                   livePrices={livePrices} 
                   closeTrade={closeTrade} 
                   deleteAlert={async () => {}} 
                   user={user} 
                   alertsLoading={false} 
                   panelOpen={true} 
                   setPanelOpen={() => {}}
                   defaultTab="history"
                 />
               )}
               {mobileTab === 'account' && (
                 <div className="p-6 space-y-6">
                   <div className="flex items-center gap-4 bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800">
                      <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center text-primary text-2xl font-black">
                        {userData?.name?.slice(0,1)}
                      </div>
                      <div>
                        <h2 className="text-xl font-bold text-white">{userData?.name || 'Trader'}</h2>
                        <p className="text-xs text-zinc-500 font-mono">ID: {userData?.traderId}</p>
                        <Badge variant="outline" className="mt-2 text-[10px] uppercase font-black tracking-widest border-primary/20 text-primary">{userData?.tier || 'Bronze'} Tier</Badge>
                      </div>
                   </div>
                   <div className="grid grid-cols-2 gap-4">
                     <AccountMobileStat label="Balance" value={`$${(selectedAccount?.balance || 0).toLocaleString()}`} />
                     <AccountMobileStat label="Equity" value={`$${(selectedAccount?.equity || 0).toLocaleString()}`} color="text-primary" />
                   </div>
                   <Button variant="outline" className="w-full h-14 rounded-2xl font-bold border-zinc-800" asChild>
                     <Link href="/dashboard">Return to Hub</Link>
                   </Button>
                 </div>
               )}
            </div>
          )}
        </div>

        {/* Institutional Order Panel (Right) - Desktop Only */}
        {!isMobile && (
          <aside className="hidden xl:flex w-72 border-l border-zinc-800 bg-zinc-950 p-5 flex-col gap-6 shrink-0 z-40">
            <div className="space-y-4">
               <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                  <h3 className="font-black text-[10px] uppercase tracking-[0.2em] text-white">Execution Node</h3>
                  <Badge variant="outline" className="text-[8px] font-black bg-emerald-500/5 text-emerald-500 border-emerald-500/20">LIVE</Badge>
               </div>
               
               <Select value={currentAccountId ?? ""} onValueChange={setCurrentAccountId}>
                  <SelectTrigger className="bg-zinc-900 border-zinc-800 h-10 text-[11px] font-bold outline-none ring-0 focus:ring-0">
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
        )}
      </div>

      {/* Mobile Bottom Navigation */}
      {isMobile && (
        <nav className="h-16 border-t border-zinc-800 bg-zinc-950 flex items-center justify-around shrink-0 z-50">
          <MobileNavButton active={mobileTab === 'chart'} onClick={() => setMobileTab('chart')} icon={<Activity size={20} />} label="Chart" />
          <MobileNavButton active={false} onClick={() => setIsOrderSheetOpen(true)} icon={<TrendingUp size={20} />} label="Trade" />
          <MobileNavButton active={mobileTab === 'positions'} onClick={() => setMobileTab('positions')} icon={<LayoutGrid size={20} />} label="Positions" />
          <MobileNavButton active={mobileTab === 'history'} onClick={() => setMobileTab('history')} icon={<History size={20} />} label="History" />
          <MobileNavButton active={mobileTab === 'account'} onClick={() => setMobileTab('account')} icon={<UserCircle size={20} />} label="Account" />
        </nav>
      )}

      {/* Mobile Order Sheet */}
      <Sheet open={isOrderSheetOpen} onOpenChange={setIsOrderSheetOpen}>
        <SheetContent side="bottom" className="h-[85vh] bg-zinc-950 border-zinc-800 rounded-t-3xl p-0 overflow-hidden flex flex-col">
          <div className="w-12 h-1.5 bg-zinc-800 rounded-full mx-auto mt-3 shrink-0" />
          <SheetHeader className="p-6 pb-2">
            <div className="flex justify-between items-center">
              <div>
                <SheetTitle className="text-2xl font-black font-headline tracking-tighter text-white uppercase italic">{selectedSymbol}</SheetTitle>
                <div className="flex items-center gap-2 mt-1">
                  <Badge className="bg-primary/10 text-primary border-primary/20 text-[9px] uppercase font-black px-2 py-0.5">CFD</Badge>
                  {activePrice && <span className="text-[9px] font-black uppercase text-zinc-500 tracking-widest">Spread: {Math.abs(activePrice.ask - activePrice.bid).toFixed(getPrecision(selectedSymbol))}</span>}
                </div>
              </div>
              <Select value={currentAccountId ?? ""} onValueChange={setCurrentAccountId}>
                <SelectTrigger className="w-[140px] bg-zinc-900 border-zinc-800 h-9 text-[10px] font-bold outline-none ring-0 focus:ring-0">
                  <SelectValue placeholder="Node ID" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                  {activeAccounts.map(a => <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
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
              isMobile={true}
            />
          </div>
        </SheetContent>
      </Sheet>

      <ChartSettingsModal 
        open={isSettingsOpen} 
        onOpenChange={setIsSettingsOpen} 
        settings={{ canvas: { background: { color: '#09090b', type: 'solid' }, grid: { type: 'both', vert: { color: '#18181b' }, horz: { color: '#18181b' } }, candles: { upColor: '#10b981', downColor: '#ef4444' }, watermark: { visible: true, text: 'PRIME FUNDED' }, sessionBreaks: { enabled: true } }, scales: { type: 'regular', labels: { currentPrice: true, ohlc: true, tradeLines: true } } }} 
        onSettingsChange={() => {}} 
        onResetScale={() => {
           chartInstanceRef.current?.timeScale().fitContent();
           mainSeriesRef.current?.priceScale().applyOptions({ autoScale: true });
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

function MobileNavButton({ active, onClick, icon, label }: any) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex flex-col items-center justify-center gap-1 transition-all h-full px-4 active:scale-95",
        active ? "text-primary" : "text-zinc-500"
      )}
    >
      {icon}
      <span className="text-[10px] font-bold uppercase tracking-tighter">{label}</span>
    </button>
  );
}

function AccountMobileStat({ label, value, color = "text-white" }: any) {
  return (
    <div className="bg-zinc-900/50 p-4 rounded-xl border border-zinc-800">
      <p className="text-[9px] font-black uppercase text-zinc-500 tracking-widest mb-1">{label}</p>
      <p className={cn("text-lg font-bold font-mono", color)}>{value}</p>
    </div>
  );
}

function OrderControls({ actionLoading, activePrice, selectedSymbol, lotsInput, setLotsInput, sl, setSl, tp, setTp, placeTrade, isMobile }: any) {
  const precision = selectedSymbol.includes('JPY') ? 3 : (['XAUUSD', 'BTCUSD', 'ETHUSD', 'SOLUSD', 'BNBUSD'].includes(selectedSymbol.toUpperCase()) ? 3 : 5);
  const spread = activePrice ? Math.abs(activePrice.ask - activePrice.bid) : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-px bg-zinc-800 border border-zinc-800 rounded-lg overflow-hidden shadow-xl">
        <div className="bg-zinc-900/50 p-3 text-center">
           <span className="text-[9px] font-black uppercase text-zinc-500 block mb-1 tracking-widest">BID</span>
           <span className="font-mono text-sm font-bold text-white tabular-nums">{activePrice?.bid?.toFixed(precision) || '—'}</span>
        </div>
        <div className="bg-zinc-900/50 p-3 text-center">
           <span className="text-[9px] font-black uppercase text-zinc-500 block mb-1 tracking-widest">ASK</span>
           <span className="font-mono text-sm font-bold text-white tabular-nums">{activePrice?.ask?.toFixed(precision) || '—'}</span>
        </div>
      </div>

      <div className="space-y-6">
        <div className="space-y-3">
          <Label className="text-[10px] font-black uppercase text-zinc-500 tracking-widest px-1">Market Volume (Lots)</Label>
          <div className="flex gap-3">
            <button 
              onClick={() => setLotsInput((Math.max(0.01, parseFloat(lotsInput) - 0.01)).toFixed(2))} 
              className="w-14 h-14 bg-zinc-900 rounded-2xl border border-zinc-800 font-bold text-xl hover:bg-zinc-800 active:scale-90 transition-all flex items-center justify-center"
            >
              <Minus size={24} />
            </button>
            <Input
              type="number"
              inputMode="decimal"
              value={lotsInput}
              onChange={(e) => setLotsInput(e.target.value)}
              className="h-14 bg-zinc-900/50 text-center font-mono text-xl font-bold text-white border-zinc-800 focus:border-primary/50 rounded-2xl shadow-inner"
            />
            <button 
              onClick={() => setLotsInput((parseFloat(lotsInput) + 0.01).toFixed(2))} 
              className="w-14 h-14 bg-zinc-900 rounded-2xl border border-zinc-800 font-bold text-xl hover:bg-zinc-800 active:scale-90 transition-all flex items-center justify-center"
            >
              <Plus size={24} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-[9px] font-black uppercase text-zinc-500 tracking-widest px-1">Stop Loss</Label>
            <Input 
              type="number" 
              inputMode="decimal"
              placeholder="0.000" 
              value={sl} 
              onChange={(e) => setSl(e.target.value)} 
              className="h-12 bg-zinc-900/50 border-zinc-800 text-sm font-bold font-mono rounded-xl focus:border-red-500/30" 
            />
          </div>
          <div className="space-y-2">
            <Label className="text-[9px] font-black uppercase text-zinc-500 tracking-widest px-1">Take Profit</Label>
            <Input 
              type="number" 
              inputMode="decimal"
              placeholder="0.000" 
              value={tp} 
              onChange={(e) => setTp(e.target.value)} 
              className="h-12 bg-zinc-900/50 border-zinc-800 text-sm font-bold font-mono rounded-xl focus:border-emerald-500/30" 
            />
          </div>
        </div>

        <div className={cn("pt-4 grid gap-4", isMobile ? "pb-8" : "grid-cols-2")}>
          <button 
            type="button" 
            onClick={() => placeTrade('buy')} 
            disabled={actionLoading || !activePrice} 
            className="h-16 md:h-14 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs md:text-[11px] uppercase tracking-widest transition-all active:scale-95 disabled:opacity-50 shadow-[0_4px_15px_rgba(16,185,129,0.3)] flex flex-col items-center justify-center gap-1"
          >
            {actionLoading ? <Loader2 className="animate-spin w-5 h-5" /> : (
              <>
                <span>Buy / Long</span>
                <span className="text-[9px] font-mono opacity-80">@ {activePrice?.ask?.toFixed(precision)}</span>
              </>
            )}
          </button>
          <button 
            type="button" 
            onClick={() => placeTrade('sell')} 
            disabled={actionLoading || !activePrice} 
            className="h-16 md:h-14 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-black text-xs md:text-[11px] uppercase tracking-widest transition-all active:scale-95 disabled:opacity-50 shadow-[0_4px_15px_rgba(239,68,68,0.3)] flex flex-col items-center justify-center gap-1"
          >
            {actionLoading ? <Loader2 className="animate-spin w-5 h-5" /> : (
              <>
                <span>Sell / Short</span>
                <span className="text-[9px] font-mono opacity-80">@ {activePrice?.bid?.toFixed(precision)}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
