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
import { 
  Loader2, ArrowLeft, Minus, Plus, Activity, Bell, Globe, Settings, 
  Crosshair, Circle, Slash, ArrowUpRight, ArrowLeftRight, ArrowRight,
  Square, Triangle, Type, Pencil, Magnet, Undo, Trash2, Ruler,
  TrendingUp, TrendingDown, Eye, EyeOff, Lock, Unlock, Star, 
  Columns, LayoutGrid, Search, StickyNote, Tag, MousePointer2, 
  ZoomIn, ZoomOut, AlertCircle, Home, Eraser, SeparatorVertical,
  RefreshCw, Clock as ClockIcon, AlertTriangle
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { where, orderBy, limit } from "firebase/firestore";
import { createChart, ColorType, IChartApi, ISeriesApi, PriceScaleMode, IPriceLine } from 'lightweight-charts';
import Link from 'next/link';
import Image from 'next/image';
import { useBrandSettings } from '@/hooks/use-brand-settings';
import { PositionsPanel } from './PositionsPanel';
import { DrawingLayer } from "./DrawingLayer";
import { ChartSettingsModal } from "./ChartSettingsModal";

const SYMBOLS = ["XAUUSD", "XAGUSD", "XPTUSD", "BTCUSD", "ETHUSD", "SOLUSD", "XRPUSD", "BNBUSD", "DOGEUSD", "ADAUSD", "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCHF"];
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

  const [pageReady, setPageReady] = useState(true);
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
  const [lots, setLots] = useState(0.10);
  const [sl, setSl] = useState<string>("");
  const [tp, setTp] = useState<string>("");
  const [livePrices, setLivePrices] = useState<Record<string, any>>({});
  const [orderType, setOrderType] = useState<"market" | "pending">("market");
  const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);
  const [countdown, setCountdown] = useState("00:00");
  
  const [bottomPanelOpen, setBottomPanelOpen] = useState(true);
  const [activeTool, setActiveTool] = useState<string>('crosshair');
  const [magnetMode, setMagnetMode] = useState(false);
  const [drawingsLocked, setDrawingsLocked] = useState(false);
  const [drawingsHidden, setDrawingsHidden] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDeleteAllOpen, setIsDeleteAllOpen] = useState(false);

  // Safety trackers
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
  const { data: accounts, loading: accountsLoading } = useCollection<any>(user?.uid ? "demoAccounts" : null, accountConstraints);

  useEffect(() => {
    if (!authLoading) {
      if (accounts.length > 0 && !currentAccountId) {
        setCurrentAccountId(accounts[0].id);
      }
    }
  }, [authLoading, accountsLoading, accounts, currentAccountId, user]);

  useEffect(() => {
    currentCandleRef.current = null;
    oldestTimestamp.current = null;
    setIsFallbackData(false);
    if (chartInstanceRef.current) {
      chartInstanceRef.current.timeScale().scrollToPosition(0, false);
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
        layout: { background: { type: chartSettings.canvas.background.type === 'gradient' ? ColorType.VerticalGradient : ColorType.Solid, color: chartSettings.canvas.background.color }, textColor: chartSettings.canvas.scales.textColor, fontSize: chartSettings.canvas.scales.fontSize },
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
    if (chartInstanceRef.current && chartContainerRef.current) {
      chartInstanceRef.current.applyOptions({
        width: chartContainerRef.current.clientWidth,
        height: chartContainerRef.current.clientHeight
      });
      const t = setTimeout(() => {
        if (chartInstanceRef.current && chartContainerRef.current) {
          chartInstanceRef.current.applyOptions({
            width: chartContainerRef.current.clientWidth,
            height: chartContainerRef.current.clientHeight
          });
        }
      }, 250);
      return () => clearTimeout(t);
    }
  }, [bottomPanelOpen]);

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
    console.log("CHART CREATED - isChartReady will be true now");
    setIsChartReady(true);
    applyGlobalSettings();

    const handleResize = () => { 
      if (chartContainerRef.current && chartInstanceRef.current) {
        chartInstanceRef.current.applyOptions({ 
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight 
        });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartInstanceRef.current) { 
        try { chartInstanceRef.current.remove(); } catch (e) {} 
        chartInstanceRef.current = null; 
      }
      mainSeriesRef.current = null; 
      setIsChartReady(false);
      currentCandleRef.current = null;
    };
  }, [pageReady]);

  useEffect(() => {
    if (!isChartReady || !chartInstanceRef.current) return;
    
    let isMounted = true;
    const controller = new AbortController();
    const cacheKey = `${selectedSymbol}-${selectedInterval}`;
    const cached = candleDataCache.get(cacheKey);

    const fetchHistory = async () => {
      if (cached && (Date.now() - cached.lastUpdated < 300000)) { 
        setIsChartLoading(false);
        setChartError(null);
        setupSeries(cached.candles);
        oldestTimestamp.current = cached.candles[0].time;
      } else {
        setIsChartLoading(true);
        setChartError(null);
      }
      
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, 3000);

      try {
        const res = await fetch(`/api/terminal/candles?symbol=${selectedSymbol}&interval=${selectedInterval}&limit=1000`, {
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!res.ok) throw new Error(`Network response error: ${res.status}`);
        const data = await res.json();
        const candles = data.candles || [];
        
        if (!isMounted || !chartInstanceRef.current) return;

        if (candles.length > 0) {
          setupSeries(candles);
          setIsFallbackData(!!data.isFallback);
          candleDataCache.set(cacheKey, { candles, lastUpdated: Date.now() });
          currentCandleRef.current = candles[candles.length - 1];
          oldestTimestamp.current = candles[0].time;
        }
      } catch (err: any) {
        if (err.name === 'AbortError') {
          if (isMounted && !cached) setChartError("Sync connection timed out. Markets may be closed or slow.");
        } else {
          if (isMounted && !cached) setChartError(err.message || "Failed to establish market connection");
        }
      } finally {
        clearTimeout(timeoutId);
        if (isMounted) setIsChartLoading(false);
      }
    };

    const setupSeries = (candles: any[]) => {
      if (!chartInstanceRef.current) return;
      if (mainSeriesRef.current) {
        chartInstanceRef.current.removeSeries(mainSeriesRef.current);
      }
      const precision = selectedSymbol === "USDJPY" ? 3 : (selectedSymbol === "XAUUSD" || selectedSymbol === "BTCUSD" || selectedSymbol === "ETHUSD" ? 2 : 5);
      const opts = { 
        priceFormat: { 
          type: 'price', 
          precision,
          minMove: 1 / Math.pow(10, precision)
        }, 
        lastValueVisible: chartSettings.scales.labels.currentPrice, 
        title: chartSettings.scales.labels.ohlc ? selectedSymbol : '', 
        ...chartSettings.canvas.candles 
      };
      if (chartType === 'candles') mainSeriesRef.current = chartInstanceRef.current.addCandlestickSeries(opts);
      else if (chartType === 'bars') mainSeriesRef.current = chartInstanceRef.current.addBarSeries(opts);
      else if (chartType === 'line') mainSeriesRef.current = chartInstanceRef.current.addLineSeries(opts);
      else if (chartType === 'area') mainSeriesRef.current = chartInstanceRef.current.addAreaSeries({ ...opts, topColor: chartSettings.canvas.candles.upColor + '66', bottomColor: 'rgba(0,0,0,0)', lineColor: chartSettings.canvas.candles.upColor });
      
      if (mainSeriesRef.current) {
        mainSeriesRef.current.setData(chartType === 'candles' || chartType === 'bars' ? candles : candles.map((c: any) => ({ time: c.time, value: c.close })));
      }
    };

    fetchHistory();
    return () => { isMounted = false; controller.abort(); };
  }, [isChartReady, selectedSymbol, selectedInterval, chartType, chartSettings.canvas.candles]);

  const tradeConstraints = useMemo(() => (user?.uid && currentAccountId) ? [where("userId", "==", user.uid), where("accountId", "==", currentAccountId), where("status", "==", "open")] : [], [user?.uid, currentAccountId]);
  const { data: openTrades } = useCollection<any>(tradeConstraints.length ? "demoTrades" : null, tradeConstraints);

  const isPriceValid = useMemo(() => {
    return Object.keys(livePrices).length > 0;
  }, [livePrices]);

  const handleAutoClose = useCallback(async (tradeId: string, exitPrice: number, reason: string) => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/terminal/trades/${tradeId}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ 
          closePrice: exitPrice,
          closeReason: reason
        }),
      });
      if (res.ok) {
        toast({ 
          title: reason === 'stop_loss' ? "Stop Loss Hit" : "Take Profit Hit",
          description: `Position closed at ${exitPrice.toFixed(selectedSymbol === "USDJPY" ? 3 : 5)}`
        });
      }
    } catch (e) {}
  }, [user, selectedSymbol, toast]);

  useEffect(() => {
    if (!pageReady) return;
    
    const fetchPrices = async () => {
      try {
        const res = await fetch('/api/terminal/live-prices');
        if (!res.ok) return;
        const prices = await res.json();
        setLivePrices(prices);

        if (openTrades && openTrades.length > 0) {
          openTrades.forEach(t => {
            if (closingTradesRef.current.has(t.id)) return;
            
            const pData = prices[t.symbol] || prices[t.symbol?.toUpperCase()];
            if (!pData || !pData.bid || !pData.ask || isNaN(pData.bid) || isNaN(pData.ask) || pData.bid <= 0 || pData.ask <= 0) return;

            const bid = pData.bid;
            const ask = pData.ask;
            let triggeredPrice = 0;
            let reason = "";

            if (t.type === 'buy') {
              if (t.sl && bid <= t.sl && bid > 0) { triggeredPrice = t.sl; reason = "stop_loss"; }
              else if (t.tp && bid >= t.tp && bid > 0) { triggeredPrice = t.tp; reason = "take_profit"; }
            } else {
              if (t.sl && ask >= t.sl && ask > 0) { triggeredPrice = t.sl; reason = "stop_loss"; }
              else if (t.tp && ask <= t.tp && ask > 0) { triggeredPrice = t.tp; reason = "take_profit"; }
            }

            if (triggeredPrice > 0) {
              closingTradesRef.current.add(t.id);
              handleAutoClose(t.id, triggeredPrice, reason);
            }
          });
        }

        try {
          if (mainSeriesRef.current && chartInstanceRef.current && !isChartLoading) {
            const secs = intervalSecondsMap[selectedInterval] || 60;
            const now = Math.floor(Date.now() / 1000);
            const candleTime = Math.floor(now / secs) * secs;
            const price = prices[selectedSymbol]?.price;

            if (price && price > 0 && !isNaN(price)) {
              const cur = currentCandleRef.current;
              const isOutlier = cur && Math.abs(cur.close - price) / cur.close > 0.5;

              if (!cur || cur.time !== candleTime || isOutlier) {
                currentCandleRef.current = { time: candleTime, open: price, high: price, low: price, close: price };
              } else {
                cur.high = Math.max(cur.high, price);
                cur.low = Math.min(cur.low, price);
                cur.close = price;
              }
              mainSeriesRef.current.update(currentCandleRef.current);
            }
          }
        } catch (err) {}
      } catch (e) {}
    };
    
    fetchPrices();
    const interval = setInterval(fetchPrices, 3000);
    
    const handleVisibilityChange = () => { 
      if (document.visibilityState === 'visible') fetchPrices();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => { 
      clearInterval(interval); 
      document.removeEventListener('visibilitychange', handleVisibilityChange); 
    };
  }, [pageReady, isChartLoading, selectedInterval, selectedSymbol, openTrades, handleAutoClose]);

  const calculateOpenPnl = useCallback((trade: any) => {
    const priceData = livePrices[trade.symbol];
    if (!priceData) return 0;
    const currentPrice = trade.type === 'buy' ? priceData.bid : priceData.ask;
    const diff = trade.type === 'buy' ? currentPrice - trade.openPrice : trade.openPrice - currentPrice;
    const isForex = !['XAUUSD', 'BTCUSD', 'ETHUSD'].includes(trade.symbol);
    const contractSize = isForex ? 100000 : (trade.symbol === 'XAUUSD' ? 100 : 1);
    return diff * trade.lots * contractSize;
  }, [livePrices]);

  useEffect(() => {
    if (!mainSeriesRef.current || !isChartReady) return;

    activePriceLinesRef.current.forEach((lines) => {
      lines.forEach((line) => mainSeriesRef.current?.removePriceLine(line));
    });
    activePriceLinesRef.current.clear();

    openTrades.filter(t => t.symbol === selectedSymbol).forEach((trade) => {
      const lines: IPriceLine[] = [];
      const currentPnl = calculateOpenPnl(trade);

      const entryLine = mainSeriesRef.current!.createPriceLine({
        price: trade.openPrice,
        color: trade.type === 'buy' ? '#2962ff' : '#f57c00',
        lineWidth: 1,
        lineStyle: 0,
        axisLabelVisible: true,
        title: `${trade.lots.toFixed(2)}  ${currentPnl >= 0 ? '+' : ''}${currentPnl.toFixed(2)} USD`,
      });
      lines.push(entryLine);

      if (trade.sl) {
        const slLine = mainSeriesRef.current!.createPriceLine({
          price: trade.sl,
          color: '#ef4444',
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: `SL @ ${trade.sl}`,
        });
        lines.push(slLine);
      }

      if (trade.tp) {
        const tpLine = mainSeriesRef.current!.createPriceLine({
          price: trade.tp,
          color: '#10b981',
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: `TP @ ${trade.tp}`,
        });
        lines.push(tpLine);
      }

      activePriceLinesRef.current.set(trade.id, lines);
    });

    return () => {
      activePriceLinesRef.current.forEach((lines) => {
        lines.forEach((line) => mainSeriesRef.current?.removePriceLine(line));
      });
    };
  }, [openTrades, selectedSymbol, isChartReady, calculateOpenPnl]);

  async function placeTrade(type: 'buy' | 'sell') {
    try {
      setActionLoading(true);
      if (!user) { toast({ title: "Auth Required", variant: "destructive" }); return; }
      if (!currentAccountId) { toast({ title: "No Account Selected", variant: "destructive" }); return; }
      
      let priceData = null;
      let pricesBody: any = {};

      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const pricesRes = await fetch('/api/terminal/live-prices', { cache: 'no-store' });
          if (!pricesRes.ok) throw new Error(`HTTP ${pricesRes.status}`);
          pricesBody = await pricesRes.json();
          priceData = pricesBody[selectedSymbol];
          if (priceData && priceData.price && !isNaN(priceData.price)) break;
          else throw new Error(`Symbol ${selectedSymbol} missing from feed`);
        } catch (e) {
          if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 1500));
        }
      }
      
      if (!priceData || !priceData.price) { 
        toast({ 
          title: "Price Unavailable", 
          description: `Price unavailable for ${selectedSymbol} - unable to place trade right now. Please try again in a moment.`,
          variant: "destructive" 
        }); 
        return; 
      }
      
      const executionPrice = type === 'buy' ? (priceData.ask || priceData.price) : (priceData.bid || priceData.price);
      const token = await user.getIdToken(true);
      
      const res = await fetch('/api/terminal/trades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ accountId: currentAccountId, symbol: selectedSymbol, type, lots, price: executionPrice, sl: parseFloat(sl) > 0 ? parseFloat(sl) : null, tp: parseFloat(tp) > 0 ? parseFloat(tp) : null })
      });
      
      if (!res.ok) { 
        const err = await res.json().catch(() => ({})); 
        toast({ title: "Execution Failed", description: err.error || `Server Error: ${res.status}`, variant: "destructive" }); 
        return; 
      }
      
      toast({ title: `✓ ${type.toUpperCase()} Filled`, description: `${selectedSymbol} @ ${executionPrice.toFixed(selectedSymbol === "USDJPY" ? 3 : 5)}` });
    } catch(e: any) { 
      toast({ title: "System Error", description: "Terminal connection fault.", variant: "destructive" }); 
    } finally { 
      setActionLoading(false); 
    }
  }

  const { data: closedTrades } = useCollection<any>((user?.uid && currentAccountId) ? "demoTrades" : null, useMemo(() => (user?.uid && currentAccountId) ? [where("userId", "==", user.uid), where("accountId", "==", currentAccountId), where("status", "==", "closed"), orderBy("closedAt", "desc"), limit(50)] : [], [user?.uid, currentAccountId]));
  const { data: alerts, loading: alertsLoading } = useCollection<any>(user?.uid ? "alerts" : null, useMemo(() => user?.uid ? [where("userId", "==", user.uid), orderBy("createdAt", "desc")] : [], [user?.uid]));

  const handleZoomIn = () => { if (chartInstanceRef.current) { const timeScale = chartInstanceRef.current.timeScale(); timeScale.applyOptions({ barSpacing: timeScale.options().barSpacing * 1.2 }); } };
  const handleZoomOut = () => { if (chartInstanceRef.current) { const timeScale = chartInstanceRef.current.timeScale(); timeScale.applyOptions({ barSpacing: timeScale.options().barSpacing / 1.2 }); } };
  const handleResetView = () => { if (chartInstanceRef.current) { chartInstanceRef.current.timeScale().fitContent(); chartInstanceRef.current.priceScale('right').applyOptions({ autoScale: true }); } };

  async function closeTrade(tradeId: string) {
    try {
      setActionLoading(true);
      const trade = openTrades.find(t => t.id === tradeId);
      if (!trade) return;
      const pricesRes = await fetch('/api/terminal/live-prices');
      const prices = await pricesRes.json();
      const priceData = prices[trade.symbol] || prices[trade.symbol?.toUpperCase()] || livePrices[trade.symbol];
      const closePrice = trade.type === 'buy' ? (priceData?.bid || priceData?.price || 0) : (priceData?.ask || priceData?.price || 0);
      if (!closePrice || closePrice <= 0) { toast({ title: "Cannot Close", variant: "destructive" }); return; }
      const token = await user?.getIdToken();
      const res = await fetch(`/api/terminal/trades/${tradeId}/close`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ closePrice, closeReason: "manual" }) });
      if (!res.ok) { const err = await res.json().catch(() => ({})); toast({ title: "Close Failed", description: err.error || "Server error", variant: "destructive" }); return; }
      toast({ title: "✓ Position Closed" });
    } catch (e: any) { toast({ title: "Close Error", variant: "destructive" }); } finally { setActionLoading(false); }
  }

  const TOOLBAR_ITEMS = [
    { id: 'crosshair', name: 'Crosshair', icon: Crosshair },
    { id: 'trend', name: 'Trend Line', icon: Slash },
    { id: 'arrow', name: 'Arrow', icon: ArrowUpRight },
    { id: 'hline', name: 'Horizontal Line', icon: Minus },
    { id: 'vline', name: 'Vertical Line', icon: SeparatorVertical },
    { id: 'ray', name: 'Ray', icon: () => <ArrowRight className="rotate-[-45deg] scale-75" /> },
    { id: 'channel', name: 'Parallel Channel', icon: Columns },
    { id: 'rect', name: 'Rectangle', icon: Square },
    { id: 'text', name: 'Text', icon: Type },
    { id: 'circle', name: 'Circle', icon: Circle },
    { id: 'measure', name: 'Ruler / Measure', icon: Ruler },
    { id: 'zoom-in', name: 'Zoom In', icon: ZoomIn, action: handleZoomIn },
    { id: 'zoom-out', name: 'Zoom Out', icon: ZoomOut, action: handleZoomOut },
    { id: 'home', name: 'Home', icon: Home, action: handleResetView },
    { id: 'lock', name: 'Lock', icon: drawingsLocked ? Lock : Unlock, action: () => setDrawingsLocked(!drawingsLocked), toggle: true },
    { id: 'magnet', name: 'Magnet', icon: Magnet, action: () => setMagnetMode(!magnetMode), active: magnetMode, toggle: true },
    { id: 'eye', name: 'Eye', icon: drawingsHidden ? EyeOff : Eye, action: () => setDrawingsHidden(!drawingsHidden), toggle: true },
    { id: 'eraser', name: 'Eraser', icon: Eraser, action: () => setIsDeleteAllOpen(true) },
    { id: 'favorites', name: 'Favorites', icon: Star }
  ];

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
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" className="h-9 px-3 gap-2 text-xs font-bold text-zinc-400" onClick={() => setIsAlertModalOpen(true)}>
            <Bell className="w-4 h-4" /> Set Alert
          </Button>
          <Select value={selectedTimezone} onValueChange={setSelectedTimezone}>
            <SelectTrigger className="bg-transparent border-none h-9 w-40 text-xs font-bold">
              <Globe className="w-3.5 h-3.5 mr-2" /><SelectValue />
            </SelectTrigger>
            <SelectContent>{TIMEZONES.map(tz => <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={chartType} onValueChange={setChartType}>
            <SelectTrigger className="bg-transparent border-none h-9 w-32 text-xs font-bold">
              <Activity className="w-3.5 h-3.5 mr-2" /><SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="candles">Candles</SelectItem>
              <SelectItem value="bars">Bars</SelectItem>
              <SelectItem value="line">Line</SelectItem>
              <SelectItem value="area">Area</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" className="h-9 px-3 text-zinc-400" onClick={() => setIsSettingsOpen(true)}>
            <Settings className="w-4 h-4" />
          </Button>
          <Select value={currentAccountId ?? ""} onValueChange={setCurrentAccountId}>
            <SelectTrigger className="bg-transparent border-none h-12 w-56 text-xs font-bold">
              <SelectValue placeholder="Select Account" />
            </SelectTrigger>
            <SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </header>

      <div className="h-10 border-b border-zinc-800 flex items-center px-1 gap-1 bg-zinc-950/50 overflow-x-auto no-scrollbar shrink-0">
        {SYMBOLS.map((s) => (
          <button key={s} onClick={() => setSelectedSymbol(s)} className={cn("px-4 h-full flex items-center gap-3 transition-all border-b-2", s === selectedSymbol ? "border-primary bg-primary/5" : "border-transparent hover:bg-white/5")}>
            <span className={cn("font-bold text-[11px]", s === selectedSymbol ? "text-white" : "text-zinc-500")}>{s}</span>
          </button>
        ))}
      </div>

      <div className="h-9 border-b border-zinc-800 flex items-center px-4 gap-2 bg-zinc-950/50 overflow-x-auto no-scrollbar shrink-0">
        {TIMEFRAMES.map((tf) => (
          <button
            key={tf.value}
            onClick={() => setSelectedInterval(tf.value)}
            className={cn(
              "px-3 h-6 flex items-center justify-center rounded transition-all text-[10px] font-black uppercase tracking-widest",
              selectedInterval === tf.value ? "bg-primary text-black" : "text-muted-foreground hover:text-white hover:bg-white/5"
            )}
          >
            {tf.label}
          </button>
        ))}
      </div>

      <div className="flex-1 flex min-0 relative">
        <div className="flex-1 flex flex-col min-w-0 bg-[#09090b] overflow-hidden">
          <div className="flex-1 relative min-h-0 bg-[#09090b] flex">
            <aside className="w-[50px] border-r border-[#2a2a2a] bg-[#1a1a1a] flex flex-col items-center py-2 z-40 shrink-0 shadow-2xl overflow-y-auto no-scrollbar">
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

            <div className="flex-1 relative min-h-0">
              {isChartLoading && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-zinc-950/80 backdrop-blur-sm">
                  <Loader2 className="animate-spin text-primary" />
                  <p className="text-[10px] uppercase font-black tracking-widest mt-4">Syncing Feed...</p>
                </div>
              )}
              {chartError && !isChartLoading && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-zinc-950/90 backdrop-blur-md p-6 text-center">
                  <AlertCircle className="w-8 h-8 text-destructive mb-4" />
                  <h3 className="text-sm font-bold text-white mb-2">Sync Connection Interrupted</h3>
                  <p className="text-xs text-zinc-400 mb-6 max-w-[250px]">{chartError}</p>
                  <Button variant="outline" size="sm" className="h-9 px-6 font-bold" onClick={() => { setIsChartReady(false); setTimeout(() => setIsChartReady(true), 10); }}>
                    <RefreshCw className="w-4 h-4 mr-2" /> Retry Connection
                  </Button>
                </div>
              )}

              {isFallbackData && (
                <div className="absolute left-1/2 top-4 -translate-x-1/2 z-20">
                  <div className="px-4 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500 text-[10px] font-black uppercase tracking-widest flex items-center gap-2 backdrop-blur-md shadow-2xl">
                    <AlertTriangle className="w-3 h-3" />
                    Demo Data — Live Feed Unavailable
                  </div>
                </div>
              )}

              <div className="absolute right-[65px] top-[40px] z-20 flex items-center gap-1.5 px-2 py-1 bg-zinc-900/80 border border-zinc-700/50 rounded shadow-2xl backdrop-blur-sm pointer-events-none">
                <ClockIcon className="w-3 h-3 text-primary animate-pulse" />
                <span className="font-mono text-[10px] font-black text-white tabular-nums tracking-wider">{countdown}</span>
              </div>

              <div className="absolute bottom-4 left-4 z-10 opacity-20 pointer-events-none select-none flex items-center gap-2">
                <Image src={branding.logoUrl} alt="PrimeFunded" width={28} height={28} className="rounded-full grayscale contrast-125" />
                <span className="text-[10px] font-black uppercase tracking-widest text-white/20">{branding.siteName}</span>
              </div>

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
          
          <PositionsPanel 
            openTrades={openTrades} 
            closedTrades={closedTrades} 
            alerts={alerts} 
            livePrices={livePrices} 
            closeTrade={closeTrade} 
            deleteAlert={async () => {}} 
            user={user} 
            alertsLoading={alertsLoading}
            panelOpen={bottomPanelOpen}
            setPanelOpen={setBottomPanelOpen}
          />
        </div>

        <aside className="w-80 border-l border-zinc-800 bg-zinc-950 p-6 flex flex-col gap-8 shrink-0 overflow-y-auto custom-scrollbar z-50">
           <Tabs value={orderType} onValueChange={(v: any) => setOrderType(v)}><TabsList className="grid w-full grid-cols-2 bg-zinc-900/50 h-10 p-1 border border-zinc-800"><TabsTrigger value="market" className="text-[10px] font-black uppercase">Market</TabsTrigger><TabsTrigger value="pending" className="text-[10px] font-black uppercase">Pending</TabsTrigger></TabsList></Tabs>
           <div className="space-y-6">
              <div className="flex flex-col gap-2">
                 <Label className="text-[10px] font-black uppercase text-zinc-500">Volume (Lots)</Label>
                 <div className="flex items-center gap-2">
                    <button onClick={() => setLots(Math.max(0.01, lots - 0.01))} className="w-10 h-11 bg-zinc-900 rounded-lg border border-zinc-800"><BottomPanelChevronDown className="w-4 h-4" /></button>
                    <Input type="number" step="0.01" value={lots} onChange={(e) => setLots(parseFloat(e.target.value) || 0)} className="h-11 bg-zinc-900/50 text-center font-mono font-bold text-white" />
                    <button onClick={() => setLots(lots + 0.01)} className="w-10 h-11 bg-zinc-900 rounded-lg border border-zinc-800"><BottomPanelChevronUp className="w-4 h-4" /></button>
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
                  disabled={actionLoading || !isPriceValid} 
                  className="w-full h-16 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-sm tracking-widest transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {actionLoading ? <Loader2 className="animate-spin w-6 h-6 mx-auto" /> : !isPriceValid ? 'PRICE SYNCING...' : 'BUY BY MARKET'}
                </button>
                <button 
                  type="button" 
                  onClick={() => placeTrade('sell')} 
                  disabled={actionLoading || !isPriceValid} 
                  className="w-full h-16 bg-red-600 hover:bg-red-700 text-white rounded-xl font-black text-sm tracking-widest transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {actionLoading ? <Loader2 className="animate-spin w-6 h-6 mx-auto" /> : !isPriceValid ? 'PRICE SYNCING...' : 'SELL BY MARKET'}
                </button>
              </div>
           </div>
        </aside>
      </div>

      <ChartSettingsModal open={isSettingsOpen} onOpenChange={setIsSettingsOpen} settings={chartSettings} onSettingsChange={setChartSettings} onResetScale={handleResetView} />
      
      <Dialog open={isAlertModalOpen} onOpenChange={setIsAlertModalOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle>Set Price Alert</DialogTitle>
            <DialogDescription className="sr-only">Configure a new price alert for {selectedSymbol}.</DialogDescription>
          </DialogHeader>
          <div className="p-6">
            <h2 className="text-xl font-bold mb-4">Set Price Alert</h2>
            <Button className="w-full h-12 font-black cyan-box-glow" onClick={() => setIsAlertModalOpen(false)}>
              CREATE ALERT
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteAllOpen} onOpenChange={setIsDeleteAllOpen}>
        <DialogContent className="bg-[#1c1c1c] border-zinc-800 text-white max-w-sm p-0 overflow-hidden">
          <DialogHeader className="sr-only">
            <DialogTitle>Clear All Drawings</DialogTitle>
            <DialogDescription>Permanently delete all technical analysis drawings from the chart.</DialogDescription>
          </DialogHeader>
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-3 text-destructive">
              <AlertCircle className="w-6 h-6" />
              <h2 className="text-xl font-headline font-bold">Clear Canvas?</h2>
            </div>
            <p className="text-sm text-zinc-400">
              This will permanently delete all technical analysis drawings for <span className="text-white font-bold">{selectedSymbol}</span>.
            </p>
          </div>
          <DialogFooter className="p-4 bg-zinc-900/50 flex gap-2">
            <Button variant="ghost" className="flex-1 font-bold h-11" onClick={() => setIsDeleteAllOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" className="flex-1 font-black h-11" onClick={() => { setActiveTool('eraser'); setIsDeleteAllOpen(false); }}>
              Clear All
            </Button>
          </DialogFooter>
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

function BottomPanelChevronDown(props: any) {
  return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>;
}

function BottomPanelChevronUp(props: any) {
  return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6"/></svg>;
}
