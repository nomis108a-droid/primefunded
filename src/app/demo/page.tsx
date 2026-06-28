
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
  XCircle, 
  Loader2,
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
  Magnet,
  Zap,
  Eraser,
  TrendingUp,
  AlertTriangle,
  ShoppingBag,
  Clock
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { where, orderBy, limit } from "firebase/firestore";
import { createChart, ColorType, IChartApi, ISeriesApi, IPriceLine } from 'lightweight-charts';
import Link from 'next/link';
import Image from 'next/image';
import { useBrandSettings } from '@/hooks/use-brand-settings';
import { BollingerBands } from 'technicalindicators';
import { format, differenceInSeconds } from 'date-fns';
import { getTradeDate, formatDuration } from '@/lib/tradeUtils';

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
  const { user, userData, loading: authLoading } = useAuth();
  const db = useFirestore();
  const { toast } = useToast();
  const branding = useBrandSettings();

  const [currentAccountId, setCurrentAccountId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [isChartLoading, setIsChartLoading] = useState(true);
  const [isChartReady, setIsChartReady] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState("XAUUSD");
  const [selectedInterval, setSelectedInterval] = useState("1min");
  const [lots, setLots] = useState(0.10);
  const [sl, setSl] = useState<string>("");
  const [tp, setTp] = useState<string>("");
  const [livePrices, setLivePrices] = useState<Record<string, any>>({});
  const [activeBottomTab, setActiveBottomTab] = useState("positions");
  const [orderType, setOrderType] = useState<"market" | "pending">("market");
  const [isMarketClosed, setIsMarketClosed] = useState(false);
  const [now, setNow] = useState(new Date());
  
  const [indicators, setIndicators] = useState({
    rsi: false,
    bb: false,
    ma20: true,
    ma50: true
  });

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const currentCandleRef = useRef<{time:number, open:number, high:number, low:number, close:number} | null>(null);
  const indicatorSeriesRef = useRef<any[]>([]);
  const priceLinesRef = useRef<IPriceLine[]>([]);

  // Live timer for rule enforcement reference
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fixed Price Polling
  useEffect(() => {
    let isMounted = true;
    const fetchPrices = async () => {
      try {
        const res = await fetch('/api/terminal/live-prices');
        if (!res.ok) return;
        const data = await res.json();
        if (isMounted && data && typeof data === 'object' && !data.error) {
          setLivePrices(data);
        }
      } catch (e: any) {
        console.warn('[Prices] fetch failed:', e.message);
      }
    };
    fetchPrices();
    const timer = window.setInterval(fetchPrices, 3000);
    return () => {
      isMounted = false;
      window.clearInterval(timer);
    }
  }, []);

  // 1. Initialize Chart Framework
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
      crosshair: { mode: 1 },
      handleScroll: true,
      handleScale: true,
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
    setIsChartReady(true);

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

  // 2. ISOLATED CANDLE FETCH (Stable State Machine)
  useEffect(() => {
    if (!isChartReady || !candleSeriesRef.current || !chartInstanceRef.current) return;
    
    let isMounted = true;
    currentCandleRef.current = null;
    
    // Clear data immediately to prevent stale visual overlap
    candleSeriesRef.current.setData([]);
    indicatorSeriesRef.current.forEach(s => {
      try { chartInstanceRef.current?.removeSeries(s); } catch (e) {}
    });
    indicatorSeriesRef.current = [];

    const fetchHistory = async () => {
      console.log(`[Chart-Fetch] Start for ${selectedSymbol} @ ${selectedInterval}`);
      setIsChartLoading(true);
      try {
        const res = await fetch(`/api/terminal/candles?symbol=${selectedSymbol}&interval=${selectedInterval}`);
        if (!res.ok) throw new Error(`HTTP ${res.status} - Feed Offline`);
        const data = await res.json();
        
        if (!isMounted) return;
        const candles = Array.isArray(data) ? data : (data.candles || []);
        setIsMarketClosed(!!data.isFallback);

        if (candles.length > 0) {
          candleSeriesRef.current?.setData(candles);
          
          // Re-render core indicators
          const closes = candles.map((c: any) => c.close);
          if (indicators.ma20) {
            const ma20Data = candles.map((c: any, i: number) => {
              if (i < 19) return null;
              const avg = closes.slice(i - 19, i + 1).reduce((a: number, b: number) => a + b, 0) / 20;
              return { time: c.time, value: avg };
            }).filter(Boolean);
            const line = chartInstanceRef.current?.addLineSeries({ color: '#eab308', lineWidth: 1, priceLineVisible: false });
            if (line) {
              line.setData(ma20Data as any);
              indicatorSeriesRef.current.push(line);
            }
          }
          chartInstanceRef.current?.timeScale().fitContent();
        }
      } catch (err: any) {
        console.warn("[Chart-Fetch] Historical data unavailable:", err.message);
      } finally {
        if (isMounted) {
          console.log("[Chart-Fetch] Before setLoading(false)");
          setIsChartLoading(false);
        }
      }
    };

    fetchHistory();
    return () => { isMounted = false; };
  }, [isChartReady, selectedSymbol, selectedInterval, indicators.ma20]);

  // 3. IMMEDIATE TICK SYNC (High Responsiveness)
  useEffect(() => {
    if (!candleSeriesRef.current || !livePrices[selectedSymbol]) return;
    const price = livePrices[selectedSymbol].price;
    if (!price || price <= 0) return;

    const intervalMap: Record<string, number> = {
      '1min': 60, '5min': 300, '15min': 900, '30min': 1800, '1h': 3600, '4h': 14400, '1day': 86400
    };
    const secs = intervalMap[selectedInterval] || 300;
    const nowTs = Math.floor(Date.now() / 1000);
    const candleTime = Math.floor(nowTs / secs) * secs;

    const cur = currentCandleRef.current;

    // Direct series update for fluid movement
    if (!cur || cur.time !== candleTime) {
      const newCandle = { time: candleTime, open: price, high: price, low: price, close: price };
      currentCandleRef.current = newCandle;
      candleSeriesRef.current.update(newCandle as any);
    } else {
      cur.high = Math.max(cur.high, price);
      cur.low = Math.min(cur.low, price);
      cur.close = price;
      candleSeriesRef.current.update({ 
        time: candleTime, 
        open: cur.open, 
        high: cur.high, 
        low: cur.low, 
        close: price 
      } as any);
    }
  }, [livePrices[selectedSymbol], selectedSymbol, selectedInterval]);

  const accountConstraints = useMemo(() => 
    user?.uid ? [where("userId", "==", user.uid)] : []
  , [user?.uid]);

  const { data: accounts } = useCollection<any>(user?.uid ? "demoAccounts" : null, accountConstraints);

  useEffect(() => {
    if (accounts.length > 0 && !currentAccountId) {
      setCurrentAccountId(accounts[0].id);
    }
  }, [accounts, currentAccountId]);

  const tradeConstraints = useMemo(() => {
    const uid = user?.uid;
    if (!uid || !currentAccountId) return [];
    return [
      where("userId", "==", uid),
      where("accountId", "==", currentAccountId),
      where("status", "==", "open")
    ];
  }, [user?.uid, currentAccountId]);

  const { data: openTrades } = useCollection<any>(
    (user?.uid && currentAccountId) ? "demoTrades" : null, 
    tradeConstraints
  );

  // Position Overlays on Chart
  useEffect(() => {
    if (!candleSeriesRef.current) return;

    priceLinesRef.current.forEach(line => candleSeriesRef.current?.removePriceLine(line));
    priceLinesRef.current = [];

    const relevantTrades = openTrades.filter(t => t.symbol === selectedSymbol);
    const pData = livePrices[selectedSymbol];

    relevantTrades.forEach(t => {
      let currentPnlText = "";
      if (pData) {
        const cp = t.type === 'buy' ? pData.bid : pData.ask;
        const cSize = t.symbol === 'XAUUSD' ? 100 : ['BTCUSD', 'ETHUSD', 'XRPUSD', 'SOLUSD', 'DOGEUSD', 'ADAUSD', 'BNBUSD'].includes(t.symbol) ? 1 : 100000;
        const pnl = t.type === 'buy' 
          ? (cp - t.openPrice) * cSize * t.lots
          : (t.openPrice - cp) * cSize * t.lots;
        currentPnlText = ` (${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} USD)`;
      }

      const entryLine = candleSeriesRef.current?.createPriceLine({
        price: t.openPrice,
        color: '#3b82f6',
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: `${t.type.toUpperCase()} ${t.lots}${currentPnlText}`,
      });
      if (entryLine) priceLinesRef.current.push(entryLine);

      if (t.sl) {
        const slLine = candleSeriesRef.current?.createPriceLine({
          price: t.sl, color: '#ef4444', lineWidth: 1, lineStyle: 1, axisLabelVisible: true, title: `SL: ${formatPrice(t.sl, selectedSymbol)}`,
        });
        if (slLine) priceLinesRef.current.push(slLine);
      }
      if (t.tp) {
        const tpLine = candleSeriesRef.current?.createPriceLine({
          price: t.tp, color: '#10b981', lineWidth: 1, lineStyle: 1, axisLabelVisible: true, title: `TP: ${formatPrice(t.tp, selectedSymbol)}`,
        });
        if (tpLine) priceLinesRef.current.push(tpLine);
      }
    });
  }, [openTrades, selectedSymbol, livePrices[selectedSymbol]]);

  const historyConstraints = useMemo(() => {
    const uid = user?.uid;
    if (!uid || !currentAccountId) return [];
    return [
      where("userId", "==", uid),
      where("accountId", "==", currentAccountId),
      where("status", "==", "closed"),
      orderBy("closedAt", "desc"),
      limit(50)
    ];
  }, [user?.uid, currentAccountId]);

  const { data: closedTrades } = useCollection<any>(
    (user?.uid && currentAccountId) ? "demoTrades" : null, 
    historyConstraints
  );

  const currentAccount = useMemo(() => accounts.find((a) => a.id === currentAccountId), [accounts, currentAccountId]);
  const currentPriceData = livePrices[selectedSymbol];

  const metrics = useMemo(() => {
    if (!currentAccount) return { equity: 0, floatingPnL: 0 };
    let floating = 0;
    openTrades.forEach(trade => {
      const priceData = livePrices[trade.symbol];
      if (priceData) {
        const cp = trade.type === 'buy' ? priceData.bid : priceData.ask;
        const cSize = trade.symbol === 'XAUUSD' ? 100 : ['BTCUSD', 'ETHUSD', 'XRPUSD', 'SOLUSD', 'DOGEUSD', 'ADAUSD', 'BNBUSD'].includes(trade.symbol) ? 1 : 100000;
        floating += trade.type === 'buy' 
          ? (cp - trade.openPrice) * cSize * trade.lots
          : (t.openPrice - cp) * cSize * trade.lots;
      }
    });
    return { equity: (currentAccount.balance || 0) + floating, floatingPnL: floating };
  }, [currentAccount, openTrades, livePrices]);

  const contractSize = useMemo(() => {
    const crypto = ['BTCUSD', 'ETHUSD', 'XRPUSD', 'SOLUSD', 'DOGEUSD', 'ADAUSD', 'BNBUSD'];
    if (crypto.includes(selectedSymbol)) return 1;
    if (selectedSymbol === 'XAUUSD') return 100;
    return 100000;
  }, [selectedSymbol]);

  const spread = useMemo(() => {
    if (!currentPriceData || !currentPriceData.ask || !currentPriceData.bid) return 0;
    return Math.max(0, currentPriceData.ask - currentPriceData.bid);
  }, [currentPriceData]);

  const marginRequired = useMemo(() => {
    const price = currentPriceData?.price || 0;
    if (price <= 0) return 0;
    return (lots * contractSize * price) / 100;
  }, [lots, contractSize, currentPriceData]);

  async function placeTrade(type: "buy" | "sell") {
    if (!user || !currentAccountId || !currentPriceData) return;
    setActionLoading(true);
    try {
      const token = await user.getIdToken();
      const executionPrice = type === 'buy' ? currentPriceData.ask : currentPriceData.bid;
      const res = await fetch("/api/terminal/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ accountId: currentAccountId, symbol: selectedSymbol, type, lots, price: executionPrice, sl: sl ? parseFloat(sl) : null, tp: tp ? parseFloat(tp) : null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.details || "Rejected.");
      toast({ title: "Order Executed", description: `${type.toUpperCase()} at ${executionPrice.toFixed(2)}` });
      setSl(""); setTp("");
    } catch (err: any) {
      toast({ variant: "destructive", title: "Execution Error", description: err.message });
    } finally {
      setActionLoading(false);
    }
  }

  async function closeTrade(tradeId: string, openedAt: any) {
    if (!user) return;
    const openDate = getTradeDate(openedAt);
    if (openDate) {
      const holdSecs = differenceInSeconds(new Date(), openDate);
      if (holdSecs < 120) {
        toast({ variant: "destructive", title: "Hold Time Violation", description: `Please wait ${120 - holdSecs}s before closing.` });
        return;
      }
    }

    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/terminal/trades/${tradeId}/close`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Rejected.");
      toast({ title: "Position Closed", description: `PnL: $${data.pnl?.toFixed(2) || '0.00'}` });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Closure Error", description: err.message });
    }
  }

  if (authLoading) {
    return (
      <div className="fixed inset-0 bg-[#09090b] flex flex-col items-center justify-center text-white">
        <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500 animate-pulse">Initializing Trading Protocol...</p>
      </div>
    );
  }

  if (!user) return null;

  const isAccountActive = currentAccount?.status?.toLowerCase() === 'active';

  return (
    <div className="fixed inset-0 h-screen w-screen bg-[#09090b] flex flex-col text-zinc-300 font-sans select-none overflow-hidden">
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
              <Badge className={cn("text-[10px] font-black uppercase h-5 px-3 border-none", isAccountActive ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500")}>{currentAccount.status}</Badge>
            </div>
          )}

          <div className="flex items-center gap-4">
            <Select value={currentAccountId ?? ""} onValueChange={setCurrentAccountId}>
              <SelectTrigger className="bg-transparent border-none h-12 w-56 text-xs font-bold hover:bg-white/5 transition-colors focus:ring-0">
                <SelectValue placeholder="Select Account" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id} className="focus:bg-zinc-800 cursor-pointer">{a.label}</SelectItem>
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
        <aside className="w-12 border-r border-zinc-800 bg-zinc-950 flex flex-col items-center py-4 gap-4 shrink-0">
          <ToolIcon icon={<MousePointer2 />} active />
          <ToolIcon icon={<LayoutGrid />} />
          <div className="h-px w-6 bg-zinc-800 my-1" />
          <ToolIcon icon={<Minus className="rotate-45" />} />
          <ToolIcon icon={<Minus />} />
          <ToolIcon icon={<TrendingUp />} />
          <div className="mt-auto flex flex-col gap-4">
            <ToolIcon icon={<Magnet />} />
            <ToolIcon icon={<Eraser />} />
          </div>
        </aside>

        <div className="flex-1 flex flex-col min-w-0 bg-[#09090b]">
          <div className="h-10 border-b border-zinc-800 flex items-center px-1 gap-1 bg-zinc-950/50 overflow-x-auto no-scrollbar shrink-0">
            {SYMBOLS.map((s) => {
              const p = livePrices[s];
              return (
                <button key={s} onClick={() => setSelectedSymbol(s)} className={cn("px-4 h-full flex items-center gap-3 transition-all border-b-2 relative shrink-0", s === selectedSymbol ? "border-primary bg-primary/5" : "border-transparent hover:bg-white/5")}>
                  <span className={cn("font-bold text-[11px]", s === selectedSymbol ? "text-white" : "text-zinc-500")}>{s}</span>
                  <span className="font-mono text-[10px] tabular-nums text-zinc-400">{formatPrice(p?.price, s)}</span>
                </button>
              );
            })}
          </div>

          <div className="h-10 border-b border-zinc-800 flex items-center justify-between px-4 bg-zinc-950/30 shrink-0">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-zinc-900/50 p-0.5 rounded-lg border border-zinc-800">
                {TIMEFRAMES.map((tf) => (
                  <button key={tf.value} onClick={() => setSelectedInterval(tf.value)} className={cn("px-2.5 py-1 rounded-md text-[10px] font-black uppercase transition-all", selectedInterval === tf.value ? "bg-zinc-800 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-300")}>{tf.label}</button>
                ))}
              </div>
              <div className="h-6 w-px bg-zinc-800 mx-2" />
              <button onClick={() => setIndicators(prev => ({...prev, ma20: !prev.ma20}))} className={cn("flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all", indicators.ma20 ? "bg-primary/10 text-primary" : "hover:bg-zinc-800")}><Layers className="w-4 h-4" /><span>Indicators</span></button>
            </div>
            <div className="flex items-center gap-4">
              <button className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-white transition-colors"><Maximize2 className="w-4 h-4" /></button>
            </div>
          </div>

          <div className="flex-1 relative min-h-0 bg-[#09090b]">
            {isChartLoading && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-zinc-950/80 backdrop-blur-sm">
                <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500">Syncing Feed...</p>
              </div>
            )}
            <div ref={chartContainerRef} className="h-full w-full relative" />
          </div>
          
          <Tabs value={activeBottomTab} onValueChange={setActiveBottomTab} className="h-[280px] border-t border-zinc-800 bg-zinc-950 flex flex-col shrink-0">
             <div className="px-4 h-10 border-b border-zinc-800 flex justify-between items-center bg-zinc-950/50">
                <TabsList className="bg-transparent h-full p-0 gap-6">
                  <TabsTrigger value="positions" className="bg-transparent border-none h-full text-[10px] font-black uppercase tracking-widest text-zinc-500 data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none shadow-none px-0">Open Positions ({openTrades.length})</TabsTrigger>
                  <TabsTrigger value="history" className="bg-transparent border-none h-full text-[10px] font-black uppercase tracking-widest text-zinc-500 data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none shadow-none px-0">Trade History</TabsTrigger>
                </TabsList>
             </div>

             <div className="flex-1 overflow-y-auto custom-scrollbar">
                <TabsContent value="positions" className="m-0 border-none outline-none">
                  <table className="w-full text-[11px] text-left">
                    <thead className="sticky top-0 bg-zinc-950/90 backdrop-blur-md text-zinc-500 uppercase text-[9px] font-black tracking-widest border-b border-zinc-800">
                      <tr>
                        <th className="py-2.5 px-4">Symbol</th>
                        <th className="py-2.5 px-2">Type</th>
                        <th className="py-2.5 px-2">Lots</th>
                        <th className="py-2.5 px-4">Entry</th>
                        <th className="py-2.5 px-4">S/L</th>
                        <th className="py-2.5 px-4">T/P</th>
                        <th className="py-2.5 px-4">Open Time</th>
                        <th className="py-2.5 px-4 text-right">PnL (USD)</th>
                        <th className="py-2.5 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-900">
                      {openTrades.length === 0 ? (
                        <tr><td colSpan={9} className="py-20 text-center italic text-zinc-600">No active positions.</td></tr>
                      ) : openTrades.map((t) => {
                        const pData = livePrices[t.symbol];
                        let pnl = 0;
                        if (pData) {
                           const cp = t.type === 'buy' ? pData.bid : pData.ask;
                           const cSize = t.symbol === 'XAUUSD' ? 100 : ['BTCUSD', 'ETHUSD', 'XRPUSD', 'SOLUSD', 'DOGEUSD', 'ADAUSD', 'BNBUSD'].includes(t.symbol) ? 1 : 100000;
                           pnl = t.type === 'buy' ? (cp - t.openPrice) * cSize * t.lots : (t.openPrice - cp) * cSize * t.lots;
                        }
                        const openDate = getTradeDate(t.openedAt);
                        return (
                          <tr key={t.id} className="hover:bg-white/5 group transition-colors">
                            <td className="py-2 px-4 font-bold text-white">{t.symbol}</td>
                            <td className="py-2 px-2"><span className={cn("font-black uppercase text-[10px]", t.type === 'buy' ? "text-emerald-500" : "text-red-500")}>{t.type}</span></td>
                            <td className="py-2 px-2 font-mono text-zinc-400">{t.lots.toFixed(2)}</td>
                            <td className="py-2 px-4 font-mono text-zinc-400">{formatPrice(t.openPrice, t.symbol)}</td>
                            <td className="py-2 px-4 font-mono text-zinc-600">{t.sl ? formatPrice(t.sl, t.symbol) : <button className="text-primary hover:underline text-[9px] font-bold">ADD</button>}</td>
                            <td className="py-2 px-4 font-mono text-zinc-600">{t.tp ? formatPrice(t.tp, t.symbol) : <button className="text-primary hover:underline text-[9px] font-bold">ADD</button>}</td>
                            <td className="py-2 px-4 font-mono text-zinc-500 text-[10px]">{openDate ? format(openDate, 'HH:mm:ss') : '—'}</td>
                            <td className={cn("py-2 px-4 text-right font-mono font-bold tabular-nums text-sm", pnl >= 0 ? "text-emerald-500" : "text-red-500")}>{pnl >= 0 ? '+' : ''}{pnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className="py-2 px-4 text-right"><button onClick={() => closeTrade(t.id, t.openedAt)} className="p-1 hover:bg-red-500/20 text-red-500/50 hover:text-red-500 transition-colors rounded"><XCircle className="w-4 h-4" /></button></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </TabsContent>
                
                <TabsContent value="history" className="m-0 border-none outline-none">
                   <table className="w-full text-[11px] text-left">
                    <thead className="sticky top-0 bg-zinc-950/90 backdrop-blur-md text-zinc-500 uppercase text-[9px] font-black tracking-widest border-b border-zinc-800">
                      <tr>
                        <th className="py-2.5 px-4">Symbol</th>
                        <th className="py-2.5 px-2">Type</th>
                        <th className="py-2.5 px-4">Lots</th>
                        <th className="py-2.5 px-4">Open</th>
                        <th className="py-2.5 px-4">Close</th>
                        <th className="py-2.5 px-4">Duration</th>
                        <th className="py-2.5 px-4 text-right">PnL</th>
                        <th className="py-2.5 px-4 text-right">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-900">
                      {closedTrades.map((t) => {
                        const oDate = getTradeDate(t.openedAt);
                        const cDate = getTradeDate(t.closedAt);
                        const dur = (oDate && cDate) ? formatDuration(differenceInSeconds(cDate, oDate)) : '—';
                        return (
                          <tr key={t.id} className="hover:bg-white/5 group transition-colors">
                            <td className="py-2 px-4 font-bold text-white">{t.symbol}</td>
                            <td className="py-2 px-2 uppercase font-bold text-[10px]">{t.type}</td>
                            <td className="py-2 px-4 font-mono">{t.lots}</td>
                            <td className="py-2 px-4 font-mono text-zinc-500">{formatPrice(t.openPrice, t.symbol)}</td>
                            <td className="py-2 px-4 font-mono text-zinc-500">{formatPrice(t.closePrice, t.symbol)}</td>
                            <td className="py-2 px-4 font-mono text-zinc-500">{dur}</td>
                            <td className={cn("py-2 px-4 text-right font-mono font-bold", (t.pnl || 0) >= 0 ? "text-emerald-500" : "text-red-500")}>{(t.pnl || 0).toLocaleString()}</td>
                            <td className="py-2 px-4 text-right text-zinc-600">{cDate ? format(cDate, 'MMM d, HH:mm') : '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                   </table>
                </TabsContent>
             </div>
          </Tabs>
        </div>

        <aside className="w-80 border-l border-zinc-800 bg-zinc-950 p-6 flex flex-col gap-8 shrink-0 overflow-y-auto custom-scrollbar z-50">
           <Tabs value={orderType} onValueChange={(v: any) => setOrderType(v)}>
             <TabsList className="grid w-full grid-cols-2 bg-zinc-900/50 h-10 p-1 border border-zinc-800">
               <TabsTrigger value="market" className="text-[10px] font-black uppercase tracking-widest data-[state=active]:bg-zinc-800">Market</TabsTrigger>
               <TabsTrigger value="pending" className="text-[10px] font-black uppercase tracking-widest data-[state=active]:bg-zinc-800">Pending</TabsTrigger>
             </TabsList>
           </Tabs>

           <div className="space-y-6">
              <div className="flex flex-col gap-2">
                 <div className="flex justify-between items-center"><Label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Order Volume (Lots)</Label></div>
                 <div className="flex items-center gap-2">
                    <button onClick={() => setLots(Math.max(0.01, lots - 0.01))} className="w-10 h-11 bg-zinc-900 hover:bg-zinc-800 flex items-center justify-center rounded-lg border border-zinc-800 transition-colors"><Minus className="w-4 h-4" /></button>
                    <Input type="number" step="0.01" min="0.01" value={lots} onChange={(e) => setLots(parseFloat(e.target.value) || 0)} className="h-11 bg-zinc-900/50 border-zinc-800 text-center font-mono font-bold text-lg text-white rounded-lg focus:ring-1 focus:ring-primary" />
                    <button onClick={() => setLots(lots + 0.01)} className="w-10 h-11 bg-zinc-900 hover:bg-zinc-800 flex items-center justify-center rounded-lg border border-zinc-800 transition-colors"><Plus className="w-4 h-4" /></button>
                 </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Stop Loss</Label><Input placeholder="0.00000" value={sl} onChange={(e) => setSl(e.target.value)} className="h-11 bg-zinc-900/50 border-zinc-800 font-mono text-center text-sm" /></div>
                 <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Take Profit</Label><Input placeholder="0.00000" value={tp} onChange={(e) => setTp(e.target.value)} className="h-11 bg-zinc-900/50 border-zinc-800 font-mono text-center text-sm" /></div>
              </div>
              <div className="space-y-4">
                {!currentAccount ? (
                  <Button asChild className="w-full h-16 rounded-xl cyan-box-glow font-black text-sm uppercase tracking-widest"><Link href="/challenges"><ShoppingBag className="w-5 h-5 mr-2" /> Start Challenge</Link></Button>
                ) : (
                  <>
                    <button type="button" className="w-full h-16 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white flex flex-col items-center justify-center gap-0.5 rounded-xl transition-all active:scale-95" onClick={() => placeTrade("buy")} disabled={actionLoading}><span className="font-black text-sm tracking-widest">{actionLoading ? "EXECUTING..." : !currentPriceData ? "PRICING OFFLINE" : "BUY BY MARKET"}</span>{currentPriceData && !actionLoading && (<span className="font-mono text-xs opacity-80">{formatPrice(currentPriceData?.ask, selectedSymbol)}</span>)}</button>
                    <button type="button" className="w-full h-16 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white flex flex-col items-center justify-center gap-0.5 rounded-xl transition-all active:scale-95" onClick={() => placeTrade("sell")} disabled={actionLoading}><span className="font-black text-sm tracking-widest">{actionLoading ? "EXECUTING..." : !currentPriceData ? "PRICING OFFLINE" : "SELL BY MARKET"}</span>{currentPriceData && isAccountActive && !actionLoading && (<span className="font-mono text-xs opacity-80">{formatPrice(currentPriceData?.bid, selectedSymbol)}</span>)}</button>
                  </>
                )}
              </div>
           </div>
           <div className="mt-auto space-y-4">
              <div className="flex items-center gap-2 p-3 bg-primary/5 border border-primary/10 rounded-lg"><Zap className="w-3.5 h-3.5 text-primary" /><p className="text-[10px] text-primary/80 font-bold leading-tight">Institutional execution enabled. Leverage: 1:100</p></div>
           </div>
        </aside>
      </div>
    </div>
  );
}

function ToolIcon({ icon, active = false }: { icon: React.ReactNode, active?: boolean }) {
  return (
    <button className={cn("w-9 h-9 flex items-center justify-center rounded-lg transition-all", active ? "bg-primary/10 text-primary" : "text-zinc-600 hover:text-zinc-300 hover:bg-white/5")}>{active ? icon : <div className="scale-90">{icon}</div>}</button>
  );
}
