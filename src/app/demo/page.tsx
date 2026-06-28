'use client';

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { useCollection } from "@/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  Loader2, ArrowLeft, Minus, Plus, Activity, Bell, Globe, Settings, 
  Crosshair, Circle, Slash, ArrowUpRight, ArrowLeftRight, ArrowRight,
  Square, Triangle, Type, Pencil, Magnet, Undo, Trash2, Ruler,
  TrendingUp, TrendingDown
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { where, orderBy, limit } from "firebase/firestore";
import { createChart, ColorType, IChartApi, ISeriesApi, PriceScaleMode } from 'lightweight-charts';
import Link from 'next/link';
import Image from 'next/image';
import { useBrandSettings } from '@/hooks/use-brand-settings';
import { PositionsPanel } from './PositionsPanel';
import { DrawingLayer } from "./DrawingLayer";
import { ChartSettingsModal } from "./ChartSettingsModal";

const SYMBOLS = ["XAUUSD", "BTCUSD", "ETHUSD", "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCHF"];
const TIMEFRAMES = [
  { label: '1m', value: '1min' }, { label: '5m', value: '5min' }, { label: '15m', value: '15min' },
  { label: '30m', value: '30min' }, { label: '1h', value: '1h' }, { label: '2h', value: '2h' },
  { label: '4h', value: '4h' }, { label: '1D', value: '1day' }, { label: '1W', value: '1week' },
  { label: '1M', value: '1month' },
];

const TIMEZONES = [
  { label: 'Local Time', value: 'local' }, { label: 'UTC', value: 'UTC' },
  { label: 'New York (EST)', value: 'America/New_York' }, { label: 'London (GMT)', value: 'Europe/London' },
  { label: 'Tokyo (JST)', value: 'Asia/Tokyo' }, { label: 'Sydney (AEST)', value: 'Australia/Sydney' },
];

const intervalSecondsMap: Record<string, number> = {
  '1min': 60, '5min': 300, '15min': 900, '30min': 1800, '1h': 3600, '2h': 7200, '4h': 14400, '1day': 86400, '1week': 604800, '1month': 2592000
};

