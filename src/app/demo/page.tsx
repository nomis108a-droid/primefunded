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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { 
  Loader2, ArrowLeft, Minus, Activity, Bell, Globe, Settings, 
  Crosshair, Circle, Slash, ArrowUpRight, ArrowRight,
  Square, Type, Ruler, ZoomIn, ZoomOut, AlertCircle, Home, Eraser, SeparatorVertical,
  RefreshCw, Clock as ClockIcon, AlertTriangle, Lock, Unlock, Magnet,
  LayoutDashboard, TrendingUp, Wallet, Menu, X, UserCircle, Users, Eye, EyeOff
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { where, orderBy } from "firebase/firestore";
import { createChart, ColorType, IChartApi, ISeriesApi, PriceScaleMode, IPriceLine } from 'lightweight-charts';
import Link from 'next/link';
import Image from 'next/image';
import { useBrandSettings } from '@/hooks/use-brand-settings';
import { PositionsPanel } from './PositionsPanel';
import { DrawingLayer } from "./DrawingLayer";
import { ChartSettingsModal } from "./ChartSettingsModal";
import { useLivePrices } from "@/hooks/useLivePrice";
import { useTickStream } from "@/hooks/useTickStream";
import { useIsMobile } from "@/hooks/use-mobile";

const SYMBOLS = [
  "XAUUSD", "XAGUSD", "XPTUSD", "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCHF", "USDCAD", "NZDUSD",
  "BTCUSD", "ETHUSD", "SOLUSD", "XRPUSD", "BNBUSD", "DOGEUSD", "ADAUSD"
];

const TIMEFRAMES = [
  { label: '1m', value: '1min' }, { label: '5m', value: '5min' }, { label: '15m', value: '15min' },
  { label: '30m', value: '30min' }, { label: '1H', value: '1h' }, { label: '4H', value: '4h' },
  { label: '1D', value: '1day' }, { label: '1W', value: '1week' }, { label: '1M', value: '1month' },
];

const TIMEZONES = [
  { label: 'Local Time', value: 'local' }, { label: 'UTC', value: 'UTC' },
  { label: 'New York (EST)', value: 'America/New_York' }, { label: 'London (GMT)', value: 'Europe/London' },
  { label: 'Tokyo (JST)', value: 'Asia/Tokyo' }, { label: 'Sydney (AEST)', value: 'Australia/Sydney' },
];

const intervalSecondsMap: Record<string, number> = {
  '1min': 60, '5min': 300, '15min': 900, '30min': 1800, '1h': 3600, '2h': 7200, '4h': 14400, '1day': 86400, '1week': 604800, '1month': 2592000
};

const candleDataCache = new Map<string, { candles: any[], lastUpdated: number }>();

export default function DemoPage() {
  const { user, userData, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const branding = useBrandSettings();
  const isMobile = useIsMobile();

  const [currentAccountId, setCurrentAccountId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [isChartLoading, setIsChartLoading] = useState(true);
  const [isChartReady, setIsChartReady] = useState(false);
  const [chartError, setChartError] = useState<string | null>(null);
  const [isFallbackData, setIsFallbackData] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState("XAUUSD");
  const [selectedInterval, setSelectedInterval] = useState("1min");
  const [selectedTimezone, setSelectedTimezone] = useState("local");
  const [chartType, setChartType] = useState<string>("candles");
  
  // Lots input state handling
  const [lotsInput, setLotsInput] = useState("0.10");
  const lots = parseFloat(lotsInput) || 0;

  const [sl, setSl] = useState<string>("");
  const [tp, setTp] = useState<string>("");
  const [orderType, setOrderType] = useState<"market" | "pending">("market");
  const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);
  const [countdown, setCountdown] = useState("00:00");
  
  const [bottomPanelOpen, setBottomPanelOpen] = useState(false);
  const [activeTool, setActiveTool] = useState<string>('crosshair');
  const [magnetMode, setMagnetMode] = useState(false);
  const [drawingsLocked, setDrawingsLocked] = useState(false);
  const [drawingsHidden, setDrawingsHidden] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDeleteAllOpen, setIsDeleteAllOpen] = useState(false);
  const [isDrawingOverlayOpen, setIsDrawingOverlayOpen] = useState(false);
  const [isOrderSheetOpen, setIsOrderSheetOpen] = useState(false);

  // Price feeds
  const streamPrice = useTickStream(selectedSymbol);
  const livePrices = useLivePrices(SYMBOLS);
  
  const closingTradesRef = useRef<Set<string>>(new Set());

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
  const oldestTimestamp = useRef<number | null>(null);
  const activePriceLinesRef = useRef<Map<string, IPriceLine[]>>(new Map());

  const accountConstraints = useMemo(() => user?.uid ? [where("userId", "==", user.uid)] : [], [user?.uid]);
  const { data: accounts } = useCollection<any>(user?.uid ? "demoAccounts" : null, accountConstraints);

  const selectedAccount = useMemo(() => 
    accounts.find(a => a.id === currentAccountId) || accounts[0] || null
  , [accounts, currentAccountId]);

  useEffect(() => {
    if (!authLoading && accounts.length > 0 && !currentAccountId) {
      setCurrentAccountId(accounts[0].id);
    }
  }, [authLoading, accounts, currentAccountId]);

  const handleResize = useCallback(() => {
    if (chartContainerRef.current && chartInstanceRef.current) {
      const container = chartContainerRef.current;
      chartInstanceRef.current.applyOptions({ 
        width: container.clientWidth, 
        height: container.clientHeight || (isMobile ? window.innerHeight * 0.42 : 480) 
      });
    }
  }, [isMobile]);

  useEffect(() => {
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', () => {
      setTimeout(handleResize, 300);
    });
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [handleResize]);

  useEffect(() => {
    currentCandleRef.current = null;
    oldestTimestamp.current = null;
    setIsFallbackData(false);
    if (chartInstanceRef.current) {
      chartInstanceRef.current.priceScale('right').applyOptions({ autoScale: true });
    }
  }, [selectedSymbol]);

  useEffect(() => {
    const intervalSecs = intervalSecondsMap[selectedInterval] || 60;
    const updateCountdown = () => {
      const now = Math.floor(Date.now() / 1000);
      const remaining = intervalSecs - (now % intervalSecs);
      const mins = Math.floor(remaining / 60);
      const secs = remaining % 60;
      setCountdown(`${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`);
    };
    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [selectedInterval]);

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
        layout: { background: { type: ColorType.Solid, color: '#09090b' }, textColor: chartSettings.canvas.scales.textColor, fontSize: chartSettings.canvas.scales.fontSize },
        grid: { vertLines: { visible: chartSettings.scales.lines.gridVert && (chartSettings.canvas.grid.type === 'vertical' || chartSettings.canvas.grid.type === 'both'), color: chartSettings.canvas.grid.vert.color }, horzLines: { visible: chartSettings.scales.lines.gridHorz && (chartSettings.canvas.grid.type === 'horizontal' || chartSettings.canvas.grid.type === 'both'), color: chartSettings.canvas.grid.horz.color } },
        crosshair: { horzLine: { labelVisible: chartSettings.scales.labels.currentPrice, color: chartSettings.canvas.crosshair.color }, vertLine: { labelVisible: chartSettings.scales.labels.ohlc, color: chartSettings.canvas.crosshair.color } },
        watermark: { visible: chartSettings.canvas.watermark.visible, color: chartSettings.canvas.watermark.color, text: chartSettings.canvas.watermark.text || branding.siteName }
      });
      if (mainSeriesRef.current) mainSeriesRef.current.applyOptions({ ...chartSettings.canvas.candles, lastValueVisible: chartSettings.scales.labels.currentPrice, title: chartSettings.scales.labels.ohlc ? selectedSymbol : '' });
    } catch (e) {}
  }, [chartSettings, selectedSymbol, branding.siteName]);

  useEffect(() => {
    localStorage.setItem('chartGlobalSettings', JSON.stringify(chartSettings));
    applyGlobalSettings();
  }, [chartSettings, applyGlobalSettings]);

  useEffect(() => {
    if (!chartContainerRef.current) return;
    let chart; 
    try { 
      chart = createChart(chartContainerRef.current, {
        layout: { background: { type: ColorType.Solid, color: '#09090b' }, textColor: '#71717a' },
        grid: { vertLines: { color: '#18181b' }, horzLines: { color: '#18181b' } },
        width: chartContainerRef.current.clientWidth,
        height: chartContainerRef.current.clientHeight || (isMobile ? window.innerHeight * 0.42 : 480),
        timeScale: { borderColor: '#27272a', timeVisible: true, secondsVisible: false },
      });
      chartInstanceRef.current = chart;
      const series = chartType === 'line' || chartType === 'area' 
        ? (chartType === 'area' ? chart.addAreaSeries() : chart.addLineSeries())
        : chart.addCandlestickSeries();
      mainSeriesRef.current = series;
      setIsChartReady(true);
      setTimeout(handleResize, 100);
    } catch (e) {}
    applyGlobalSettings();
    return () => { if (chartInstanceRef.current) { try { chartInstanceRef.current.remove(); } catch (e) {} chartInstanceRef.current = null; } mainSeriesRef.current = null; setIsChartReady(false); currentCandleRef.current = null; };
  }, [chartType, applyGlobalSettings, isMobile, handleResize]);

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();
    const cacheKey = `${selectedSymbol}-${selectedInterval}`;
    const cached = candleDataCache.get(cacheKey);
    const fetchHistory = async () => {
      if (cached && (Date.now() - cached.lastUpdated < 300000)) { 
        setIsChartLoading(false);
        if (mainSeriesRef.current) mainSeriesRef.current.setData(cached.candles);
        oldestTimestamp.current = cached.candles[0].time;
      } else { setIsChartLoading(true); }
      try {
        const res = await fetch(`/api/terminal/candles?symbol=${selectedSymbol}&interval=${selectedInterval}&limit=1000`, { signal: controller.signal });
        if (!res.ok) throw new Error(`Network error: ${res.status}`);
        const data = await res.json();
        const rawCandles = data.candles || [];
        if (!isMounted) return;
        if (rawCandles.length > 0) {
          const sorted = [...rawCandles].map(c => ({ ...c, time: typeof c.time === 'object' && c.time?.seconds ? Number(c.time.seconds) : Number(c.time) })).sort((a: any, b: any) => a.time - b.time).filter((v: any, i: any, a: any) => i === 0 || v.time > a[i - 1].time);
          if (mainSeriesRef.current) {
             const formatted = (chartType === 'candles' || chartType === 'bars') ? sorted : sorted.map((c: any) => ({ time: c.time, value: c.close }));
             mainSeriesRef.current.setData(formatted);
             chartInstanceRef.current?.timeScale().fitContent();
          }
          setIsFallbackData(!!data.isFallback);
          candleDataCache.set(cacheKey, { candles: sorted, lastUpdated: Date.now() });
          
          const lastHistCandle = sorted[sorted.length - 1];
          if (!currentCandleRef.current || lastHistCandle.time > currentCandleRef.current.time) {
            currentCandleRef.current = { ...lastHistCandle };
          }
          
          oldestTimestamp.current = sorted[0].time;
        }
      } catch (err: any) { if (isMounted && !cached) setChartError(err.message); } finally { if (isMounted) setIsChartLoading(false); }
    };
    if (isChartReady) fetchHistory();
    return () => { isMounted = false; controller.abort(); };
  }, [isChartReady, selectedSymbol, selectedInterval, chartType]);

  const tradeConstraints = useMemo(() => user?.uid ? [where("userId", "==", user.uid), orderBy("openedAt", "desc")] : [], [user?.uid]);
  const { data: allUserTrades } = useCollection<any>(tradeConstraints.length ? "demoTrades" : null, tradeConstraints);
  
  const trades = useMemo(() => allUserTrades.filter(t => t.accountId === currentAccountId), [allUserTrades, currentAccountId]);
  const openTrades = useMemo(() => trades.filter(t => t.status === 'open'), [trades]);
  const closedTrades = useMemo(() => trades.filter(t => t.status === 'closed'), [trades]);

  const currentPriceData = useMemo(() => livePrices[selectedSymbol.toUpperCase()], [livePrices, selectedSymbol]);
  const isPriceValid = useMemo(() => !!(currentPriceData && Number(currentPriceData.price) > 0), [currentPriceData]);

  const handleAutoClose = useCallback(async (tradeId: string, exitPrice: number, reason: string) => {
    if (!user) return;
    try {
      const token = await user.getIdToken(true);
      const res = await fetch(`/api/terminal/trades/${tradeId}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ closePrice: exitPrice, closeReason: reason }),
      });
      if (res.ok) {
        toast({ title: reason === 'stop_loss' ? "Stop Loss Hit" : "Take Profit Hit", description: `Position closed at ${exitPrice.toFixed(selectedSymbol === "USDJPY" ? 3 : 5)}` });
      }
    } catch (e) {}
  }, [user, selectedSymbol, toast]);

  useEffect(() => {
    const activePrice = streamPrice || currentPriceData;
    
    if (activePrice && mainSeriesRef.current && !isChartLoading && isChartReady) {
      const secs = intervalSecondsMap[selectedInterval] || 60;
      const now = Math.floor(Date.now() / 1000);
      const candleTime = Math.floor(now / secs) * secs;
      const price = activePrice.price;
      if (price && price > 0) {
        const cur = currentCandleRef.current;
        if (chartType === 'area' || chartType === 'line') {
          mainSeriesRef.current.update({ time: candleTime as any, value: price });
        } else {
          if (!cur || Number(cur.time) < candleTime) {
            const nextCandle = { time: candleTime, open: price, high: price, low: price, close: price };
            currentCandleRef.current = nextCandle;
            mainSeriesRef.current.update(nextCandle);
          } else if (Number(cur.time) === candleTime) {
            cur.high = Math.max(cur.high, price);
            cur.low = Math.min(cur.low, price);
            cur.close = price;
            mainSeriesRef.current.update({ ...cur });
          }
        }
      }
    }
  }, [streamPrice, currentPriceData, selectedInterval, isChartLoading, isChartReady, chartType]);

  useEffect(() => {
    if (openTrades.length > 0 && Object.keys(livePrices).length > 0) {
      openTrades.forEach(t => {
        if (closingTradesRef.current.has(t.id)) return;
        const pData = livePrices[t.symbol.toUpperCase()];
        if (!pData || !pData.bid || !pData.ask) return;
        const bid = pData.bid;
        const ask = pData.ask;
        let triggeredPrice = 0;
        let reason = "";
        if (t.type === 'buy') {
          if (t.sl && bid <= t.sl) { triggeredPrice = t.sl; reason = "stop_loss"; }
          else if (t.tp && bid >= t.tp) { triggeredPrice = t.tp; reason = "take_profit"; }
        } else {
          if (t.sl && ask >= t.sl) { triggeredPrice = t.sl; reason = "stop_loss"; }
          else if (t.tp && ask <= t.tp) { triggeredPrice = t.tp; reason = "take_profit"; }
        }
        if (triggeredPrice > 0) {
          closingTradesRef.current.add(t.id);
          handleAutoClose(t.id, triggeredPrice, reason);
        }
      });
    }
  }, [livePrices, openTrades, handleAutoClose]);

  const calculateOpenPnl = useCallback((trade: any) => {
    const priceData = livePrices[trade.symbol.toUpperCase()];
    if (!priceData) return 0;
    const currentPrice = trade.type === 'buy' ? priceData.bid : priceData.ask;
    const diff = trade.type === 'buy' ? currentPrice - trade.openPrice : trade.openPrice - currentPrice;
    const isForex = !['XAUUSD', 'BTCUSD', 'ETHUSD', 'SOLUSD', 'BNBUSD', 'XRPUSD', 'DOGEUSD', 'ADAUSD'].includes(trade.symbol.toUpperCase());
    const contractSize = isForex ? 100000 : (trade.symbol.toUpperCase() === 'XAUUSD' ? 100 : 1);
    return diff * trade.lots * contractSize;
  }, [livePrices]);

  useEffect(() => {
    if (!mainSeriesRef.current || !isChartReady) return;
    activePriceLinesRef.current.forEach((lines) => { lines.forEach((line) => mainSeriesRef.current?.removePriceLine(line)); });
    activePriceLinesRef.current.clear();
    openTrades.filter(t => t.symbol.toUpperCase() === selectedSymbol.toUpperCase()).forEach((trade) => {
      const lines: IPriceLine[] = [];
      const currentPnl = calculateOpenPnl(trade);
      const entryLine = mainSeriesRef.current!.createPriceLine({ price: trade.openPrice, color: trade.type === 'buy' ? '#2962ff' : '#f57c00', lineWidth: 1, lineStyle: 0, axisLabelVisible: true, title: `${trade.lots.toFixed(2)}  ${currentPnl >= 0 ? '+' : ''}${currentPnl.toFixed(2)} USD`, });
      lines.push(entryLine);
      if (trade.sl) { const slLine = mainSeriesRef.current!.createPriceLine({ price: trade.sl, color: '#ef4444', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: `SL @ ${trade.sl}` }); lines.push(slLine); }
      if (trade.tp) { const tpLine = mainSeriesRef.current!.createPriceLine({ price: trade.tp, color: '#10b981', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: `TP @ ${trade.tp}` }); lines.push(tpLine); }
      activePriceLinesRef.current.set(trade.id, lines);
    });
    return () => { activePriceLinesRef.current.forEach((lines) => { lines.forEach((line) => mainSeriesRef.current?.removePriceLine(line)); }); };
  }, [openTrades, selectedSymbol, isChartReady, calculateOpenPnl]);

  async function placeTrade(type: 'buy' | 'sell') {
    try {
      setActionLoading(true);
      if (!user || !currentAccountId || !currentPriceData) return;
      const token = await user.getIdToken(true);
      const executionPrice = type === 'buy' ? (currentPriceData.ask || currentPriceData.price) : (currentPriceData.bid || currentPriceData.price);
      const res = await fetch('/api/terminal/trades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ accountId: currentAccountId, symbol: selectedSymbol.toUpperCase(), type, lots, price: executionPrice, sl: parseFloat(sl) > 0 ? parseFloat(sl) : null, tp: parseFloat(tp) > 0 ? parseFloat(tp) : null })
      });
      if (!res.ok) { 
        const err = await res.json().catch(() => ({})); 
        toast({ title: "Execution Failed", description: err.details ? `${err.error}: ${err.details}` : (err.error || `Server Error: ${res.status}`), variant: "destructive" }); 
        return; 
      }
      toast({ title: `✓ ${type.toUpperCase()} Filled`, description: `${selectedSymbol} @ ${executionPrice.toFixed(selectedSymbol === "USDJPY" ? 3 : 5)}` });
      setIsOrderSheetOpen(false);
    } catch(e: any) { toast({ title: "System Error", description: "Terminal connection fault.", variant: "destructive" }); } finally { setActionLoading(false); }
  }

  const { data: alerts, loading: alertsLoading } = useCollection<any>(user?.uid ? "alerts" : null, useMemo(() => user?.uid ? [where("userId", "==", user.uid), orderBy("createdAt", "desc")] : [], [user?.uid]));

  const handleZoomIn = () => { if (chartInstanceRef.current) { const timeScale = chartInstanceRef.current.timeScale(); timeScale.applyOptions({ barSpacing: timeScale.options().barSpacing * 1.2 }); } };
  const handleZoomOut = () => { if (chartInstanceRef.current) { const timeScale = chartInstanceRef.current.timeScale(); timeScale.applyOptions({ barSpacing: timeScale.options().barSpacing / 1.2 }); } };
  const handleResetView = () => { if (chartInstanceRef.current) { chartInstanceRef.current.timeScale().fitContent(); chartInstanceRef.current.priceScale('right').applyOptions({ autoScale: true }); } };

  async function closeTrade(tradeId: string) {
    try {
      setActionLoading(true);
      const trade = openTrades.find(t => t.id === tradeId);
      if (!trade) return;
      const priceData = livePrices[trade.symbol.toUpperCase()];
      const closePrice = trade.type === 'buy' ? (priceData?.bid || priceData?.price || 0) : (priceData?.ask || priceData?.price || 0);
      if (!closePrice || closePrice <= 0) return;
      const token = await user?.getIdToken(true);
      const res = await fetch(`/api/terminal/trades/${tradeId}/close`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ closePrice, closeReason: "manual" }) });
      if (!res.ok) return;
      toast({ title: "✓ Position Closed" });
    } catch (e: any) { } finally { setActionLoading(false); }
  }

  const TOOLBAR_ITEMS = [
    { id: 'crosshair', name: 'Crosshair', icon: Crosshair },
    { id: 'trend', name: 'Trend Line', icon: Slash },
    { id: 'arrow', name: 'Arrow', icon: ArrowUpRight },
    { id: 'hline', name: 'Horizontal Line', icon: Minus },
    { id: 'vline', name: 'Vertical Line', icon: SeparatorVertical },
    { id: 'ray', name: 'Ray', icon: () => <ArrowRight className="rotate-[-45deg] scale-75" /> },
    { id: 'rect', name: 'Rectangle', icon: Square },
    { id: 'text', name: 'Text', icon: Type },
    { id: 'measure', name: 'Ruler / Measure', icon: Ruler },
    { id: 'zoom-in', name: 'Zoom In', icon: ZoomIn, action: handleZoomIn },
    { id: 'zoom-out', name: 'Zoom Out', icon: ZoomOut, action: handleZoomOut },
    { id: 'home', name: 'Home', icon: Home, action: handleResetView },
    { id: 'lock', name: 'Lock', icon: drawingsLocked ? Lock : Unlock, action: () => setDrawingsLocked(!drawingsLocked), toggle: true },
    { id: 'magnet', name: 'Magnet', icon: Magnet, action: () => setMagnetMode(!magnetMode), active: magnetMode, toggle: true },
    { id: 'eye', name: 'Eye', icon: drawingsHidden ? EyeOff : Eye, action: () => setDrawingsHidden(!drawingsHidden), toggle: true },
    { id: 'eraser', name: 'Eraser', icon: Eraser, action: () => setIsDeleteAllOpen(true) },
  ];

  const OrderPanelContent = (
    <div className="space-y-6">
      <Tabs value={orderType} onValueChange={(v: any) => setOrderType(v)}>
        <TabsList className="grid w-full grid-cols-2 bg-zinc-900/50 h-10 p-1 border border-zinc-800">
          <TabsTrigger value="market" className="text-[10px] font-black uppercase">Market</TabsTrigger>
          <TabsTrigger value="pending" className="text-[10px] font-black uppercase">Pending</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="space-y-6">
        <div className="flex flex-col gap-2">
          <Label className="text-[10px] font-black uppercase text-zinc-500">Volume (Lots)</Label>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setLotsInput(Math.max(0.01, lots - 0.01).toFixed(2))} 
              className="w-10 h-11 bg-zinc-900 rounded-lg border border-zinc-800 font-bold"
            >
              -
            </button>
            <Input
              type="text"
              inputMode="decimal"
              value={lotsInput}
              onChange={(e) => {
                const val = e.target.value;
                if (/^\d*\.?\d*$/.test(val)) setLotsInput(val);
              }}
              onBlur={() => {
                const parsed = parseFloat(lotsInput);
                setLotsInput(isNaN(parsed) || parsed <= 0 ? "0.01" : parsed.toFixed(2));
              }}
              className="h-11 bg-zinc-900/50 text-center font-mono font-bold text-white"
            />
            <button 
              onClick={() => setLotsInput((lots + 0.01).toFixed(2))} 
              className="w-10 h-11 bg-zinc-900 rounded-lg border border-zinc-800 font-bold"
            >
              +
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2"><Label className="text-[10px] font-black uppercase">Stop Loss</Label><Input placeholder="0.00" value={sl} onChange={(e) => setSl(e.target.value)} className="h-11 bg-zinc-900/50" /></div>
          <div className="space-y-2"><Label className="text-[10px] font-black uppercase">Take Profit</Label><Input placeholder="0.00" value={tp} onChange={(e) => setTp(e.target.value)} className="h-11 bg-zinc-900/50" /></div>
        </div>
        <div className="space-y-4">
          <button type="button" onClick={() => placeTrade('buy')} disabled={actionLoading || !isPriceValid} className="w-full h-16 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-sm tracking-widest transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
            {actionLoading ? <Loader2 className="animate-spin w-6 h-6 mx-auto" /> : !isPriceValid ? 'PRICE SYNCING...' : 'BUY BY MARKET'}
          </button>
          <button type="button" onClick={() => placeTrade('sell')} disabled={actionLoading || !isPriceValid} className="w-full h-16 bg-red-600 hover:bg-red-700 text-white rounded-xl font-black text-sm tracking-widest transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
            {actionLoading ? <Loader2 className="animate-spin w-6 h-6 mx-auto" /> : !isPriceValid ? 'PRICE SYNCING...' : 'SELL BY MARKET'}
          </button>
        </div>
      </div>
    </div>
  );

  if (!user && !authLoading) return null;

  return (
    <div className="fixed inset-0 h-[100dvh] w-screen bg-[#09090b] flex flex-col text-zinc-300 font-sans select-none overflow-hidden">
      {/* Dynamic Header */}
      <header className="h-12 border-b border-zinc-800 flex items-center justify-between px-3 md:px-4 bg-zinc-950 shrink-0 z-50">
        <div className="flex items-center gap-3 md:gap-6">
          <div className="flex items-center gap-2">
            <Image src={branding.logoUrl} alt="Logo" width={20} height={20} className="rounded-full" />
            <span className="font-bold text-xs md:text-sm tracking-tight text-white hidden sm:inline">PrimeFunded Trade</span>
          </div>
          <Link href="/dashboard" className="flex items-center gap-2 text-[10px] font-bold text-zinc-500 hover:text-white transition-colors border-l border-zinc-800 pl-3 md:pl-6 h-12">
            <ArrowLeft className="w-3 h-3" /> <span className="hidden sm:inline">Dashboard</span>
          </Link>
          <div className="flex items-center gap-1.5 px-3 py-1 bg-white/5 rounded-full border border-white/5">
            <UserCircle className="w-3 h-3 text-primary" />
            <span className="text-[10px] font-black uppercase text-zinc-400">ID: {userData?.traderId || '--------'}</span>
          </div>
          {selectedAccount && isMobile && (
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-[8px] font-black uppercase px-2 h-6 truncate max-w-[100px]">
              {selectedAccount.label}
            </Badge>
          )}
        </div>
        
        <div className="flex items-center gap-2 md:gap-4">
          {!isMobile && (
            <>
              <Button variant="ghost" size="sm" className="h-9 px-3 gap-2 text-xs font-bold text-zinc-400" onClick={() => setIsAlertModalOpen(true)}>
                <Bell className="w-4 h-4" /> Set Alert
              </Button>
              <Select value={selectedTimezone} onValueChange={setSelectedTimezone}>
                <SelectTrigger className="bg-transparent border-none h-9 w-40 text-xs font-bold">
                  <Globe className="w-3.5 h-3.5 mr-2" /><SelectValue />
                </SelectTrigger>
                <SelectContent>{TIMEZONES.map(tz => <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>)}</SelectContent>
              </Select>
            </>
          )}
          
          <Select value={chartType} onValueChange={setChartType}>
            <SelectTrigger className="bg-transparent border-none h-9 w-24 md:w-32 text-[10px] md:text-xs font-bold">
              <Activity className="w-3 h-3 md:w-3.5 md:h-3.5 mr-2" /><SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="candles">Candles</SelectItem>
              <SelectItem value="bars">Bars</SelectItem>
              <SelectItem value="line">Line</SelectItem>
              <SelectItem value="area">Area</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="ghost" size="icon" className="h-9 w-9 text-zinc-400" onClick={() => setIsSettingsOpen(true)}>
            <Settings className="w-4 h-4" />
          </Button>

          {!isMobile && (
            <Select value={currentAccountId ?? ""} onValueChange={setCurrentAccountId}>
              <SelectTrigger className="bg-transparent border-none h-12 w-56 text-xs font-bold">
                <SelectValue placeholder={selectedAccount?.label || "Select Account"} />
              </SelectTrigger>
              <SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>)}</SelectContent>
            </Select>
          )}
        </div>
      </header>

      {/* Touch-Friendly Symbol Bar */}
      <div className="h-11 md:h-10 border-b border-zinc-800 flex items-center px-1 gap-1 bg-zinc-950/50 overflow-x-auto no-scrollbar scroll-smooth shrink-0 touch-pan-x">
        {SYMBOLS.map((s) => (
          <button 
            key={s} 
            onClick={() => setSelectedSymbol(s)} 
            className={cn(
              "px-4 h-full flex items-center justify-center transition-all border-b-2 shrink-0 min-w-[70px]", 
              s === selectedSymbol ? "border-primary bg-primary/5" : "border-transparent hover:bg-white/5"
            )}
          >
            <span className={cn("font-bold text-[10px] md:text-[11px]", s === selectedSymbol ? "text-white" : "text-zinc-500")}>{s}</span>
          </button>
        ))}
      </div>

      {/* Touch-Friendly Timeframe Bar */}
      <div className="h-10 md:h-9 border-b border-zinc-800 flex items-center px-4 gap-2 bg-zinc-950/50 overflow-x-auto no-scrollbar scroll-smooth shrink-0 touch-pan-x">
        {TIMEFRAMES.map((tf) => (
          <button 
            key={tf.value} 
            onClick={() => setSelectedInterval(tf.value)} 
            className={cn(
              "px-3 h-7 md:h-6 min-w-[40px] flex items-center justify-center rounded transition-all text-[10px] font-black uppercase tracking-widest", 
              selectedInterval === tf.value ? "bg-primary text-black" : "text-muted-foreground hover:text-white hover:bg-white/5"
            )}
          >
            {tf.label}
          </button>
        ))}
      </div>

      <div className="flex-1 flex min-h-0 relative">
        <div className="flex-1 flex flex-col min-w-0 bg-[#09090b] overflow-hidden">
          <div className="flex-1 relative min-h-0 bg-[#09090b] flex">
            {/* Desktop-only Drawing Tools Sidebar */}
            <aside className="hidden lg:flex w-[50px] border-r border-[#2a2a2a] bg-[#1a1a1a] flex-col items-center py-2 z-40 shrink-0 shadow-2xl overflow-y-auto no-scrollbar">
              <TooltipProvider delayDuration={300}>
                <div className="flex flex-col gap-0.5 items-center w-full">
                  {TOOLBAR_ITEMS.map((item) => (
                    <ToolIcon 
                      key={item.id}
                      name={item.name}
                      icon={typeof item.icon === 'function' ? <item.icon /> : <item.icon />}
                      active={item.toggle ? item.active : activeTool === item.id}
                      onClick={() => { if (item.action) item.action(); else setActiveTool(item.id); }}
                    />
                  ))}
                </div>
              </TooltipProvider>
            </aside>

            {/* Main Chart Area */}
            <div className="flex-1 relative min-h-0" ref={chartContainerRef} style={{ height: isMobile ? '42vh' : 'auto', maxHeight: isMobile ? '42vh' : 'none' }}>
              {isChartLoading && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-zinc-950/80 backdrop-blur-sm">
                  <Loader2 className="animate-spin text-primary" />
                  <p className="text-[10px] uppercase font-black tracking-widest mt-4">Syncing Feed...</p>
                </div>
              )}
              {isFallbackData && (
                <div className="absolute left-1/2 top-4 -translate-x-1/2 z-20 w-full max-w-[200px] px-2">
                  <div className="px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500 text-[8px] md:text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 backdrop-blur-md shadow-2xl">
                    <AlertTriangle className="w-3 h-3 shrink-0" />
                    <span className="truncate">Simulated Data Feed</span>
                  </div>
                </div>
              )}
              
              {/* Floating Candle Countdown */}
              <div className="absolute right-[10px] md:right-[65px] top-[10px] md:top-[40px] z-20 flex items-center gap-1.5 px-2 py-1 bg-zinc-900/80 border border-zinc-700/50 rounded shadow-2xl backdrop-blur-sm pointer-events-none">
                <ClockIcon className="w-3 h-3 text-primary animate-pulse" />
                <span className="font-mono text-[9px] md:text-[10px] font-black text-white tabular-nums tracking-wider">{countdown}</span>
              </div>

              {/* Drawing Tools Overlay (Mobile) */}
              {isMobile && (
                <button 
                  onClick={() => setIsDrawingOverlayOpen(true)}
                  className="absolute left-3 top-3 z-30 w-10 h-10 bg-zinc-900/80 border border-zinc-700 rounded-full flex items-center justify-center text-white backdrop-blur-md shadow-xl"
                >
                  <Menu className="w-5 h-5" />
                </button>
              )}

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
            </div>
          </div>

          {/* Positions Panel (Scrollable/Collapsible) */}
          <PositionsPanel 
            openTrades={openTrades} 
            closedTrades={closedTrades} 
            alerts={alerts} 
            livePrices={livePrices} 
            closeTrade={closeTrade} 
            deleteAlert={async (id) => {
              if (!user) return;
              try {
                const token = await user.getIdToken();
                await fetch(`/api/terminal/alerts?id=${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
                toast({ title: "Alert Removed" });
              } catch (e) {}
            }} 
            user={user} 
            alertsLoading={alertsLoading}
            panelOpen={bottomPanelOpen}
            setPanelOpen={setBottomPanelOpen}
          />
        </div>

        {/* Right Order Aside (Visible on Desktop and Tablet) */}
        <aside className="hidden md:flex w-72 lg:w-80 border-l border-zinc-800 bg-zinc-950 p-4 lg:p-6 flex-col gap-6 lg:gap-8 shrink-0 overflow-y-auto custom-scrollbar z-50">
           {OrderPanelContent}
        </aside>
      </div>

      {/* Mobile Bottom Navigation & Action FABs */}
      {isMobile && (
        <div className="h-16 border-t border-zinc-800 bg-zinc-950 flex items-center justify-around px-2 shrink-0 z-50 safe-area-bottom">
          <Link href="/dashboard" className="flex flex-col items-center gap-1 text-zinc-500 hover:text-white transition-colors">
            <LayoutDashboard className="w-5 h-5" />
            <span className="text-[8px] font-black uppercase">Home</span>
          </Link>
          <button 
            onClick={() => { setBottomPanelOpen(false); window.scrollTo(0, 0); }}
            className={cn("flex flex-col items-center gap-1 transition-colors", !bottomPanelOpen ? "text-primary" : "text-zinc-500")}
          >
            <TrendingUp className="w-5 h-5" />
            <span className="text-[8px] font-black uppercase">Chart</span>
          </button>
          <button 
            onClick={() => setIsOrderSheetOpen(true)}
            className="flex flex-col items-center gap-1 text-zinc-500 hover:text-primary transition-colors"
          >
            <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-black shadow-lg -mt-8 border-4 border-zinc-950">
               <ArrowRight className="w-5 h-5 rotate-[-45deg]" />
            </div>
            <span className="text-[8px] font-black uppercase mt-1">Trade</span>
          </button>
          <button 
            onClick={() => setBottomPanelOpen(!bottomPanelOpen)}
            className={cn("flex flex-col items-center gap-1 transition-colors relative", bottomPanelOpen ? "text-primary" : "text-zinc-500")}
          >
            <Wallet className="w-5 h-5" />
            <span className="text-[8px] font-black uppercase">Positions</span>
            {openTrades.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary text-black text-[8px] font-bold rounded-full flex items-center justify-center">
                {openTrades.length}
              </span>
            )}
          </button>
          <Sheet>
            <SheetTrigger asChild>
              <button className="flex flex-col items-center gap-1 text-zinc-500">
                <Menu className="w-5 h-5" />
                <span className="text-[8px] font-black uppercase">Menu</span>
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="bg-zinc-950 border-zinc-800 text-white w-72 p-0">
               <SheetHeader className="p-6 border-b border-zinc-800">
                 <SheetTitle className="text-left font-headline font-bold">Node Menu</SheetTitle>
               </SheetHeader>
               <div className="p-4 space-y-4">
                  <div className="space-y-2">
                    <Label className="text-[9px] font-black uppercase text-zinc-500">Active Account</Label>
                    <Select value={currentAccountId ?? ""} onValueChange={setCurrentAccountId}>
                      <SelectTrigger className="h-12 bg-zinc-900 border-zinc-800 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                        {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button variant="outline" className="w-full justify-start h-12 gap-3" onClick={() => { setIsAlertModalOpen(true); }}>
                    <Bell className="w-4 h-4" /> Price Alerts
                  </Button>
                  <Button variant="outline" className="w-full justify-start h-12 gap-3" onClick={() => { setIsSettingsOpen(true); }}>
                    <Settings className="w-4 h-4" /> Chart Settings
                  </Button>
                  <Link href="/referral" className="flex items-center gap-3 h-12 px-4 border border-zinc-800 rounded-lg text-sm font-medium hover:bg-white/5 transition-colors">
                    <Users className="w-4 h-4" /> Affiliate Hub
                  </Link>
               </div>
            </SheetContent>
          </Sheet>
        </div>
      )}

      {/* Drawing Tools Overlay (Mobile) */}
      <Dialog open={isDrawingOverlayOpen} onOpenChange={setIsDrawingOverlayOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-lg p-0 overflow-hidden h-[70vh] flex flex-col">
          <DialogHeader className="p-6 border-b border-zinc-800">
            <DialogTitle className="font-headline font-bold">Technical Analysis Tools</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            <div className="grid grid-cols-4 gap-2">
              {TOOLBAR_ITEMS.map((item) => (
                <button 
                  key={item.id}
                  onClick={() => { if (item.action) item.action(); else setActiveTool(item.id); setIsDrawingOverlayOpen(false); }}
                  className={cn(
                    "flex flex-col items-center justify-center p-3 rounded-xl border transition-all gap-2",
                    (item.toggle ? item.active : activeTool === item.id) 
                      ? "bg-primary border-primary text-black" 
                      : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white"
                  )}
                >
                  <div className="scale-110">{typeof item.icon === 'function' ? <item.icon /> : <item.icon />}</div>
                  <span className="text-[8px] font-black uppercase text-center">{item.name}</span>
                </button>
              ))}
            </div>
          </div>
          <DialogFooter className="p-4 bg-zinc-900/50 border-t border-zinc-800">
            <Button className="w-full h-12 font-bold" onClick={() => setIsDrawingOverlayOpen(false)}>Close Overlay</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Order Entry Sheet (Mobile) */}
      <Sheet open={isOrderSheetOpen} onValueChange={setIsOrderSheetOpen}>
        <SheetContent side="bottom" className="bg-zinc-950 border-zinc-800 text-white rounded-t-3xl h-[85vh] md:h-auto overflow-y-auto custom-scrollbar">
          <SheetHeader className="pb-4">
            <div className="w-12 h-1 bg-zinc-800 rounded-full mx-auto mb-4" />
            <SheetTitle className="text-center font-headline font-bold text-2xl">Execute Order</SheetTitle>
          </SheetHeader>
          <div className="pb-10 pt-4">
            {OrderPanelContent}
          </div>
        </SheetContent>
      </Sheet>

      {/* Global Modals */}
      <ChartSettingsModal open={isSettingsOpen} onOpenChange={setIsSettingsOpen} settings={chartSettings} onSettingsChange={setChartSettings} onResetScale={handleResetView} />
      
      <Dialog open={isAlertModalOpen} onOpenChange={setIsAlertModalOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-sm">
          <DialogHeader><DialogTitle>Set Price Alert</DialogTitle></DialogHeader>
          <div className="p-6"><Button className="w-full h-12 font-black cyan-box-glow" onClick={() => setIsAlertModalOpen(false)}>CREATE ALERT</Button></div>
        </DialogContent>
      </Dialog>
      
      <Dialog open={isDeleteAllOpen} onOpenChange={setIsDeleteAllOpen}>
        <DialogContent className="bg-[#1c1c1c] border-zinc-800 text-white max-w-sm">
          <DialogHeader><DialogTitle>Clear All Drawings</DialogTitle></DialogHeader>
          <div className="p-6 space-y-4"><p className="text-sm text-zinc-400">This will permanently delete all technical analysis drawings for <span className="text-white font-bold">{selectedSymbol}</span>.</p></div>
          <DialogFooter className="p-4 bg-zinc-900/50 flex gap-2"><Button variant="ghost" className="flex-1 font-bold h-11" onClick={() => setIsDeleteAllOpen(false)}>Cancel</Button><Button variant="destructive" className="flex-1 font-black h-11" onClick={() => { setActiveTool('eraser'); setIsDeleteAllOpen(false); }}>Clear All</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ToolIcon({ name, icon, active = false, onClick }: { name: string, icon: React.ReactNode, active?: boolean, onClick?: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div onClick={onClick} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(); } }} className={cn("w-9 h-9 flex items-center justify-center rounded-md transition-all shrink-0 outline-none my-[1px] relative cursor-pointer group", active ? "bg-[#2962ff] text-white" : "text-[#b2b5be] hover:text-white hover:bg-[#2a2e39]")}>
          <div className="flex items-center justify-center transition-transform group-active:scale-90 scale-90">{icon}</div>
        </div>
      </TooltipTrigger>
      <TooltipContent side="right" className="bg-[#1e222d] border-[#2a2e39] text-white font-bold text-[10px] uppercase shadow-2xl z-[100] px-3 py-1.5 rounded-md">{name}</TooltipContent>
    </Tooltip>
  );
}
