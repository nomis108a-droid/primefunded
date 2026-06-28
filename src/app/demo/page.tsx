'use client';

import { useEffect, useState, useMemo, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { useFirestore, useCollection } from "@/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuRadioGroup, DropdownMenuRadioItem } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  Loader2,
  ArrowLeft,
  MousePointer2,
  Minus,
  Plus,
  Layers,
  LayoutGrid,
  Magnet,
  Zap,
  Eraser,
  TrendingUp,
  ShoppingBag,
  LineChart,
  Settings,
  CandlestickChart,
  BarChart3,
  AreaChart,
  Activity,
  Clock,
  Globe,
  Type,
  Square,
  Bell,
  ArrowUp,
  ArrowDown,
  Slash,
  ArrowUpRight,
  ArrowUpCircle,
  ArrowDownCircle,
  ArrowRight,
  Tag,
  RectangleHorizontal,
  Box,
  GripVertical
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { where, orderBy, limit } from "firebase/firestore";
import { createChart, ColorType, IChartApi, ISeriesApi, IPriceLine } from 'lightweight-charts';
import Link from 'next/link';
import Image from 'next/image';
import { useBrandSettings } from '@/hooks/use-brand-settings';
import { differenceInSeconds } from 'date-fns';
import { getTradeDate } from '@/lib/tradeUtils';
import { PositionsPanel } from './PositionsPanel';
import * as Indicators from "@/lib/indicators";
import { DrawingLayer } from "./DrawingLayer";

const SYMBOLS = ["XAUUSD", "BTCUSD", "ETHUSD", "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCHF"];
const TIMEFRAMES = [
  { label: '1m', value: '1min' },
  { label: '5m', value: '5min' },
  { label: '15m', value: '15min' },
  { label: '30m', value: '30min' },
  { label: '1h', value: '1h' },
  { label: '2h', value: '2h' },
  { label: '4h', value: '4h' },
  { label: '1D', value: '1day' },
  { label: '1W', value: '1week' },
  { label: '1M', value: '1month' },
];

const TIMEZONES = [
  { label: 'Local Time', value: 'local' },
  { label: 'UTC', value: 'UTC' },
  { label: 'New York (EST)', value: 'America/New_York' },
  { label: 'London (GMT)', value: 'Europe/London' },
  { label: 'Tokyo (JST)', value: 'Asia/Tokyo' },
  { label: 'Sydney (AEST)', value: 'Australia/Sydney' },
];

const getPrecision = (s: string) => (s === "USDJPY" ? 3 : (s === "XAUUSD" || s === "BTCUSD" || s === "ETHUSD" ? 2 : 5));
const formatPrice = (price: number | undefined, symbol: string) => price ? price.toFixed(getPrecision(symbol)) : '—';

export default function DemoPage() {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const branding = useBrandSettings();

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
  const [alertTargetPrice, setAlertTargetPrice] = useState("");
  const [alertCondition, setAlertCondition] = useState<"above" | "below">("above");

  const [activeTool, setActiveTool] = useState<string>('pointer');
  const [magnetMode, setMagnetMode] = useState(false);
  
  const [indicatorState, setIndicatorState] = useState<Record<string, boolean>>({
    ema9: false, ema21: false, ema50: false, ema200: false,
    bb: false, rsi: false, macd: false, atr: false, volume: true, sessions: true
  });

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<IChartApi | null>(null);
  const mainSeriesRef = useRef<ISeriesApi<any> | null>(null);
  const currentCandleRef = useRef<any>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const drawingLinesRef = useRef<IPriceLine[]>([]);
  const indicatorSeriesRef = useRef<Record<string, ISeriesApi<any>>>({});

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
      } catch (e: any) {}
    };
    fetchPrices();
    const timer = window.setInterval(fetchPrices, 3000);
    return () => { isMounted = false; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!chartContainerRef.current) return;
    const chart = createChart(chartContainerRef.current, {
      layout: { background: { type: ColorType.Solid, color: '#09090b' }, textColor: '#71717a' },
      grid: { vertLines: { color: '#18181b' }, horzLines: { color: '#18181b' } },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight || 480,
      timeScale: { borderColor: '#27272a', timeVisible: true, secondsVisible: false },
      localization: {
        timeFormatter: (time: number) => {
          if (selectedTimezone === 'local') {
            return new Date(time * 1000).toLocaleString();
          }
          return new Date(time * 1000).toLocaleString('en-US', { timeZone: selectedTimezone });
        }
      }
    });
    
    chartInstanceRef.current = chart;
    setIsChartReady(true);
    
    const handleResize = () => {
      if (chartContainerRef.current && chartInstanceRef.current) {
        try {
          chartInstanceRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
        } catch (e) {}
      }
    };
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartInstanceRef.current) {
        try {
          chartInstanceRef.current.remove();
        } catch (e) {}
        chartInstanceRef.current = null;
      }
      mainSeriesRef.current = null;
      currentCandleRef.current = null;
      priceLinesRef.current = [];
      drawingLinesRef.current = [];
      indicatorSeriesRef.current = {};
      setIsChartReady(false);
    };
  }, [selectedTimezone]);

  useEffect(() => {
    if (!isChartReady || !chartInstanceRef.current) return;
    let isMounted = true;
    
    const fetchHistory = async () => {
      if (!chartInstanceRef.current) return;
      setIsChartLoading(true);
      
      try {
        const res = await fetch(`/api/terminal/candles?symbol=${selectedSymbol}&interval=${selectedInterval}`);
        if (!res.ok) throw new Error("Feed Offline");
        const data = await res.json();
        if (!isMounted || !chartInstanceRef.current) return;
        
        const candles = Array.isArray(data) ? data : (data.candles || []);
        if (candles.length > 0) {
          try {
            if (mainSeriesRef.current) {
              chartInstanceRef.current.removeSeries(mainSeriesRef.current);
            }

            const commonOptions = {
              priceFormat: { type: 'price', precision: getPrecision(selectedSymbol), minMove: 1 / Math.pow(10, getPrecision(selectedSymbol)) },
            };

            if (chartType === 'candles') {
              mainSeriesRef.current = chartInstanceRef.current.addCandlestickSeries({ 
                ...commonOptions,
                upColor: '#10b981', downColor: '#ef4444', borderVisible: false, wickUpColor: '#10b981', wickDownColor: '#ef4444' 
              });
            } else if (chartType === 'bars') {
              mainSeriesRef.current = chartInstanceRef.current.addBarSeries({ 
                ...commonOptions,
                upColor: '#10b981', downColor: '#ef4444' 
              });
            } else if (chartType === 'line') {
              mainSeriesRef.current = chartInstanceRef.current.addLineSeries({ 
                ...commonOptions,
                color: '#3b82f6', lineWidth: 2 
              });
            } else if (chartType === 'area') {
              mainSeriesRef.current = chartInstanceRef.current.addAreaSeries({ 
                ...commonOptions,
                topColor: 'rgba(59, 130, 246, 0.4)', bottomColor: 'rgba(59, 130, 246, 0.0)', lineColor: '#3b82f6', lineWidth: 2 
              });
            } else if (chartType === 'baseline') {
              mainSeriesRef.current = chartInstanceRef.current.addBaselineSeries({ 
                ...commonOptions,
                baseValue: { type: 'price', price: candles[0].close },
                topFillColor1: 'rgba(16, 185, 129, 0.2)', topFillColor2: 'rgba(16, 185, 129, 0.0)',
                topLineColor: '#10b981',
                bottomFillColor1: 'rgba(239, 68, 68, 0.0)', bottomFillColor2: 'rgba(239, 68, 68, 0.2)',
                bottomLineColor: '#ef4444',
              });
            }

            if (mainSeriesRef.current) {
              if (chartType === 'candles' || chartType === 'bars') {
                mainSeriesRef.current.setData(candles);
              } else {
                mainSeriesRef.current.setData(candles.map((c: any) => ({ time: c.time, value: c.close })));
              }
            }
            
            Object.values(indicatorSeriesRef.current).forEach(s => {
              try { chartInstanceRef.current?.removeSeries(s); } catch (e) {}
            });
            indicatorSeriesRef.current = {};

            const closes = candles.map((c: any) => c.close);
            const times = candles.map((c: any) => c.time);

            if (indicatorState.sessions && !selectedInterval.includes('day')) {
               const sessionSeries = chartInstanceRef.current.addHistogramSeries({ 
                 priceScaleId: 'session_shading',
                 color: 'transparent',
                 priceFormat: { type: 'price' } 
               });
               chartInstanceRef.current.priceScale('session_shading').applyOptions({ scaleMargins: { top: 0, bottom: 0 }, visible: false });
               
               const sessionData = candles.map((c: any) => {
                 const utcHour = new Date(c.time * 1000).getUTCHours();
                 let color = 'transparent';
                 if (utcHour >= 13 && utcHour <= 21) color = 'rgba(245, 158, 11, 0.05)'; // NY
                 else if (utcHour >= 8 && utcHour <= 16) color = 'rgba(59, 130, 246, 0.05)'; // London
                 
                 return { time: c.time, value: 1000000, color };
               });
               sessionSeries.setData(sessionData);
               indicatorSeriesRef.current['sessions'] = sessionSeries;
            }

            const emaPeriods = { ema9: 9, ema21: 21, ema50: 50, ema200: 200 };
            const emaColors = { ema9: '#3b82f6', ema21: '#f59e0b', ema50: '#ec4899', ema200: '#8b5cf6' };
            Object.entries(emaPeriods).forEach(([key, period]) => {
              if (indicatorState[key]) {
                const emaData = Indicators.calculateEMA(closes, period);
                const series = chartInstanceRef.current!.addLineSeries({ color: emaColors[key as keyof typeof emaColors], lineWidth: 1, title: key.toUpperCase() });
                series.setData(emaData.map((v, i) => ({ time: times[i], value: v })));
                indicatorSeriesRef.current[key] = series;
              }
            });

            if (indicatorState.bb) {
              const bb = Indicators.calculateBollingerBands(closes);
              const common = { lineWidth: 1, lineStyle: 2 };
              const u = chartInstanceRef.current.addLineSeries({ ...common, color: '#4ade80', title: 'BB Upper' });
              const l = chartInstanceRef.current.addLineSeries({ ...common, color: '#4ade80', title: 'BB Lower' });
              const m = chartInstanceRef.current.addLineSeries({ ...common, color: '#4ade80', title: 'BB Mid', lineStyle: 0 });
              u.setData(bb.upper.map((v, i) => ({ time: times[i], value: v })).filter(d => d.value !== null));
              l.setData(bb.lower.map((v, i) => ({ time: times[i], value: v })).filter(d => d.value !== null));
              m.setData(bb.middle.map((v, i) => ({ time: times[i], value: v })).filter(d => d.value !== null));
              indicatorSeriesRef.current['bb_u'] = u; indicatorSeriesRef.current['bb_l'] = l; indicatorSeriesRef.current['bb_m'] = m;
            }

            if (indicatorState.volume) {
              const volSeries = chartInstanceRef.current.addHistogramSeries({ color: '#26a69a', priceFormat: { type: 'volume' }, priceScaleId: 'volume' });
              chartInstanceRef.current.priceScale('volume').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
              volSeries.setData(candles.map((c: any) => ({ time: c.time, value: c.volume || Math.random() * 100, color: c.close >= c.open ? 'rgba(16, 185, 129, 0.5)' : 'rgba(239, 68, 68, 0.5)' })));
              indicatorSeriesRef.current['volume'] = volSeries;
            }

            if (indicatorState.rsi) {
              const rsiData = Indicators.calculateRSI(closes);
              const rsiSeries = chartInstanceRef.current.addLineSeries({ color: '#8b5cf6', lineWidth: 2, priceScaleId: 'rsi', title: 'RSI' });
              chartInstanceRef.current.priceScale('rsi').applyOptions({ scaleMargins: { top: 0.1, bottom: 0.7 } });
              rsiSeries.setData(rsiData.map((v, i) => ({ time: times[i], value: v })).filter(d => d.value !== null));
              indicatorSeriesRef.current['rsi'] = rsiSeries;
            }

            if (indicatorState.macd) {
              const macd = Indicators.calculateMACD(closes);
              const mLine = chartInstanceRef.current.addLineSeries({ color: '#3b82f6', lineWidth: 1, priceScaleId: 'macd' });
              const sLine = chartInstanceRef.current.addLineSeries({ color: '#f59e0b', lineWidth: 1, priceScaleId: 'macd' });
              const hist = chartInstanceRef.current.addHistogramSeries({ priceScaleId: 'macd' });
              chartInstanceRef.current.priceScale('macd').applyOptions({ scaleMargins: { top: 0.4, bottom: 0.4 } });
              mLine.setData(macd.macdLine.map((v, i) => ({ time: times[i], value: v })).filter(d => d.value !== null));
              sLine.setData(macd.signalLine.map((v, i) => ({ time: times[i], value: v })).filter(d => d.value !== null));
              hist.setData(macd.histogram.map((v, i) => ({ time: times[i], value: v, color: (v || 0) >= 0 ? '#10b981' : '#ef4444' })).filter(d => d.value !== null));
              indicatorSeriesRef.current['macd_l'] = mLine; indicatorSeriesRef.current['macd_s'] = sLine; indicatorSeriesRef.current['macd_h'] = hist;
            }

            if (indicatorState.atr) {
              const atrData = Indicators.calculateATR(candles);
              const atrSeries = chartInstanceRef.current.addLineSeries({ color: '#ef4444', lineWidth: 1, priceScaleId: 'atr', title: 'ATR' });
              chartInstanceRef.current.priceScale('atr').applyOptions({ scaleMargins: { top: 0.7, bottom: 0.1 } });
              atrSeries.setData(atrData.map((v, i) => ({ time: times[i], value: v })).filter(d => d.value !== null));
              indicatorSeriesRef.current['atr'] = atrSeries;
            }

            chartInstanceRef.current.timeScale().fitContent();
          } catch (e) {}
        }
      } catch (err: any) {
        console.warn("[Chart] History unavailable:", err.message);
      } finally {
        if (isMounted) setIsChartLoading(false);
      }
    };
    fetchHistory();
    return () => { isMounted = false; };
  }, [isChartReady, selectedSymbol, selectedInterval, chartType, indicatorState]);

  useEffect(() => {
    if (!mainSeriesRef.current || !chartInstanceRef.current || !livePrices[selectedSymbol]) return;
    const price = livePrices[selectedSymbol].price;
    if (!price || price <= 0) return;
    const secs = { '1min': 60, '5min': 300, '15min': 900, '30min': 1800, '1h': 3600, '2h': 7200, '4h': 14400, '1day': 86400, '1week': 604800, '1month': 2592000 }[selectedInterval] || 300;
    const candleTime = Math.floor(Math.floor(Date.now() / 1000) / (secs as any)) * (secs as any);
    const cur = currentCandleRef.current;
    
    try {
      if (chartType === 'candles' || chartType === 'bars') {
        if (!cur || cur.time !== candleTime) {
          const next = { time: candleTime, open: price, high: price, low: price, close: price };
          currentCandleRef.current = next;
          mainSeriesRef.current.update(next as any);
        } else {
          cur.high = Math.max(cur.high, price);
          cur.low = Math.min(cur.low, price);
          cur.close = price;
          mainSeriesRef.current.update({ ...cur, close: price } as any);
        }
      } else {
        mainSeriesRef.current.update({ time: candleTime, value: price });
      }
    } catch (e) {}
  }, [livePrices[selectedSymbol], selectedSymbol, selectedInterval, chartType]);

  const accountConstraints = useMemo(() => user?.uid ? [where("userId", "==", user.uid)] : [], [user?.uid]);
  const { data: accounts } = useCollection<any>(user?.uid ? "demoAccounts" : null, accountConstraints);

  useEffect(() => {
    if (accounts.length > 0 && !currentAccountId) setCurrentAccountId(accounts[0].id);
  }, [accounts, currentAccountId]);

  const tradeConstraints = useMemo(() => {
    if (!user?.uid || !currentAccountId) return [];
    return [where("userId", "==", user.uid), where("accountId", "==", currentAccountId), where("status", "==", "open")];
  }, [user?.uid, currentAccountId]);

  const { data: openTrades } = useCollection<any>((user?.uid && currentAccountId) ? "demoTrades" : null, tradeConstraints);

  const historyConstraints = useMemo(() => {
    if (!user?.uid || !currentAccountId) return [];
    return [where("userId", "==", user.uid), where("accountId", "==", currentAccountId), where("status", "==", "closed"), orderBy("closedAt", "desc"), limit(50)];
  }, [user?.uid, currentAccountId]);

  const { data: closedTrades } = useCollection<any>((user?.uid && currentAccountId) ? "demoTrades" : null, historyConstraints);

  const alertConstraints = useMemo(() => {
    if (!user?.uid) return [];
    return [where("userId", "==", user.uid), orderBy("createdAt", "desc")];
  }, [user?.uid]);

  const { data: alerts, loading: alertsLoading } = useCollection<any>(user?.uid ? "alerts" : null, alertConstraints);

  const currentAccount = useMemo(() => accounts.find((a) => a.id === currentAccountId), [accounts, currentAccountId]);
  
  const metrics = useMemo(() => {
    if (!currentAccount) return { equity: 0, floatingPnL: 0 };
    let floating = 0;
    openTrades.forEach(trade => {
      const pData = livePrices[trade.symbol] || livePrices[trade.symbol?.toUpperCase()];
      if (pData) {
        const cp = trade.type === 'buy' ? pData.bid : pData.ask;
        const cSize = trade.symbol === 'XAUUSD' ? 100 : ['BTCUSD', 'ETHUSD', 'XRPUSD', 'SOLUSD', 'DOGEUSD', 'ADAUSD', 'BNBUSD'].includes(trade.symbol) ? 1 : 100000;
        floating += trade.type === 'buy' ? (cp - trade.openPrice) * cSize * trade.lots : (trade.openPrice - cp) * cSize * trade.lots;
      }
    });
    return { equity: (currentAccount.balance || 0) + floating, floatingPnL: floating };
  }, [currentAccount, openTrades, livePrices]);

  useEffect(() => {
    if (!mainSeriesRef.current || !chartInstanceRef.current) return;
    
    try {
      priceLinesRef.current.forEach(line => {
        try { mainSeriesRef.current?.removePriceLine(line); } catch (e) {}
      });
      priceLinesRef.current = [];
      
      const pData = livePrices[selectedSymbol];
      
      openTrades.filter(t => t.symbol === selectedSymbol).forEach(t => {
        let pnlText = "";
        if (pData) {
          const cp = t.type === 'buy' ? pData.bid : pData.ask;
          const cSize = t.symbol === 'XAUUSD' ? 100 : ['BTCUSD', 'ETHUSD', 'XRPUSD', 'SOLUSD', 'DOGEUSD', 'ADAUSD', 'BNBUSD'].includes(t.symbol) ? 1 : 100000;
          const pnl = t.type === 'buy' ? (cp - t.openPrice) * cSize * t.lots : (t.openPrice - cp) * cSize * t.lots;
          pnlText = ` (${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} USD)`;
        }
        const entry = mainSeriesRef.current?.createPriceLine({ price: t.openPrice, color: '#3b82f6', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: `${t.type.toUpperCase()} ${t.lots}${pnlText}` });
        if (entry) priceLinesRef.current.push(entry);
        if (t.sl) {
          const line = mainSeriesRef.current?.createPriceLine({ price: t.sl, color: '#ef4444', lineWidth: 1, lineStyle: 1, axisLabelVisible: true, title: `SL: ${formatPrice(t.sl, selectedSymbol)}` });
          if (line) priceLinesRef.current.push(line);
        }
        if (t.tp) {
          const line = mainSeriesRef.current?.createPriceLine({ price: t.tp, color: '#10b981', lineWidth: 1, lineStyle: 1, axisLabelVisible: true, title: `TP: ${formatPrice(t.tp, selectedSymbol)}` });
          if (line) priceLinesRef.current.push(line);
        }
      });

      alerts.filter(a => a.symbol === selectedSymbol && a.status === 'active').forEach(a => {
        const line = mainSeriesRef.current?.createPriceLine({ 
          price: a.targetPrice, 
          color: '#f59e0b', 
          lineWidth: 1, 
          lineStyle: 3, 
          axisLabelVisible: true, 
          title: `ALERT ${a.condition.toUpperCase()}` 
        });
        if (line) priceLinesRef.current.push(line);
      });
    } catch (e) {}
  }, [openTrades, alerts, selectedSymbol, livePrices[selectedSymbol], chartType, isChartReady]);

  async function placeTrade(type: "buy" | "sell") {
    if (!user || !currentAccountId || !livePrices[selectedSymbol]) return;
    setActionLoading(true);
    try {
      const token = await user.getIdToken();
      const p = livePrices[selectedSymbol];
      const executionPrice = type === 'buy' ? p.ask : p.bid;
      const res = await fetch("/api/terminal/trades", {
        method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ accountId: currentAccountId, symbol: selectedSymbol, type, lots, price: executionPrice, sl: sl ? parseFloat(sl) : null, tp: tp ? parseFloat(tp) : null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.details || "Rejected.");
      toast({ title: "Order Executed", description: `${type.toUpperCase()} at ${executionPrice.toFixed(2)}` });
      setSl(""); setTp("");
    } catch (err: any) {
      toast({ variant: "destructive", title: "Execution Error", description: err.message });
    } finally { setActionLoading(false); }
  }

  async function closeTrade(tradeId: string) {
    try {
      setActionLoading(true);
      const trade = openTrades.find(t => t.id === tradeId);
      if (!trade) return;

      const openDate = getTradeDate(trade.openedAt);
      if (openDate && differenceInSeconds(new Date(), openDate) < 120) {
        toast({ variant: "destructive", title: "Hold Time Violation", description: `Please wait ${120 - differenceInSeconds(new Date(), openDate)}s before closing.` });
        return;
      }

      const pricesRes = await fetch('/api/terminal/live-prices');
      const prices = await pricesRes.json();
      
      const priceData = prices[trade.symbol] 
        || prices[trade.symbol?.toUpperCase()]
        || prices[trade.symbol?.replace('USD','USDT')]
        || livePrices[trade.symbol]
        || livePrices[selectedSymbol];

      const closePrice = trade.type === 'buy'
        ? (priceData?.bid || priceData?.price || 0)
        : (priceData?.ask || priceData?.price || 0);

      if (!closePrice || closePrice <= 0) {
        toast({ 
          title: "Cannot Close", 
          description: `No live price available for ${trade.symbol}. Please try again.`,
          variant: "destructive" 
        });
        return;
      }

      const token = await user?.getIdToken();
      const res = await fetch(`/api/terminal/trades/${tradeId}/close`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ closePrice })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({ 
          title: "Close Failed", 
          description: err.error || `Server error ${res.status}`,
          variant: "destructive" 
        });
        return;
      }
      toast({ title: "✓ Position Closed", description: `${trade.symbol} closed at ${closePrice.toFixed(2)}` });
    } catch (e: any) {
      toast({ title: "Close Error", description: e.message, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  }

  const toggleIndicator = (id: string) => {
    setIndicatorState(prev => ({ ...prev, [id]: !prev[id] }));
  };

  async function createAlert() {
    if (!user || !alertTargetPrice) return;
    setActionLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/terminal/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ symbol: selectedSymbol, condition: alertCondition, targetPrice: parseFloat(alertTargetPrice) })
      });
      if (!res.ok) throw new Error("Failed to set alert.");
      toast({ title: "Alert Synchronized", description: `${selectedSymbol} level monitor active.` });
      setIsAlertModalOpen(false);
      setAlertTargetPrice("");
    } catch (err: any) {
      toast({ variant: "destructive", title: "Alert Error", description: err.message });
    } finally {
      setActionLoading(false);
    }
  }

  async function deleteAlert(id: string) {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/terminal/alerts?id=${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to cancel alert.");
      toast({ title: "Alert Cancelled" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Cancel Error", description: err.message });
    }
  }

  if (authLoading) return <div className="fixed inset-0 bg-[#09090b] flex items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>;

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
              <Badge className={cn("text-[10px] font-black uppercase h-5 px-3 border-none", currentAccount.status === 'active' ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500")}>{currentAccount.status}</Badge>
            </div>
          )}
          
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-9 px-3 gap-2 text-xs font-bold text-zinc-400 hover:text-white hover:bg-white/5" onClick={() => {
              setAlertTargetPrice(livePrices[selectedSymbol]?.price?.toString() || "");
              setIsAlertModalOpen(true);
            }}>
              <Bell className="w-4 h-4" /> Set Alert
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-9 px-3 gap-2 text-xs font-bold text-zinc-400 hover:text-white hover:bg-white/5">
                  <Globe className="w-4 h-4" /> {TIMEZONES.find(t => t.value === selectedTimezone)?.label || 'Timezone'}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="bg-zinc-900 border-zinc-800 text-white w-48">
                <DropdownMenuRadioGroup value={selectedTimezone} onValueChange={setSelectedTimezone}>
                  {TIMEZONES.map((tz) => (
                    <DropdownMenuRadioItem key={tz.value} value={tz.value}>{tz.label}</DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-9 px-3 gap-2 text-xs font-bold text-zinc-400 hover:text-white hover:bg-white/5">
                  <LayoutGrid className="w-4 h-4" /> Chart Type
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="bg-zinc-900 border-zinc-800 text-white w-48">
                <DropdownMenuRadioGroup value={chartType} onValueChange={setChartType}>
                  <DropdownMenuRadioItem value="candles" className="gap-2"><CandlestickChart className="w-3.5 h-3.5" /> Candlesticks</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="bars" className="gap-2"><BarChart3 className="w-3.5 h-3.5" /> OHLC Bars</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="line" className="gap-2"><LineChart className="w-3.5 h-3.5" /> Line</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="area" className="gap-2"><AreaChart className="w-3.5 h-3.5" /> Area</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="baseline" className="gap-2"><TrendingUp className="w-3.5 h-3.5" /> Baseline</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-9 px-3 gap-2 text-xs font-bold text-zinc-400 hover:text-white hover:bg-white/5">
                  <Activity className="w-4 h-4" /> Indicators
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="bg-zinc-900 border-zinc-800 text-white w-56">
                <div className="px-2 py-2 text-[10px] font-black uppercase text-zinc-500 tracking-widest">Main Chart</div>
                <DropdownMenuCheckboxItem checked={indicatorState.ema9} onCheckedChange={() => toggleIndicator('ema9')}>EMA 9 (Blue)</DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem checked={indicatorState.ema21} onCheckedChange={() => toggleIndicator('ema21')}>EMA 21 (Orange)</DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem checked={indicatorState.ema50} onCheckedChange={() => toggleIndicator('ema50')}>EMA 50 (Pink)</DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem checked={indicatorState.ema200} onCheckedChange={() => toggleIndicator('ema200')}>EMA 200 (Purple)</DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem checked={indicatorState.bb} onCheckedChange={() => toggleIndicator('bb')}>Bollinger Bands</DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem checked={indicatorState.sessions} onCheckedChange={() => toggleIndicator('sessions')}>Session Shading</DropdownMenuCheckboxItem>
                <DropdownMenuSeparator className="bg-zinc-800" />
                <div className="px-2 py-2 text-[10px] font-black uppercase text-zinc-500 tracking-widest">Sub Panes</div>
                <DropdownMenuCheckboxItem checked={indicatorState.volume} onCheckedChange={() => toggleIndicator('volume')}>Volume</DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem checked={indicatorState.rsi} onCheckedChange={() => toggleIndicator('rsi')}>RSI (14)</DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem checked={indicatorState.macd} onCheckedChange={() => toggleIndicator('macd')}>MACD</DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem checked={indicatorState.atr} onCheckedChange={() => toggleIndicator('atr')}>ATR (14)</DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <Select value={currentAccountId ?? ""} onValueChange={setCurrentAccountId}>
            <SelectTrigger className="bg-transparent border-none h-12 w-56 text-xs font-bold hover:bg-white/5 transition-colors focus:ring-0">
              <SelectValue placeholder="Select Account" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
              {accounts.map((a) => <SelectItem key={a.id} value={a.id} className="focus:bg-zinc-800 cursor-pointer">{a.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </header>

      <div className="flex-1 flex min-h-0 relative">
        <div className="flex-1 flex flex-col min-w-0 bg-[#09090b]">
          <div className="h-10 border-b border-zinc-800 flex items-center px-1 gap-1 bg-zinc-950/50 overflow-x-auto no-scrollbar shrink-0">
            {SYMBOLS.map((s) => (
              <button key={s} onClick={() => setSelectedSymbol(s)} className={cn("px-4 h-full flex items-center gap-3 transition-all border-b-2 shrink-0", s === selectedSymbol ? "border-primary bg-primary/5" : "border-transparent hover:bg-white/5")}>
                <span className={cn("font-bold text-[11px]", s === selectedSymbol ? "text-white" : "text-zinc-500")}>{s}</span>
                <span className="font-mono text-[10px] tabular-nums text-zinc-400">{formatPrice(livePrices[s]?.price, s)}</span>
              </button>
            ))}
          </div>

          <div className="h-10 border-b border-zinc-800 flex items-center justify-between px-4 bg-zinc-950/30 shrink-0">
            <div className="flex items-center gap-1 bg-zinc-900/50 p-0.5 rounded-lg border border-zinc-800 overflow-x-auto no-scrollbar">
              {TIMEFRAMES.map((tf) => <button key={tf.value} onClick={() => setSelectedInterval(tf.value)} className={cn("px-2 py-1 rounded-md text-[9px] font-black uppercase transition-all whitespace-nowrap", selectedInterval === tf.value ? "bg-zinc-800 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-300")}>{tf.label}</button>)}
            </div>
          </div>

          <div className="flex-1 relative min-h-0 bg-[#09090b]">
            <aside className="absolute left-0 top-0 bottom-0 w-12 border-r border-zinc-800 bg-zinc-950/80 backdrop-blur-md flex flex-col items-center py-4 gap-2 z-40 overflow-y-auto no-scrollbar">
              <TooltipProvider>
                <ToolIcon name="Cursor" icon={<MousePointer2 className="w-4 h-4" />} active={activeTool === 'pointer'} onClick={() => setActiveTool('pointer')} />
                <div className="w-8 h-px bg-zinc-800 my-1 shrink-0" />
                <ToolIcon name="Trend Line" icon={<Slash className="w-4 h-4" />} active={activeTool === 'trend'} onClick={() => setActiveTool('trend')} />
                <ToolIcon name="Horizontal Line" icon={<Minus className="w-4 h-4" />} active={activeTool === 'hline'} onClick={() => setActiveTool('hline')} />
                <ToolIcon name="Vertical Line" icon={<GripVertical className="w-4 h-4" />} active={activeTool === 'vline'} onClick={() => setActiveTool('vline')} />
                <ToolIcon name="Ray" icon={<ArrowUpRight className="w-4 h-4" />} active={activeTool === 'ray'} onClick={() => setActiveTool('ray')} />
                <ToolIcon name="Rectangle" icon={<Square className="w-4 h-4" />} active={activeTool === 'rect'} onClick={() => setActiveTool('rect')} />
                <ToolIcon name="Fib Retracement" icon={<Layers className="w-4 h-4" />} active={activeTool === 'fib'} onClick={() => setActiveTool('fib')} />
                <ToolIcon name="Long Position" icon={<ArrowUpCircle className="w-4 h-4" />} active={activeTool === 'long'} onClick={() => setActiveTool('long')} />
                <ToolIcon name="Short Position" icon={<ArrowDownCircle className="w-4 h-4" />} active={activeTool === 'short'} onClick={() => setActiveTool('short')} />
                <ToolIcon name="Text" icon={<Type className="w-4 h-4" />} active={activeTool === 'text'} onClick={() => setActiveTool('text')} />
                <ToolIcon name="Arrow" icon={<ArrowRight className="w-4 h-4" />} active={activeTool === 'arrow'} onClick={() => setActiveTool('arrow')} />
                <ToolIcon name="Price Label" icon={<Tag className="w-4 h-4" />} active={activeTool === 'priceLabel'} onClick={() => setActiveTool('priceLabel')} />
                <ToolIcon name="S/R Zone" icon={<RectangleHorizontal className="w-4 h-4" />} active={activeTool === 'srZone'} onClick={() => setActiveTool('srZone')} />
                <ToolIcon name="Supply/Demand" icon={<Box className="w-4 h-4" />} active={activeTool === 'sdZone'} onClick={() => setActiveTool('sdZone')} />
                
                <div className="mt-auto flex flex-col gap-2 shrink-0">
                  <ToolIcon name="Magnet Mode" icon={<Magnet className="w-4 h-4" />} active={magnetMode} onClick={() => setMagnetMode(!magnetMode)} />
                  <ToolIcon name="Eraser" icon={<Eraser className="w-4 h-4" />} onClick={() => setActiveTool('eraser')} />
                </div>
              </TooltipProvider>
            </aside>

            {isChartLoading && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-zinc-950/80 backdrop-blur-sm">
                <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500">Syncing Feed...</p>
              </div>
            )}
            <div ref={chartContainerRef} className={cn("h-full w-full relative", activeTool !== 'pointer' && "cursor-crosshair")} />
            
            {isChartReady && chartInstanceRef.current && mainSeriesRef.current && (
              <DrawingLayer
                chart={chartInstanceRef.current}
                series={mainSeriesRef.current}
                symbol={selectedSymbol}
                activeTool={activeTool}
                setActiveTool={setActiveTool}
              />
            )}
          </div>
          
          <PositionsPanel 
            openTrades={openTrades} 
            closedTrades={closedTrades} 
            alerts={alerts}
            livePrices={livePrices} 
            closeTrade={(id) => closeTrade(id)} 
            deleteAlert={deleteAlert}
            user={user} 
            alertsLoading={alertsLoading}
          />
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
                 <Label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Order Volume (Lots)</Label>
                 <div className="flex items-center gap-2">
                    <button onClick={() => setLots(Math.max(0.01, lots - 0.01))} className="w-10 h-11 bg-zinc-900 hover:bg-zinc-800 flex items-center justify-center rounded-lg border border-zinc-800"><Minus className="w-4 h-4" /></button>
                    <Input type="number" step="0.01" value={lots} onChange={(e) => setLots(parseFloat(e.target.value) || 0)} className="h-11 bg-zinc-900/50 border-zinc-800 text-center font-mono font-bold text-lg text-white" />
                    <button onClick={() => setLots(lots + 0.01)} className="w-10 h-11 bg-zinc-900 hover:bg-zinc-800 flex items-center justify-center rounded-lg border border-zinc-800"><Plus className="w-4 h-4" /></button>
                 </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Stop Loss</Label><Input placeholder="0.00" value={sl} onChange={(e) => setSl(e.target.value)} className="h-11 bg-zinc-900/50 border-zinc-800 font-mono text-center" /></div>
                 <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Take Profit</Label><Input placeholder="0.00" value={tp} onChange={(e) => setTp(e.target.value)} className="h-11 bg-zinc-900/50 border-zinc-800 font-mono text-center" /></div>
              </div>
              <div className="space-y-4">
                {!currentAccount ? (
                  <Button asChild className="w-full h-16 rounded-xl cyan-box-glow font-black text-sm uppercase tracking-widest"><Link href="/challenges"><ShoppingBag className="w-5 h-5 mr-2" /> Start Challenge</Link></Button>
                ) : (
                  <>
                    <button type="button" className="w-full h-16 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white flex flex-col items-center justify-center gap-0.5 rounded-xl" onClick={() => placeTrade("buy")} disabled={actionLoading}><span className="font-black text-sm tracking-widest">{actionLoading ? "EXECUTING..." : "BUY BY MARKET"}</span>{livePrices[selectedSymbol] && !actionLoading && (<span className="font-mono text-xs opacity-80">{formatPrice(livePrices[selectedSymbol]?.ask, selectedSymbol)}</span>)}</button>
                    <button type="button" className="w-full h-16 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white flex flex-col items-center justify-center gap-0.5 rounded-xl" onClick={() => placeTrade("sell")} disabled={actionLoading}><span className="font-black text-sm tracking-widest">{actionLoading ? "EXECUTING..." : "SELL BY MARKET"}</span>{livePrices[selectedSymbol] && !actionLoading && (<span className="font-mono text-xs opacity-80">{formatPrice(livePrices[selectedSymbol]?.bid, selectedSymbol)}</span>)}</button>
                  </>
                )}
              </div>
           </div>
           <div className="mt-auto p-3 bg-primary/5 border border-primary/10 rounded-lg flex items-center gap-2"><Zap className="w-3.5 h-3.5 text-primary" /><p className="text-[10px] text-primary/80 font-bold">Institutional execution enabled. Leverage: 1:100</p></div>
        </aside>
      </div>

      <Dialog open={isAlertModalOpen} onOpenChange={setIsAlertModalOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-primary" /> Set Price Alert
            </DialogTitle>
            <DialogDescription className="text-zinc-500">
              Notify me when {selectedSymbol} crosses a target level.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="flex justify-between items-center bg-zinc-950 p-4 rounded-xl border border-zinc-800">
              <div>
                <p className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">Symbol</p>
                <p className="text-lg font-bold text-white">{selectedSymbol}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">Current</p>
                <p className="text-lg font-mono font-bold text-primary">{formatPrice(livePrices[selectedSymbol]?.price, selectedSymbol)}</p>
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">Condition</Label>
              <div className="grid grid-cols-2 gap-2">
                <button 
                  onClick={() => setAlertCondition("above")}
                  className={cn(
                    "flex items-center justify-center gap-2 h-11 rounded-lg border font-bold text-xs transition-all",
                    alertCondition === 'above' ? "bg-primary/10 border-primary text-primary" : "bg-zinc-950 border-zinc-800 text-zinc-500"
                  )}
                >
                  <ArrowUp className="w-3.5 h-3.5" /> Price Above
                </button>
                <button 
                  onClick={() => setAlertCondition("below")}
                  className={cn(
                    "flex items-center justify-center gap-2 h-11 rounded-lg border font-bold text-xs transition-all",
                    alertCondition === 'below' ? "bg-primary/10 border-primary text-primary" : "bg-zinc-950 border-zinc-800 text-zinc-500"
                  )}
                >
                  <ArrowDown className="w-3.5 h-3.5" /> Price Below
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">Target Price</Label>
              <Input 
                type="number" 
                value={alertTargetPrice} 
                onChange={e => setAlertTargetPrice(e.target.value)}
                className="h-12 bg-zinc-950 border-zinc-800 font-mono text-lg text-center font-bold" 
                placeholder="0.00000"
              />
            </div>
          </div>
          <DialogFooter>
            <Button className="w-full h-12 font-black cyan-box-glow" onClick={createAlert} disabled={actionLoading}>
              {actionLoading ? <Loader2 className="animate-spin w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
              CREATE PRICE ALERT
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
        <button 
          onClick={onClick}
          className={cn(
            "w-9 h-9 flex items-center justify-center rounded-lg transition-all shrink-0", 
            active ? "bg-primary text-black" : "text-zinc-600 hover:text-zinc-300 hover:bg-white/5"
          )}
        >
          {icon}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" className="bg-zinc-900 border-zinc-800 text-white font-bold text-[10px] uppercase tracking-widest">
        {name}
      </TooltipContent>
    </Tooltip>
  );
}