export default function DemoPage() {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const branding = useBrandSettings();

  const [pageReady, setPageReady] = useState(false);
  const [currentAccountId, setCurrentAccountId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [isChartLoading, setIsChartLoading] = useState(true);
  const [isChartReady, setIsChartReady] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState("XAUUSD");
  const [selectedInterval, setSelectedInterval] = useState("1min");
  const [selectedTimezone, setSelectedTimezone] = useState("local");
  const [chartType, setChartType] = useState<string>("candles");
  const [lots, setLots] = useState(0.10);
  const [sl, setSl] = useState<string>("");
  const [tp, setTp] = useState<string>("");
  const [livePrices, setLivePrices] = useState<Record<string, any>>({});
  const [orderType, setOrderType] = useState<"market" | "pending">("market");
  const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);
  const [activeTool, setActiveTool] = useState<string>('crosshair');
  const [magnetMode, setMagnetMode] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [chartSettings, setChartSettings] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('chartGlobalSettings');
      if (saved) return JSON.parse(saved);
    }
    return {
      scales: { mode: 'auto', type: 'regular', position: 'right', labels: { currentPrice: true, ohlc: true, prevClose: false, indicators: true, tradeLines: true }, lines: { lastPrice: true, prevClose: false, bid: true, ask: true, gridVert: true, gridHorz: true }, showPlusButton: true },
      canvas: { background: { type: 'solid', color: '#09090b', opacity: 1 }, grid: { type: 'both', vert: { color: '#18181b', opacity: 1 }, horz: { color: '#18181b', opacity: 1 } }, sessionBreaks: { enabled: false, color: '#27272a', width: 1, style: 2 }, crosshair: { mode: 'normal', color: '#71717a', width: 1, style: 1 }, watermark: { visible: false, color: 'rgba(171, 190, 192, 0.3)', fontSize: 48, text: '' }, scales: { textColor: '#71717a', fontSize: 12 }, candles: { upColor: '#10b981', downColor: '#ef4444', borderVisible: true, borderUpColor: '#10b981', borderDownColor: '#ef4444', wickUpColor: '#10b981', wickDownColor: '#ef4444' }, theme: 'dark' }
    };
  });

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<IChartApi | null>(null);
  const mainSeriesRef = useRef<ISeriesApi<any> | null>(null);
  const currentCandleRef = useRef<any>(null);

  // BUG 1 FIX: Wait for accounts and sync currentAccountId
  const accountConstraints = useMemo(() => user?.uid ? [where("userId", "==", user.uid)] : [], [user?.uid]);
  const { data: accounts, loading: accountsLoading } = useCollection<any>(user?.uid ? "demoAccounts" : null, accountConstraints);

  useEffect(() => {
    if (!accountsLoading) {
      if (accounts.length > 0 && !currentAccountId) {
        setCurrentAccountId(accounts[0].id);
      }
      setPageReady(true);
    }
  }, [accountsLoading, accounts, currentAccountId]);

  useEffect(() => {
    const t = setTimeout(() => setPageReady(true), 3000);
    return () => clearTimeout(t);
  }, []);

  const applyGlobalSettings = useCallback(() => {
    if (!chartInstanceRef.current) return;
    const chart = chartInstanceRef.current;
    const modeMap: Record<string, PriceScaleMode> = { regular: PriceScaleMode.Normal, percent: PriceScaleMode.Percentage, indexed: PriceScaleMode.IndexedTo100, log: PriceScaleMode.Logarithmic };
    const targetScaleId = chartSettings.scales.position === 'left' ? 'left' : 'right';
    const otherScaleId = chartSettings.scales.position === 'left' ? 'right' : 'left';
    try {
      chart.priceScale(targetScaleId).applyOptions({ visible: true, mode: modeMap[chartSettings.scales.type] || PriceScaleMode.Normal, autoScale: chartSettings.scales.mode === 'auto', borderColor: chartSettings.canvas.scales.textColor + '44' });
      chart.priceScale(otherScaleId).applyOptions({ visible: false });
      chart.applyOptions({
        layout: { background: { type: chartSettings.canvas.background.type === 'gradient' ? ColorType.VerticalGradient : ColorType.Solid, color: chartSettings.canvas.background.color }, textColor: chartSettings.canvas.scales.textColor, fontSize: chartSettings.canvas.scales.fontSize },
        grid: { vertLines: { visible: chartSettings.scales.lines.gridVert && (chartSettings.canvas.grid.type === 'vertical' || chartSettings.canvas.grid.type === 'both'), color: chartSettings.canvas.grid.vert.color }, horzLines: { visible: chartSettings.scales.lines.gridHorz && (chartSettings.canvas.grid.type === 'horizontal' || chartSettings.canvas.grid.type === 'both'), color: chartSettings.canvas.grid.horz.color } },
        crosshair: { horzLine: { labelVisible: chartSettings.scales.labels.currentPrice, color: chartSettings.canvas.crosshair.color }, vertLine: { labelVisible: chartSettings.scales.labels.ohlc, color: chartSettings.canvas.crosshair.color } },
        watermark: { visible: chartSettings.canvas.watermark.visible, color: chartSettings.canvas.watermark.color, text: chartSettings.canvas.watermark.text || selectedSymbol }
      });
      if (mainSeriesRef.current) mainSeriesRef.current.applyOptions({ ...chartSettings.canvas.candles, lastValueVisible: chartSettings.scales.labels.currentPrice, title: chartSettings.scales.labels.ohlc ? selectedSymbol : '' });
    } catch (e) {}
  }, [chartSettings, selectedSymbol]);

  useEffect(() => {
    localStorage.setItem('chartGlobalSettings', JSON.stringify(chartSettings));
    applyGlobalSettings();
  }, [chartSettings, applyGlobalSettings]);

  useEffect(() => {
    if (!chartContainerRef.current || !pageReady) return;
    const chart = createChart(chartContainerRef.current, {
      layout: { background: { type: ColorType.Solid, color: '#09090b' }, textColor: '#71717a' },
      grid: { vertLines: { color: '#18181b' }, horzLines: { color: '#18181b' } },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight || 480,
      timeScale: { borderColor: '#27272a', timeVisible: true, secondsVisible: false },
    });
    chartInstanceRef.current = chart;
    setIsChartReady(true);
    applyGlobalSettings();
    const handleResize = () => { if (chartContainerRef.current && chartInstanceRef.current) chartInstanceRef.current.applyOptions({ width: chartContainerRef.current.clientWidth }); };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartInstanceRef.current) { try { chartInstanceRef.current.remove(); } catch (e) {} chartInstanceRef.current = null; }
      mainSeriesRef.current = null; setIsChartReady(false);
    };
  }, [pageReady, applyGlobalSettings]);

  useEffect(() => {
    if (!isChartReady || !chartInstanceRef.current) return;
    let isMounted = true;
    const fetchHistory = async () => {
      setIsChartLoading(true);
      try {
        const res = await fetch(`/api/terminal/candles?symbol=${selectedSymbol}&interval=${selectedInterval}`);
        const data = await res.json();
        if (!isMounted || !chartInstanceRef.current) return;
        const candles = data.candles || [];
        if (candles.length > 0) {
          if (mainSeriesRef.current) {
            chartInstanceRef.current.removeSeries(mainSeriesRef.current);
          }
          const opts = { priceFormat: { type: 'price', precision: selectedSymbol === "USDJPY" ? 3 : (selectedSymbol === "XAUUSD" || selectedSymbol === "BTCUSD" || selectedSymbol === "ETHUSD" ? 2 : 5) }, lastValueVisible: chartSettings.scales.labels.currentPrice, title: chartSettings.scales.labels.ohlc ? selectedSymbol : '', ...chartSettings.canvas.candles };
          if (chartType === 'candles') mainSeriesRef.current = chartInstanceRef.current.addCandlestickSeries(opts);
          else if (chartType === 'bars') mainSeriesRef.current = chartInstanceRef.current.addBarSeries(opts);
          else if (chartType === 'line') mainSeriesRef.current = chartInstanceRef.current.addLineSeries(opts);
          else if (chartType === 'area') mainSeriesRef.current = chartInstanceRef.current.addAreaSeries({ ...opts, topColor: chartSettings.canvas.candles.upColor + '66', bottomColor: 'rgba(0,0,0,0)', lineColor: chartSettings.canvas.candles.upColor });
          if (mainSeriesRef.current) {
            mainSeriesRef.current.setData(chartType === 'candles' || chartType === 'bars' ? candles : candles.map((c: any) => ({ time: c.time, value: c.close })));
            currentCandleRef.current = candles[candles.length - 1];
          }
          chartInstanceRef.current.timeScale().fitContent();
        }
      } catch (e) {} finally { if (isMounted) setIsChartLoading(false); }
    };
    fetchHistory();
    return () => { isMounted = false; };
  }, [isChartReady, selectedSymbol, selectedInterval, chartType]);

  // BUG 2 FIX: Live price polling and candle updates
  useEffect(() => {
    if (!pageReady || !isChartReady) return;

    const fetchPrices = async () => {
      try {
        const res = await fetch('/api/terminal/live-prices');
        if (!res.ok) return;
        const prices = await res.json();
        setLivePrices(prices);

        // Update real-time candle
        try {
          if (mainSeriesRef.current && chartInstanceRef.current) {
            const secs = intervalSecondsMap[selectedInterval] || 60;
            const now = Math.floor(Date.now() / 1000);
            const candleTime = Math.floor(now / secs) * secs;
            const price = prices[selectedSymbol]?.price;

            if (price && price > 0) {
              const cur = currentCandleRef.current;
              if (!cur || cur.time !== candleTime) {
                currentCandleRef.current = { time: candleTime, open: price, high: price, low: price, close: price };
              } else {
                cur.high = Math.max(cur.high, price);
                cur.low = Math.min(cur.low, price);
                cur.close = price;
              }
              mainSeriesRef.current.update(currentCandleRef.current);
            }
          }
        } catch (err) { /* chart disposed */ }
      } catch (e) {}
    };

    fetchPrices();
    const interval = setInterval(fetchPrices, 3000);
    return () => clearInterval(interval);
  }, [pageReady, isChartReady, selectedInterval, selectedSymbol]);

  // BUG 3 FIX: Robust trade execution
  async function placeTrade(type: 'buy' | 'sell') {
    try {
      setActionLoading(true);
      if (!user) {
        toast({ title: "Auth Required", description: "Login to execute trades", variant: "destructive" });
        return;
      }
      if (!currentAccountId) {
        toast({ title: "No Account", description: "Please select a trading node", variant: "destructive" });
        return;
      }

      // Fetch fresh price directly for high-fidelity execution
      const pricesRes = await fetch('/api/terminal/live-prices');
      const prices = await pricesRes.json();
      const priceData = prices[selectedSymbol];

      if (!priceData || !priceData.price) {
        toast({ title: "Price Sync Error", description: `No live feed for ${selectedSymbol}. Try again.`, variant: "destructive" });
        return;
      }

      const executionPrice = type === 'buy' ? (priceData.ask || priceData.price) : (priceData.bid || priceData.price);
      const token = await user.getIdToken(true);

      const res = await fetch('/api/terminal/trades', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          accountId: currentAccountId,
          symbol: selectedSymbol,
          type,
          lots,
          price: executionPrice,
          sl: parseFloat(sl) > 0 ? parseFloat(sl) : null,
          tp: parseFloat(tp) > 0 ? parseFloat(tp) : null,
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({ title: "Execution Failed", description: err.error || `Server Error: ${res.status}`, variant: "destructive" });
        return;
      }

      toast({ title: `✓ ${type.toUpperCase()} Filled`, description: `${selectedSymbol} @ ${executionPrice.toFixed(selectedSymbol === "USDJPY" ? 3 : 5)}` });
    } catch(e: any) {
      toast({ title: "System Error", description: e.message, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  }

  const tradeConstraints = useMemo(() => (user?.uid && currentAccountId) ? [where("userId", "==", user.uid), where("accountId", "==", currentAccountId), where("status", "==", "open")] : [], [user?.uid, currentAccountId]);
  const { data: openTrades } = useCollection<any>(tradeConstraints.length ? "demoTrades" : null, tradeConstraints);
  const { data: closedTrades } = useCollection<any>((user?.uid && currentAccountId) ? "demoTrades" : null, useMemo(() => (user?.uid && currentAccountId) ? [where("userId", "==", user.uid), where("accountId", "==", currentAccountId), where("status", "==", "closed"), orderBy("closedAt", "desc"), limit(50)] : [], [user?.uid, currentAccountId]));
  const { data: alerts, loading: alertsLoading } = useCollection<any>(user?.uid ? "alerts" : null, useMemo(() => user?.uid ? [where("userId", "==", user.uid), orderBy("createdAt", "desc")] : [], [user?.uid]));

  if (authLoading) return <div className="fixed inset-0 bg-[#09090b] flex items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>;

  return (
    <div className="fixed inset-0 h-screen w-screen bg-[#09090b] flex flex-col text-zinc-300 font-sans select-none overflow-hidden">
      <header className="h-12 border-b border-zinc-800 flex items-center justify-between px-4 bg-zinc-950 shrink-0 z-50">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2"><Image src={branding.logoUrl} alt="Logo" width={24} height={24} className="rounded-full" /><span className="font-bold text-sm tracking-tight text-white">PrimeFunded Trade</span></div>
          <Link href="/dashboard" className="flex items-center gap-2 text-xs font-bold text-zinc-500 hover:text-white transition-colors border-l border-zinc-800 pl-6 h-12"><ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard</Link>
        </div>
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" className="h-9 px-3 gap-2 text-xs font-bold text-zinc-400" onClick={() => setIsAlertModalOpen(true)}><Bell className="w-4 h-4" /> Set Alert</Button>
          <Select value={selectedTimezone} onValueChange={setSelectedTimezone}><SelectTrigger className="bg-transparent border-none h-9 w-40 text-xs font-bold"><Globe className="w-3.5 h-3.5 mr-2" /><SelectValue /></SelectTrigger><SelectContent>{TIMEZONES.map(tz => <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>)}</SelectContent></Select>
          <Select value={chartType} onValueChange={setChartType}><SelectTrigger className="bg-transparent border-none h-9 w-32 text-xs font-bold"><Activity className="w-3.5 h-3.5 mr-2" /><SelectValue /></SelectTrigger><SelectContent><SelectItem value="candles">Candles</SelectItem><SelectItem value="bars">Bars</SelectItem><SelectItem value="line">Line</SelectItem><SelectItem value="area">Area</SelectItem></SelectContent></Select>
          <Button variant="ghost" size="sm" className="h-9 px-3 text-zinc-400" onClick={() => setIsSettingsOpen(true)}><Settings className="w-4 h-4" /></Button>
          <Select value={currentAccountId ?? ""} onValueChange={setCurrentAccountId}><SelectTrigger className="bg-transparent border-none h-12 w-56 text-xs font-bold"><SelectValue placeholder="Select Account" /></SelectTrigger><SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>)}</SelectContent></Select>
        </div>
      </header>

      <div className="flex-1 flex min-h-0 relative">
        <div className="flex-1 flex flex-col min-w-0 bg-[#09090b]">
          <div className="h-10 border-b border-zinc-800 flex items-center px-1 gap-1 bg-zinc-950/50 overflow-x-auto no-scrollbar shrink-0">
            {SYMBOLS.map((s) => (
              <button key={s} onClick={() => setSelectedSymbol(s)} className={cn("px-4 h-full flex items-center gap-3 transition-all border-b-2", s === selectedSymbol ? "border-primary bg-primary/5" : "border-transparent hover:bg-white/5")}>
                <span className={cn("font-bold text-[11px]", s === selectedSymbol ? "text-white" : "text-zinc-500")}>{s}</span>
              </button>
            ))}
          </div>

          <div className="flex-1 relative min-h-0 bg-[#09090b] flex">
            <aside className="w-[44px] border-r border-[#2a2a2a] bg-[#1a1a1a] flex flex-col items-center py-2 z-40 shrink-0">
              <TooltipProvider delayDuration={300}>
                <ToolIcon name="Crosshair" icon={<Crosshair />} active={activeTool === 'crosshair'} onClick={() => setActiveTool('crosshair')} />
                <ToolIcon name="Dot" icon={<Circle className="fill-current scale-[0.3]" />} active={activeTool === 'dot'} onClick={() => setActiveTool('dot')} />
                <div className="h-[1px] bg-[#2a2a2a] my-2 w-7 shrink-0" />
                <ToolIcon name="Trend Line" icon={<Slash />} active={activeTool === 'trend'} onClick={() => setActiveTool('trend')} />
                <ToolIcon name="Ray" icon={<ArrowUpRight />} active={activeTool === 'ray'} onClick={() => setActiveTool('ray')} />
                <ToolIcon name="Extended Line" icon={<ArrowLeftRight />} active={activeTool === 'extended'} onClick={() => setActiveTool('extended')} />
                <ToolIcon name="Horizontal Line" icon={<Minus />} active={activeTool === 'hline'} onClick={() => setActiveTool('hline')} />
                <ToolIcon name="Horizontal Ray" icon={<ArrowRight />} active={activeTool === 'hray'} onClick={() => setActiveTool('hray')} />
                <div className="h-[1px] bg-[#2a2a2a] my-2 w-7 shrink-0" />
                <ToolIcon name="Rectangle" icon={<Square />} active={activeTool === 'rect'} onClick={() => setActiveTool('rect')} />
                <ToolIcon name="Circle" icon={<Circle />} active={activeTool === 'circle'} onClick={() => setActiveTool('circle')} />
                <ToolIcon name="Triangle" icon={<Triangle />} active={activeTool === 'triangle'} onClick={() => setActiveTool('triangle')} />
                <div className="h-[1px] bg-[#2a2a2a] my-2 w-7 shrink-0" />
                <ToolIcon name="Long Position" icon={<TrendingUp className="text-emerald-500" />} active={activeTool === 'long'} onClick={() => setActiveTool('long')} />
                <ToolIcon name="Short Position" icon={<TrendingDown className="text-red-500" />} active={activeTool === 'short'} onClick={() => setActiveTool('short')} />
                <ToolIcon name="Price Range" icon={<Ruler />} active={activeTool === 'measure'} onClick={() => setActiveTool('measure')} />
                <div className="h-[1px] bg-[#2a2a2a] my-2 w-7 shrink-0" />
                <ToolIcon name="Text" icon={<Type />} active={activeTool === 'text'} onClick={() => setActiveTool('text')} />
                <ToolIcon name="Brush" icon={<Pencil />} active={activeTool === 'brush'} onClick={() => setActiveTool('brush')} />
                <div className="mt-auto flex flex-col gap-0 w-full items-center">
                  <ToolIcon name="Magnet Mode" icon={<Magnet className={cn(magnetMode && "text-primary")} />} onClick={() => setMagnetMode(!magnetMode)} />
                  <div className="h-[1px] bg-[#2a2a2a] my-2 w-7 shrink-0" />
                  <ToolIcon name="Remove All" icon={<Trash2 />} onClick={() => setActiveTool('eraser')} />
                </div>
              </TooltipProvider>
            </aside>

            <div className="flex-1 relative">
              {isChartLoading && <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-zinc-950/80 backdrop-blur-sm"><Loader2 className="animate-spin text-primary" /><p className="text-[10px] uppercase font-black tracking-widest mt-4">Syncing Feed...</p></div>}
              <div ref={chartContainerRef} className="h-full w-full relative" />
              {isChartReady && chartInstanceRef.current && mainSeriesRef.current && (
                <DrawingLayer chart={chartInstanceRef.current} series={mainSeriesRef.current} symbol={selectedSymbol} activeTool={activeTool} setActiveTool={setActiveTool} />
              )}
            </div>
          </div>
          
          <PositionsPanel openTrades={openTrades} closedTrades={closedTrades} alerts={alerts} livePrices={livePrices} closeTrade={async () => {}} deleteAlert={async () => {}} user={user} alertsLoading={alertsLoading} />
        </div>

        <aside className="w-80 border-l border-zinc-800 bg-zinc-950 p-6 flex flex-col gap-8 shrink-0 overflow-y-auto custom-scrollbar z-50">
           <Tabs value={orderType} onValueChange={(v: any) => setOrderType(v)}><TabsList className="grid w-full grid-cols-2 bg-zinc-900/50 h-10 p-1 border border-zinc-800"><TabsTrigger value="market" className="text-[10px] font-black uppercase">Market</TabsTrigger><TabsTrigger value="pending" className="text-[10px] font-black uppercase">Pending</TabsTrigger></TabsList></Tabs>
           <div className="space-y-6">
              <div className="flex flex-col gap-2">
                 <Label className="text-[10px] font-black uppercase text-zinc-500">Volume (Lots)</Label>
                 <div className="flex items-center gap-2">
                    <button onClick={() => setLots(Math.max(0.01, lots - 0.01))} className="w-10 h-11 bg-zinc-900 rounded-lg border border-zinc-800"><Minus className="w-4 h-4" /></button>
                    <Input type="number" step="0.01" value={lots} onChange={(e) => setLots(parseFloat(e.target.value) || 0)} className="h-11 bg-zinc-900/50 text-center font-mono font-bold text-white" />
                    <button onClick={() => setLots(lots + 0.01)} className="w-10 h-11 bg-zinc-900 rounded-lg border border-zinc-800"><Plus className="w-4 h-4" /></button>
                 </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-2"><Label className="text-[10px] font-black uppercase">Stop Loss</Label><Input placeholder="0.00" value={sl} onChange={(e) => setSl(e.target.value)} className="h-11 bg-zinc-900/50" /></div>
                 <div className="space-y-2"><Label className="text-[10px] font-black uppercase">Take Profit</Label><Input placeholder="0.00" value={tp} onChange={(e) => setTp(e.target.value)} className="h-11 bg-zinc-900/50" /></div>
              </div>
              <div className="space-y-4">
                <button 
                  type="button" 
                  onClick={() => placeTrade('buy')}
                  disabled={actionLoading}
                  className="w-full h-16 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-sm tracking-widest transition-all active:scale-95 disabled:opacity-50"
                >
                  {actionLoading ? <Loader2 className="animate-spin w-6 h-6 mx-auto" /> : 'BUY BY MARKET'}
                </button>
                <button 
                  type="button" 
                  onClick={() => placeTrade('sell')}
                  disabled={actionLoading}
                  className="w-full h-16 bg-red-600 hover:bg-red-700 text-white rounded-xl font-black text-sm tracking-widest transition-all active:scale-95 disabled:opacity-50"
                >
                  {actionLoading ? <Loader2 className="animate-spin w-6 h-6 mx-auto" /> : 'SELL BY MARKET'}
                </button>
              </div>
           </div>
        </aside>
      </div>

      <ChartSettingsModal open={isSettingsOpen} onOpenChange={setIsSettingsOpen} settings={chartSettings} onSettingsChange={setChartSettings} onResetScale={() => {}} />
      <Dialog open={isAlertModalOpen} onOpenChange={setIsAlertModalOpen}><DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-sm">
        <div className="p-6">
          <h2 className="text-xl font-bold mb-4">Set Price Alert</h2>
          <Button className="w-full h-12 font-black cyan-box-glow" onClick={() => setIsAlertModalOpen(false)}>CREATE ALERT</Button>
        </div>
      </DialogContent></Dialog>
    </div>
  );
}

function ToolIcon({ name, icon, active = false, onClick, className }: { name: string, icon: React.ReactNode, active?: boolean, onClick?: () => void, className?: string }) {
  const isInteractive = !!onClick;
  const Comp = isInteractive ? 'div' : 'span';
  
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Comp 
          onClick={onClick}
          role={isInteractive ? 'button' : undefined}
          tabIndex={isInteractive ? 0 : undefined}
          onKeyDown={isInteractive ? (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onClick?.();
            }
          } : undefined}
          className={cn(
            "w-9 h-9 flex items-center justify-center rounded-md transition-all shrink-0 outline-none my-[1px]", 
            active ? "bg-[#2962ff] text-white" : "text-[#888] hover:text-white hover:bg-[#2a2a2a]",
            isInteractive ? "cursor-pointer" : "cursor-default",
            className
          )}
        >
          <div className="flex items-center justify-center">
            {icon}
          </div>
        </Comp>
      </TooltipTrigger>
      <TooltipContent side="right" className="bg-[#1e222d] border-[#2a2a2a] text-white font-bold text-[10px] uppercase shadow-2xl z-[100]">{name}</TooltipContent>
    </Tooltip>
  );
}
