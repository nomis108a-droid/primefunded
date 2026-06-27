'use client';

import { useEffect, useState, useMemo, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { useFirestore, useCollection } from "@/firebase";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { 
  Activity, 
  Wallet, 
  History, 
  XCircle, 
  Terminal,
  Loader2,
  Clock,
  ArrowLeft,
  ChevronDown,
  LineChart,
  MousePointer2,
  Minus,
  Plus,
  Maximize2,
  Settings2,
  Camera,
  Layers,
  Search,
  LayoutGrid,
  Info,
  TrendingUp,
  Eraser,
  Magnet,
  Zap,
  Target
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { where, orderBy, limit, doc, onSnapshot } from "firebase/firestore";
import { createChart, ColorType, IChartApi, ISeriesApi } from 'lightweight-charts';
import Link from 'next/link';
import Image from 'next/image';
import { useBrandSettings } from '@/hooks/use-brand-settings';
import { RSI, BollingerBands } from 'technicalindicators';

const SYMBOLS = ["XAUUSD", "BTCUSD", "ETHUSD", "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCHF"];
const TIMEFRAMES = [
  { label: '1m', value: '1min' },
  { label: '5m', value: '5min' },
  { label: '15m', value: '15min' },
  { label: '30m', value: '30min' },
  { label: '1h', value: '1h' },
  { label: '4h', value: '4h' },
  { label: '1D', value: '1day' },
];

const getPrecision = (s: string) => {
  if (s === "USDJPY") return 3;
  if (s === "XAUUSD" || s === "BTCUSD" || s === "ETHUSD") return 2;
  return 5;
};

const formatPrice = (price: number | undefined, symbol: string) => {
  if (!price) return '—';
  return price.toFixed(getPrecision(symbol));
};

export default function DemoPage() {
  const { user, userData } = useAuth();
  const db = useFirestore();
  const { toast } = useToast();
  const branding = useBrandSettings();

  const [currentAccountId, setCurrentAccountId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [isChartLoading, setIsChartLoading] = useState(true);
  const [selectedSymbol, setSelectedSymbol] = useState("XAUUSD");
  const [selectedInterval, setSelectedInterval] = useState("1min");
  const [lots, setLots] = useState(0.10);
  const [sl, setSl] = useState<string>("");
  const [tp, setTp] = useState<string>("");
  const [livePrices, setLivePrices] = useState<Record<string, any>>({});
  const [activeBottomTab, setActiveBottomTab] = useState("positions");
  const [orderType, setOrderType] = useState<"market" | "pending">("market");
  
  // Indicator Toggles
  const [indicators, setIndicators] = useState({
    rsi: false,
    bb: false,
    ma20: true,
    ma50: true
  });

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const currentCandleRef = useRef<{time:number, open:number, high:number, low:number} | null>(null);

  // 1. Unified Price Polling
  useEffect(() => {
    const fetchPrices = async () => {
      try {
        const res = await fetch('/api/terminal/live-prices');
        if (!res.ok) return;
        const data = await res.json();
        if (data && typeof data === 'object' && !data.error) setLivePrices(data);
      } catch (e: any) {
        console.warn('[Prices] fetch failed:', e.message);
      }
    };
    fetchPrices();
    const timer = window.setInterval(fetchPrices, 3000);
    return () => window.clearInterval(timer);
  }, []);

  // 2. Initialize Charts
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#09090b' },
        textColor: '#71717a',
      },
      grid: {
        vertLines: { color: '#18181b' },
        horzLines: { color: '#18181b' },
      },
      width: chartContainerRef.current.clientWidth,
      height: 480,
      timeScale: {
        borderColor: '#27272a',
        timeVisible: true,
      },
      rightPriceScale: {
        borderColor: '#27272a',
      },
      watermark: { visible: false },
      crosshair: { mode: 1 }
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#10b981',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    });

    chartInstanceRef.current = chart;
    candleSeriesRef.current = candleSeries;

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []);

  // 3. Load Data & Calculate Indicators
  useEffect(() => {
    if (!candleSeriesRef.current || !chartInstanceRef.current) return;
    currentCandleRef.current = null;
    
    const load = async () => {
      setIsChartLoading(true);
      try {
        const res = await fetch(`/api/terminal/candles?symbol=${selectedSymbol}&interval=${selectedInterval}`);
        if (!res.ok) throw new Error('Fetch failed');
        const candles = await res.json();
        
        if (Array.isArray(candles) && candles.length > 0) {
          candleSeriesRef.current?.setData(candles);
          
          const closes = candles.map((c: any) => c.close);

          if (indicators.ma20) {
            const ma20Data = candles.map((c: any, i: number) => {
              if (i < 19) return null;
              const avg = closes.slice(i - 19, i + 1).reduce((a: number, b: number) => a + b, 0) / 20;
              return { time: c.time, value: avg };
            }).filter(Boolean);
            const line = chartInstanceRef.current?.addLineSeries({ color: '#eab308', lineWidth: 1, priceLineVisible: false });
            line?.setData(ma20Data as any);
          }

          if (indicators.ma50) {
            const ma50Data = candles.map((c: any, i: number) => {
              if (i < 49) return null;
              const avg = closes.slice(i - 49, i + 1).reduce((a: number, b: number) => a + b, 0) / 50;
              return { time: c.time, value: avg };
            }).filter(Boolean);
            const line = chartInstanceRef.current?.addLineSeries({ color: '#3b82f6', lineWidth: 1, priceLineVisible: false });
            line?.setData(ma50Data as any);
          }

          if (indicators.bb) {
            const bb = BollingerBands.calculate({ period: 20, values: closes, stdDev: 2 });
            const bbUpper = chartInstanceRef.current?.addLineSeries({ color: 'rgba(59, 130, 246, 0.3)', lineWidth: 1, priceLineVisible: false });
            const bbLower = chartInstanceRef.current?.addLineSeries({ color: 'rgba(59, 130, 246, 0.3)', lineWidth: 1, priceLineVisible: false });
            bbUpper?.setData(bb.map((b, i) => ({ time: candles[i + 19].time, value: b.upper })));
            bbLower?.setData(bb.map((b, i) => ({ time: candles[i + 19].time, value: b.lower })));
          }

          chartInstanceRef.current?.timeScale().fitContent();
        }
      } catch (e: any) {
        console.warn('[Chart] Candles fetch failed:', e.message);
      } finally {
        setIsChartLoading(false);
      }
    };
    load();
  }, [selectedSymbol, selectedInterval, indicators.ma20, indicators.ma50, indicators.bb]);

  // 4. Live Tick Update
  useEffect(() => {
    if (!candleSeriesRef.current || !livePrices[selectedSymbol]) return;
    const price = livePrices[selectedSymbol].price;
    if (!price || price <= 0) return;

    const intervalMap: Record<string, number> = {
      '1min': 60, '5min': 300, '15min': 900, '30min': 1800, '1h': 3600, '4h': 14400, '1day': 86400
    };
    const secs = intervalMap[selectedInterval] || 300;
    const candleTime = Math.floor(Math.floor(Date.now() / 1000) / secs) * secs;
    const cur = currentCandleRef.current;

    if (!cur || cur.time !== candleTime) {
      currentCandleRef.current = { time: candleTime, open: price, high: price, low: price };
    } else {
      cur.high = Math.max(cur.high, price);
      cur.low = Math.min(cur.low, price);
    }
    
    const c = currentCandleRef.current!;
    candleSeriesRef.current.update({ 
      time: candleTime, 
      open: c.open, 
      high: c.high, 
      low: c.low, 
      close: price 
    } as any);
  }, [livePrices, selectedSymbol, selectedInterval]);

  // Firestore Listeners
  const accountConstraints = useMemo(() => user?.uid ? [where("userId", "==", user.uid)] : [], [user?.uid]);
  const { data: accounts } = useCollection<any>(user?.uid ? "demoAccounts" : null, accountConstraints);

  useEffect(() => {
    if (accounts.length > 0 && !currentAccountId) setCurrentAccountId(accounts[0].id);
  }, [accounts, currentAccountId]);

  const tradeConstraints = useMemo(() => {
    if (!user?.uid || !currentAccountId) return [];
    return [
      where("userId", "==", user.uid),
      where("accountId", "==", currentAccountId),
      where("status", "==", "open")
    ];
  }, [user?.uid, currentAccountId]);

  const { data: openTrades } = useCollection<any>((user?.uid && currentAccountId) ? "demoTrades" : null, tradeConstraints);

  const historyConstraints = useMemo(() => {
    if (!user?.uid || !currentAccountId) return [];
    return [
      where("userId", "==", user.uid),
      where("accountId", "==", currentAccountId),
      where("status", "==", "closed"),
      orderBy("closedAt", "desc"),
      limit(20)
    ];
  }, [user?.uid, currentAccountId]);

  const { data: closedTrades } = useCollection<any>((user?.uid && currentAccountId) ? "demoTrades" : null, historyConstraints);

  const currentAccount = useMemo(() => accounts.find((a) => a.id === currentAccountId), [accounts, currentAccountId]);
  const currentPriceData = livePrices[selectedSymbol];

  const metrics = useMemo(() => {
    if (!currentAccount) return { equity: 0, floatingPnL: 0 };
    let floating = 0;
    openTrades.forEach(trade => {
      const priceData = livePrices[trade.symbol];
      if (priceData) {
        const cp = trade.type === 'buy' ? priceData.bid : priceData.ask;
        const contractSize = trade.symbol === 'XAUUSD' ? 100 : ['BTCUSD', 'ETHUSD', 'XRPUSD', 'SOLUSD', 'DOGEUSD', 'ADAUSD', 'BNBUSD'].includes(trade.symbol) ? 1 : 100000;
        floating += trade.type === 'buy' 
          ? (cp - trade.openPrice) * contractSize * trade.lots
          : (trade.openPrice - cp) * contractSize * trade.lots;
      }
    });
    return { equity: (currentAccount.balance || 0) + floating, floatingPnL: floating };
  }, [currentAccount, openTrades, livePrices]);

  // Order Panel Metrics Fix
  const contractSize = useMemo(() => {
    const crypto = ['BTCUSD', 'ETHUSD', 'XRPUSD', 'SOLUSD', 'DOGEUSD', 'ADAUSD', 'BNBUSD'];
    if (crypto.includes(selectedSymbol)) return 1;
    if (selectedSymbol === 'XAUUSD') return 100;
    return 100000;
  }, [selectedSymbol]);

  const spread = useMemo(() => {
    if (!currentPriceData) return 0;
    return Math.max(0, currentPriceData.ask - currentPriceData.bid);
  }, [currentPriceData]);

  const spreadCost = useMemo(() => {
    return spread * lots * contractSize;
  }, [spread, lots, contractSize]);

  const marginRequired = useMemo(() => {
    const price = currentPriceData?.price || 0;
    return (lots * contractSize * price) / 100;
  }, [lots, contractSize, currentPriceData]);

  const lotValue = useMemo(() => {
    const price = currentPriceData?.price || 0;
    return lots * contractSize * price;
  }, [lots, contractSize, currentPriceData]);

  async function placeTrade(type: "buy" | "sell") {
    if (!user || !currentAccountId || !currentPriceData) {
      toast({ variant: "destructive", title: "Execution Blocked", description: "Pricing data unavailable." });
      return;
    }
    setActionLoading(true);
    try {
      const token = await user.getIdToken();
      const executionPrice = type === 'buy' ? currentPriceData.ask : currentPriceData.bid;
      const res = await fetch("/api/terminal/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ 
          accountId: currentAccountId, 
          symbol: selectedSymbol, 
          type, 
          lots, 
          price: executionPrice,
          sl: sl ? parseFloat(sl) : null,
          tp: tp ? parseFloat(tp) : null
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Execution rejected.");
      }
      toast({ title: "Order Executed", description: `${type.toUpperCase()} ${lots} ${selectedSymbol}` });
      setSl("");
      setTp("");
    } catch (err: any) {
      toast({ variant: "destructive", title: "Execution Error", description: err.message });
    } finally {
      setActionLoading(false);
    }
  }

  async function closeTrade(tradeId: string) {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/terminal/trades/${tradeId}/close`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      toast({ title: "Position Closed", description: `PnL: $${data.pnl?.toFixed(2) || '0.00'}` });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Closure Error", description: err.message });
    }
  }

  return (
    <div className="fixed inset-0 h-screen w-screen bg-[#09090b] flex flex-col text-zinc-300 font-sans select-none overflow-hidden">
      {/* 1. TOP BAR */}
      <header className="h-12 border-b border-zinc-800 flex items-center justify-between px-4 bg-zinc-950 shrink-0 z-50">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Image src={branding.logoUrl} alt="Logo" width={24} height={24} className="rounded-full" />
            <span className="font-bold text-sm tracking-tight text-white">PrimeFunded Trade</span>
          </div>
          <Link href="/dashboard" className="flex items-center gap-2 text-xs font-bold text-zinc-500 hover:text-white transition-colors border-l border-zinc-800 pl-6 h-12">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
          </Link>
        </div>

        <div className="flex items-center gap-6 h-full">
          {currentAccount && (
            <div className="flex items-center gap-4 h-full border-r border-zinc-800 pr-6">
              <div className="text-right">
                <p className="text-[10px] uppercase font-black tracking-widest text-zinc-500 leading-tight">Session Equity</p>
                <p className="font-mono text-sm font-bold text-white leading-tight">${metrics.equity.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
              </div>
              <Badge className={cn(
                "text-[10px] font-black uppercase h-5 px-3 border-none",
                currentAccount.status === 'active' ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
              )}>{currentAccount.status}</Badge>
            </div>
          )}

          <div className="flex items-center gap-4">
            <Select value={currentAccountId ?? ""} onValueChange={setCurrentAccountId}>
              <SelectTrigger className="bg-transparent border-none h-12 w-56 text-xs font-bold hover:bg-white/5 transition-colors focus:ring-0">
                <SelectValue placeholder="Select Account" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id} className="focus:bg-zinc-800 cursor-pointer">
                    {a.label} (${a.balance.toLocaleString()})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center overflow-hidden">
              {userData?.photoURL ? <Image src={userData.photoURL} alt="User" width={32} height={32} /> : <div className="text-[10px] font-bold">PF</div>}
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 flex min-h-0 relative">
        {/* 2. LEFT TOOLBAR */}
        <aside className="w-12 border-r border-zinc-800 bg-zinc-950 flex flex-col items-center py-4 gap-4 shrink-0">
          <ToolIcon icon={<MousePointer2 />} active />
          <ToolIcon icon={<LayoutGrid />} />
          <div className="h-px w-6 bg-zinc-800 my-1" />
          <ToolIcon icon={<Minus className="rotate-45" />} />
          <ToolIcon icon={<Minus />} />
          <ToolIcon icon={<LayoutGrid className="scale-75" />} />
          <ToolIcon icon={<TrendingUp />} />
          <ToolIcon icon={<Zap />} />
          <div className="mt-auto flex flex-col gap-4">
            <ToolIcon icon={<Magnet />} />
            <ToolIcon icon={<Eraser />} />
          </div>
        </aside>

        <div className="flex-1 flex flex-col min-w-0 bg-[#09090b]">
          {/* SYMBOL BAR */}
          <div className="h-10 border-b border-zinc-800 flex items-center px-1 gap-1 bg-zinc-950/50 overflow-x-auto no-scrollbar shrink-0">
            {SYMBOLS.map((s) => {
              const p = livePrices[s];
              return (
                <button 
                  key={s} 
                  onClick={() => setSelectedSymbol(s)}
                  className={cn(
                    "px-4 h-full flex items-center gap-3 transition-all border-b-2 relative shrink-0",
                    s === selectedSymbol ? "border-primary bg-primary/5" : "border-transparent hover:bg-white/5"
                  )}
                >
                  <span className={cn("font-bold text-[11px]", s === selectedSymbol ? "text-white" : "text-zinc-500")}>{s}</span>
                  <span className="font-mono text-[10px] tabular-nums text-zinc-400">
                    {formatPrice(p?.price, s)}
                  </span>
                </button>
              );
            })}
            <button className="p-2 hover:bg-white/10 rounded-md ml-2"><Plus className="w-4 h-4 text-zinc-500" /></button>
          </div>

          {/* CHART TOOLBAR */}
          <div className="h-10 border-b border-zinc-800 flex items-center justify-between px-4 bg-zinc-950/30 shrink-0">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-zinc-900/50 p-0.5 rounded-lg border border-zinc-800">
                {TIMEFRAMES.map((tf) => (
                  <button
                    key={tf.value}
                    onClick={() => setSelectedInterval(tf.value)}
                    className={cn(
                      "px-2.5 py-1 rounded-md text-[10px] font-black uppercase transition-all",
                      selectedInterval === tf.value ? "bg-zinc-800 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-300"
                    )}
                  >
                    {tf.label}
                  </button>
                ))}
              </div>
              <div className="h-6 w-px bg-zinc-800 mx-2" />
              <button className="flex items-center gap-2 px-3 py-1.5 hover:bg-zinc-800 rounded-lg text-xs font-bold transition-colors">
                <LineChart className="w-4 h-4 text-primary" />
                <span>Candles</span>
                <ChevronDown className="w-3 h-3 text-zinc-500" />
              </button>
              <button 
                onClick={() => setIndicators(prev => ({...prev, rsi: !prev.rsi}))}
                className={cn("flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all", indicators.rsi ? "bg-primary/10 text-primary" : "hover:bg-zinc-800")}
              >
                <Layers className="w-4 h-4" />
                <span>Indicators</span>
              </button>
            </div>

            <div className="flex items-center gap-4">
              <button className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-white transition-colors"><Search className="w-4 h-4" /></button>
              <button className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-white transition-colors"><Camera className="w-4 h-4" /></button>
              <button className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-white transition-colors"><Settings2 className="w-4 h-4" /></button>
              <button className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-white transition-colors"><Maximize2 className="w-4 h-4" /></button>
            </div>
          </div>

          {/* THE CHART PANEL */}
          <div className="flex-1 relative min-h-0 bg-[#09090b]">
            {isChartLoading && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-zinc-950/80 backdrop-blur-sm">
                <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500">Syncing Institutional Feed...</p>
              </div>
            )}
            <div ref={chartContainerRef} className="h-full w-full relative" style={{ position: 'relative' }}>
              <div className="absolute bottom-0 left-0 w-32 h-10 bg-transparent z-10" />
            </div>
          </div>
          
          {/* BOTTOM PANEL */}
          <Tabs value={activeBottomTab} onValueChange={setActiveBottomTab} className="h-[280px] border-t border-zinc-800 bg-zinc-950 flex flex-col shrink-0">
             <div className="px-4 h-10 border-b border-zinc-800 flex justify-between items-center bg-zinc-950/50">
                <TabsList className="bg-transparent h-full p-0 gap-6">
                  <TabsTrigger value="positions" className="bg-transparent border-none h-full text-[10px] font-black uppercase tracking-widest text-zinc-500 data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none shadow-none px-0">Open Positions ({openTrades.length})</TabsTrigger>
                  <TabsTrigger value="history" className="bg-transparent border-none h-full text-[10px] font-black uppercase tracking-widest text-zinc-500 data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none shadow-none px-0">Trade History</TabsTrigger>
                  <TabsTrigger value="account" className="bg-transparent border-none h-full text-[10px] font-black uppercase tracking-widest text-zinc-500 data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none shadow-none px-0">Account Info</TabsTrigger>
                </TabsList>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase text-zinc-500 tracking-tighter">Profit:</span>
                    <span className={cn("text-xs font-mono font-bold", metrics.floatingPnL >= 0 ? "text-emerald-500" : "text-red-500")}>
                      {metrics.floatingPnL >= 0 ? '+' : ''}${metrics.floatingPnL.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="h-4 w-px bg-zinc-800" />
                  <div className="flex items-center gap-2">
                     <span className="text-[10px] font-black uppercase text-zinc-500 tracking-tighter">Spread:</span>
                     <span className="text-xs font-mono font-bold text-white">{formatPrice(spread, selectedSymbol)}</span>
                  </div>
                </div>
             </div>

             <div className="flex-1 overflow-y-auto custom-scrollbar">
                <TabsContent value="positions" className="m-0">
                  <table className="w-full text-[11px] text-left">
                    <thead className="sticky top-0 bg-zinc-950/90 backdrop-blur-md text-zinc-500 uppercase text-[9px] font-black tracking-widest border-b border-zinc-800">
                      <tr>
                        <th className="py-2.5 px-4">Symbol</th>
                        <th className="py-2.5 px-2">Type</th>
                        <th className="py-2.5 px-2">Lots</th>
                        <th className="py-2.5 px-4">Entry</th>
                        <th className="py-2.5 px-4">S/L</th>
                        <th className="py-2.5 px-4">T/P</th>
                        <th className="py-2.5 px-4 text-right">PnL (USD)</th>
                        <th className="py-2.5 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-900">
                      {openTrades.length === 0 ? (
                        <tr><td colSpan={8} className="py-20 text-center italic text-zinc-600">No active positions.</td></tr>
                      ) : openTrades.map((t) => {
                        const priceData = livePrices[t.symbol];
                        let pnl = 0;
                        if (priceData) {
                           const cp = t.type === 'buy' ? priceData.bid : priceData.ask;
                           const contractSize = t.symbol === 'XAUUSD' ? 100 : ['BTCUSD', 'ETHUSD', 'XRPUSD', 'SOLUSD', 'DOGEUSD', 'ADAUSD', 'BNBUSD'].includes(t.symbol) ? 1 : 100000;
                           pnl = t.type === 'buy' 
                             ? (cp - t.openPrice) * contractSize * t.lots
                             : (t.openPrice - cp) * contractSize * t.lots;
                        }
                        return (
                          <tr key={t.id} className="hover:bg-white/5 group transition-colors">
                            <td className="py-2 px-4 font-bold text-white">{t.symbol}</td>
                            <td className="py-2 px-2">
                              <span className={cn(
                                "font-black uppercase text-[10px]",
                                t.type === 'buy' ? "text-emerald-500" : "text-red-500"
                              )}>{t.type}</span>
                            </td>
                            <td className="py-2 px-2 font-mono text-zinc-400">{t.lots.toFixed(2)}</td>
                            <td className="py-2 px-4 font-mono text-zinc-400">{formatPrice(t.openPrice, t.symbol)}</td>
                            <td className="py-2 px-4 font-mono text-zinc-600">{t.sl ? formatPrice(t.sl, t.symbol) : "—"}</td>
                            <td className="py-2 px-4 font-mono text-zinc-600">{t.tp ? formatPrice(t.tp, t.symbol) : "—"}</td>
                            <td className={cn(
                              "py-2 px-4 text-right font-mono font-bold tabular-nums text-sm",
                              pnl >= 0 ? "text-emerald-500" : "text-red-500"
                            )}>
                              {pnl >= 0 ? '+' : ''}{pnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="py-2 px-4 text-right">
                              <button onClick={() => closeTrade(t.id)} className="p-1 hover:bg-red-500/20 text-red-500/50 hover:text-red-500 transition-colors rounded">
                                <XCircle className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </TabsContent>
                
                <TabsContent value="history" className="m-0">
                   <table className="w-full text-[11px] text-left">
                    <thead className="sticky top-0 bg-zinc-950/90 backdrop-blur-md text-zinc-500 uppercase text-[9px] font-black tracking-widest border-b border-zinc-800">
                      <tr>
                        <th className="py-2.5 px-4">Symbol</th>
                        <th className="py-2.5 px-2">Type</th>
                        <th className="py-2.5 px-4">Lots</th>
                        <th className="py-2.5 px-4">Open</th>
                        <th className="py-2.5 px-4">Close</th>
                        <th className="py-2.5 px-4 text-right">PnL</th>
                        <th className="py-2.5 px-4 text-right">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-900">
                      {closedTrades.map((t) => (
                        <tr key={t.id} className="hover:bg-white/5 group transition-colors">
                          <td className="py-2 px-4 font-bold text-white">{t.symbol}</td>
                          <td className="py-2 px-2 uppercase font-bold">{t.type}</td>
                          <td className="py-2 px-4 font-mono">{t.lots}</td>
                          <td className="py-2 px-4 font-mono text-zinc-500">{formatPrice(t.openPrice, t.symbol)}</td>
                          <td className="py-2 px-4 font-mono text-zinc-500">{formatPrice(t.closePrice, t.symbol)}</td>
                          <td className={cn("py-2 px-4 text-right font-mono font-bold", (t.pnl || 0) >= 0 ? "text-emerald-500" : "text-red-500")}>
                            {(t.pnl || 0).toLocaleString()}
                          </td>
                          <td className="py-2 px-4 text-right text-zinc-600">{new Date(t.closedAt?.toDate ? t.closedAt.toDate() : t.closedAt).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                   </table>
                </TabsContent>

                <TabsContent value="account" className="m-0 p-8">
                   <div className="grid grid-cols-5 gap-8">
                      <AccountMetric label="Balance" value={`$${currentAccount?.balance?.toLocaleString()}`} />
                      <AccountMetric label="Equity" value={`$${metrics.equity.toLocaleString()}`} />
                      <AccountMetric label="Margin" value={`$${marginRequired.toLocaleString()}`} />
                      <AccountMetric label="Free Margin" value={`$${(metrics.equity - marginRequired).toLocaleString()}`} />
                      <AccountMetric label="Margin Level" value="100.00%" />
                   </div>
                </TabsContent>
             </div>
          </Tabs>
        </div>

        {/* 4. ORDER PANEL */}
        <aside className="w-80 border-l border-zinc-800 bg-zinc-950 p-6 flex flex-col gap-8 shrink-0 overflow-y-auto custom-scrollbar z-50">
           <Tabs value={orderType} onValueChange={(v: any) => setOrderType(v)}>
             <TabsList className="grid w-full grid-cols-2 bg-zinc-900/50 h-10 p-1 border border-zinc-800">
               <TabsTrigger value="market" className="text-[10px] font-black uppercase tracking-widest data-[state=active]:bg-zinc-800">Market</TabsTrigger>
               <TabsTrigger value="pending" className="text-[10px] font-black uppercase tracking-widest data-[state=active]:bg-zinc-800">Pending</TabsTrigger>
             </TabsList>
           </Tabs>

           <div className="space-y-6">
              <div className="flex flex-col gap-2">
                 <div className="flex justify-between items-center">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Order Volume (Lots)</Label>
                    <span className="text-[9px] font-bold text-primary">Institutional Limits</span>
                 </div>
                 <div className="flex items-center gap-2">
                    <button onClick={() => setLots(Math.max(0.01, lots - 0.01))} className="w-10 h-11 bg-zinc-900 hover:bg-zinc-800 flex items-center justify-center rounded-lg border border-zinc-800 transition-colors"><Minus className="w-4 h-4" /></button>
                    <Input 
                      type="number" 
                      step="0.01" 
                      min="0.01"
                      value={lots} 
                      onChange={(e) => setLots(parseFloat(e.target.value) || 0)}
                      className="h-11 bg-zinc-900/50 border-zinc-800 text-center font-mono font-bold text-lg text-white rounded-lg focus:ring-1 focus:ring-primary"
                    />
                    <button onClick={() => setLots(lots + 0.01)} className="w-10 h-11 bg-zinc-900 hover:bg-zinc-800 flex items-center justify-center rounded-lg border border-zinc-800 transition-colors"><Plus className="w-4 h-4" /></button>
                 </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Stop Loss</Label>
                    <Input placeholder="0.00000" value={sl} onChange={(e) => setSl(e.target.value)} className="h-11 bg-zinc-900/50 border-zinc-800 font-mono text-center text-sm" />
                 </div>
                 <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Take Profit</Label>
                    <Input placeholder="0.00000" value={tp} onChange={(e) => setTp(e.target.value)} className="h-11 bg-zinc-900/50 border-zinc-800 font-mono text-center text-sm" />
                 </div>
              </div>

              <div className="space-y-4">
                <Button 
                  className="w-full h-16 bg-emerald-600 hover:bg-emerald-700 text-white flex flex-col items-center justify-center gap-0.5 rounded-xl border border-emerald-500/20 shadow-lg shadow-emerald-900/10 transition-all active:scale-95"
                  onClick={() => placeTrade("buy")}
                  disabled={actionLoading || !currentAccount || currentAccount.status !== 'active' || !currentPriceData}
                >
                  <span className="font-black text-sm tracking-widest">BUY BY MARKET</span>
                  <span className="font-mono text-xs opacity-80">{formatPrice(currentPriceData?.ask, selectedSymbol)}</span>
                </Button>

                <Button 
                  className="w-full h-16 bg-red-600 hover:bg-red-700 text-white flex flex-col items-center justify-center gap-0.5 rounded-xl border border-red-500/20 shadow-lg shadow-red-900/10 transition-all active:scale-95"
                  onClick={() => placeTrade("sell")}
                  disabled={actionLoading || !currentAccount || currentAccount.status !== 'active' || !currentPriceData}
                >
                  <span className="font-black text-sm tracking-widest">SELL BY MARKET</span>
                  <span className="font-mono text-xs opacity-80">{formatPrice(currentPriceData?.bid, selectedSymbol)}</span>
                </Button>
              </div>

              <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800 space-y-3">
                 <div className="flex justify-between items-center text-[10px] font-bold">
                    <span className="text-zinc-500 uppercase">Margin Required</span>
                    <span className="text-white">${marginRequired.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                 </div>
                 <div className="flex justify-between items-center text-[10px] font-bold">
                    <span className="text-zinc-500 uppercase">Spread Cost</span>
                    <span className="text-white">${spreadCost.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                 </div>
                 <div className="flex justify-between items-center text-[10px] font-bold">
                    <span className="text-zinc-500 uppercase">Lot Value</span>
                    <span className="text-white">${lotValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                 </div>
              </div>
           </div>

           <div className="mt-auto space-y-4">
              <div className="flex items-center gap-2 p-3 bg-primary/5 border border-primary/10 rounded-lg">
                 <Zap className="w-3.5 h-3.5 text-primary" />
                 <p className="text-[10px] text-primary/80 font-bold leading-tight">Institutional execution enabled. Leverage: 1:100</p>
              </div>
           </div>
        </aside>
      </div>
    </div>
  );
}

function ToolIcon({ icon, active = false }: { icon: React.ReactNode, active?: boolean }) {
  return (
    <button className={cn(
      "w-9 h-9 flex items-center justify-center rounded-lg transition-all",
      active ? "bg-primary/10 text-primary" : "text-zinc-600 hover:text-zinc-300 hover:bg-white/5"
    )}>
      {active ? icon : <div className="scale-90">{icon}</div>}
    </button>
  );
}

function AccountMetric({ label, value }: { label: string, value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-[9px] font-black uppercase text-zinc-500 tracking-widest">{label}</p>
      <p className="text-base font-bold text-white font-mono">{value}</p>
    </div>
  );
}
