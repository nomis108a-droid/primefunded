'use client';

import { useEffect, useState, useMemo, useRef, useCallback, Fragment } from "react";
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
  LayoutDashboard, TrendingUp, Wallet, Menu, X, UserCircle, Users, Eye, EyeOff, ShieldAlert
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
import { useLivePrices } from "@/hooks/useLivePrice";
import { useTickStream } from "@/hooks/useTickStream";
import { useIsMobile } from "@/hooks/use-mobile";

const SYMBOLS = [
  "XAUUSD", "XAGUSD", "XPTUSD", "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCHF", "USDCAD", "NZDUSD",
  "BTCUSD", "ETHUSD", "SOLUSD", "XRPUSD", "BNBUSD", "DOGEUSD", "ADAUSD"
];

const FOREX_METALS = ["XAUUSD", "XAGUSD", "XPTUSD", "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCHF", "USDCAD", "NZDUSD"];

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

const CONTRACT_SIZE: Record<string, number> = {
  XAUUSD: 100, XAGUSD: 5000, XPTUSD: 50,
  EURUSD: 100000, GBPUSD: 100000, USDJPY: 100000,
  AUDUSD: 100000, USDCHF: 100000, USDCAD: 100000, NZDUSD: 100000,
  BTCUSD: 1, ETHUSD: 1, SOLUSD: 1, XRPUSD: 1000,
  BNBUSD: 1, DOGEUSD: 1000, ADAUSD: 1000
};

const candleDataCache = new Map<string, { candles: any[], lastUpdated: number }>();

function getMarketInfo(symbol: string) {
  const isForexMetal = FOREX_METALS.includes(symbol.toUpperCase());
  if (!isForexMetal) return { isOpen: true, type: 'crypto', countdown: null };

  const now = new Date();
  const day = now.getUTCDay();
  const hour = now.getUTCHours();
  
  let isOpen = true;
  if (day === 5 && hour >= 21) isOpen = false; 
  if (day === 6) isOpen = false; 
  if (day === 0 && hour < 22) isOpen = false; 
  let countdown = null;
  if (!isOpen) {
    const nextOpen = new Date(now);
    let addDays = 0;
    if (day === 5) addDays = 2; 
    else if (day === 6) addDays = 1; 
    else if (day === 0) addDays = 0; 
    nextOpen.setUTCDate(now.getUTCDate() + addDays);
    nextOpen.setUTCHours(22, 0, 0, 0);
    
    const diffMs = nextOpen.getTime() - now.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    countdown = `Opens in ${diffHours}h ${diffMins}m`;
  }

  return { isOpen, type: 'forex', countdown };
}

function OrderPanel({ 
  hasMounted, 
  actionLoading, 
  isPriceValid, 
  hasPendingPayout, 
  marketInfo, 
  activePrice, 
  selectedSymbol, 
  lotsInput, 
  setLotsInput, 
  lots, 
  sl, 
  setSl, 
  tp, 
  setTp, 
  placeTrade 
}: any) {
  if (!hasMounted) {
    return (
      <div className="space-y-6">
        <div className="h-10 bg-zinc-900 border border-zinc-800 rounded-lg flex items-center justify-center">
          <span className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">Market Execution</span>
        </div>
        <div className="space-y-6">
          <div className="flex flex-col gap-2">
            <div className="w-20 h-3 bg-zinc-800 rounded mb-1 animate-pulse" />
            <div className="h-11 bg-zinc-900/50 rounded-lg border border-zinc-800 animate-pulse" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="h-14 bg-zinc-900/50 rounded-lg animate-pulse" />
            <div className="h-14 bg-zinc-900/50 rounded-lg animate-pulse" />
          </div>
          <div className="space-y-4">
            <div className="h-16 bg-zinc-800 rounded-xl animate-pulse" />
            <div className="h-16 bg-zinc-800 rounded-xl animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  const precision = selectedSymbol.includes('JPY') ? 3 : (selectedSymbol === 'XAUUSD' ? 2 : 5);

  return (
    <div className="space-y-6">
      <div className="h-10 bg-zinc-900/50 border border-zinc-800 rounded-lg flex flex-col items-center justify-center gap-1">
        <span className="text-[10px] font-black uppercase text-primary tracking-widest leading-none">Unified Market Feed</span>
        <div className="flex items-center gap-3 text-[9px] font-mono text-zinc-500">
          <span>BID: <span className="text-white">{activePrice?.bid?.toFixed(precision) || '---'}</span></span>
          <span className="w-px h-2 bg-zinc-800" />
          <span>ASK: <span className="text-white">{activePrice?.ask?.toFixed(precision) || '---'}</span></span>
        </div>
      </div>
      
      <div className="space-y-6">
        <div className="flex flex-col gap-2">
          <Label className="text-[10px] font-black uppercase text-zinc-500">Volume (Lots)</Label>
          <div className="flex items-center gap-2">
            <button onClick={() => setLotsInput(Math.max(0.01, lots - 0.01).toFixed(2))} className="w-10 h-11 bg-zinc-900 rounded-lg border border-zinc-800 font-bold hover:bg-zinc-800 transition-colors">-</button>
            <Input
              type="text"
              inputMode="decimal"
              value={lotsInput}
              onChange={(e) => { const val = e.target.value; if (/^\d*\.?\d*$/.test(val)) setLotsInput(val); }}
              onBlur={() => { const parsed = parseFloat(lotsInput); setLotsInput(isNaN(parsed) || parsed <= 0 ? "0.01" : parsed.toFixed(2)); }}
              className="h-11 bg-zinc-900/50 text-center font-mono font-bold text-white border-zinc-800"
            />
            <button onClick={() => setLotsInput((lots + 0.01).toFixed(2))} className="w-10 h-11 bg-zinc-900 rounded-lg border border-zinc-800 font-bold hover:bg-zinc-800 transition-colors">+</button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-zinc-500">Stop Loss</Label><Input placeholder="0.00" value={sl} onChange={(e) => setSl(e.target.value)} className="h-11 bg-zinc-900/50 border-zinc-800" /></div>
          <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-zinc-500">Take Profit</Label><Input placeholder="0.00" value={tp} onChange={(e) => setTp(e.target.value)} className="h-11 bg-zinc-900/50 border-zinc-800" /></div>
        </div>
        <div className="space-y-4">
          <button 
            type="button" 
            onClick={() => placeTrade('buy')} 
            disabled={actionLoading || !isPriceValid || hasPendingPayout || !marketInfo.isOpen} 
            className={cn(
              "w-full h-16 rounded-xl font-black text-xs tracking-widest transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed px-4 flex flex-col items-center justify-center gap-1",
              (hasPendingPayout || !marketInfo.isOpen) ? "bg-zinc-800 text-zinc-500" : 
              (!isPriceValid) ? "bg-zinc-800 text-muted-foreground" :
              "bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/10"
            )}
          >
            {actionLoading ? <Loader2 className="animate-spin w-5 h-5 mx-auto" /> : 
             hasPendingPayout ? <span>PAYOUT PENDING</span> : 
             !marketInfo.isOpen ? <span>MARKET CLOSED</span> :
             (!isPriceValid) ? <span>PRICE SYNCING...</span> : (
               <div className="flex flex-col items-center">
                 <span className="opacity-80 text-[10px]">BUY @ ASK (MARKET)</span>
                 <span className="text-base"> {Number(activePrice.ask || activePrice.price).toLocaleString('en-US', { minimumFractionDigits: precision })}</span>
               </div>
             )}
          </button>
          <button 
            type="button" 
            onClick={() => placeTrade('sell')} 
            disabled={actionLoading || !isPriceValid || hasPendingPayout || !marketInfo.isOpen} 
            className={cn(
              "w-full h-16 rounded-xl font-black text-xs tracking-widest transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed px-4 flex flex-col items-center justify-center gap-1",
              (hasPendingPayout || !marketInfo.isOpen) ? "bg-zinc-800 text-zinc-500" : 
              (!isPriceValid) ? "bg-zinc-800 text-muted-foreground" :
              "bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-500/10"
            )}
          >
            {actionLoading ? <Loader2 className="animate-spin w-5 h-5 mx-auto" /> : 
             hasPendingPayout ? <span>PAYOUT PENDING</span> : 
             !marketInfo.isOpen ? <span>MARKET CLOSED</span> :
             (!isPriceValid) ? <span>PRICE SYNCING...</span> : (
               <div className="flex flex-col items-center">
                 <span className="opacity-80 text-[10px]">SELL @ BID (MARKET)</span>
                 <span className="text-base"> {Number(activePrice.bid || activePrice.price).toLocaleString('en-US', { minimumFractionDigits: precision })}</span>
               </div>
             )}
          </button>
        </div>
      </div>
    </div>
  );
}

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
  const [chartError, setChartError] = useState<string | null>(null);
  const [isFallbackData, setIsFallbackData] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState("XAUUSD");
  const [selectedInterval, setSelectedInterval] = useState("1min");
  const [selectedTimezone, setSelectedTimezone] = useState("local");
  const [chartType, setChartType] = useState<string>("candles");
  
  const [lotsInput, setLotsInput] = useState("0.10");
  const lots = parseFloat(lotsInput) || 0;

  const [sl, setSl] = useState<string>("");
  const [tp, setTp] = useState<string>("");
  const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);
  const [countdown, setCountdown] = useState("00:00");

  const [marketInfo, setMarketInfo] = useState({ isOpen: true, type: 'crypto', countdown: null });
  
  const [bottomPanelOpen, setBottomPanelOpen] = useState(false);
  const [activeTool, setActiveTool] = useState<string>('crosshair');
  const [magnetMode, setMagnetMode] = useState(false);
  const [drawingsLocked, setDrawingsLocked] = useState(false);
  const [drawingsHidden, setDrawingsHidden] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDeleteAllOpen, setIsDeleteAllOpen] = useState(false);
  const [isOrderSheetOpen, setIsOrderSheetOpen] = useState(false);

  const [historyPrice, setHistoryPrice] = useState<number | null>(null);

  const [lastStateKey, setLastSymbolInterval] = useState("");
  const currentKey = `${selectedSymbol}-${selectedInterval}`;

  if (lastStateKey !== currentKey) {
    setLastSymbolInterval(currentKey);
    setHistoryPrice(null);
  }

  const [chartSettings, setChartSettings] = useState({
    scales: { mode: 'auto', type: 'regular', position: 'right', labels: { currentPrice: true, ohlc: true, prevClose: false, indicators: true, tradeLines: true }, lines: { lastPrice: true, prevClose: false, bid: true, ask: true, gridVert: true, gridHorz: true }, showPlusButton: true },
    canvas: { background: { type: 'solid', color: '#09090b', opacity: 1 }, grid: { type: 'both', vert: { color: '#18181b', opacity: 1 }, horz: { color: '#18181b', opacity: 1 } }, sessionBreaks: { enabled: false, color: '#27272a', width: 1, style: 2 }, crosshair: { mode: 'normal', color: '#71717a', width: 1, style: 1 }, watermark: { visible: false, color: 'rgba(171, 190, 192, 0.3)', fontSize: 48, text: '' }, scales: { textColor: '#71717a', fontSize: 12 }, candles: { upColor: '#10b981', downColor: '#ef4444', borderVisible: true, borderUpColor: '#10b981', borderDownColor: '#ef4444', wickUpColor: '#10b981', wickDownColor: '#ef4444' }, theme: 'dark' }
  });

  useEffect(() => {
    setHasMounted(true);
    const saved = localStorage.getItem('chartGlobalSettings');
    if (saved) {
      try {
        setChartSettings(JSON.parse(saved));
      } catch (e) {}
    }
  }, []);

  const { tick: streamTick, error: streamError } = useTickStream(selectedSymbol);
  const livePrices = useLivePrices(SYMBOLS);
  
  const closingTradesRef = useRef<Set<string>>(new Set());

  const { data: pendingPayouts } = useCollection<any>(
    user?.uid ? 'payouts' : null,
    useMemo(() => user?.uid ? [where('userId', '==', user.uid), where('status', '==', 'pending'), limit(1)] : [], [user?.uid])
  );
  const hasPendingPayout = pendingPayouts.length > 0;

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<IChartApi | null>(null);
  const mainSeriesRef = useRef<ISeriesApi<any> | null>(null);
  const currentCandleRef = useRef<any>(null);
  const oldestTimestamp = useRef<number | null>(null);
  const activePriceLinesRef = useRef<Map<string, IPriceLine[]>>(new Map());

  const activePrice = useMemo(() => {
    const sym = selectedSymbol.toUpperCase();
    let tick = null;
    
    if (streamTick && Number(streamTick.price) > 0) {
      tick = streamTick;
    } else {
      const rtdbTick = livePrices[sym];
      if (rtdbTick && Number(rtdbTick.price) > 0) tick = rtdbTick;
    }

    if (tick) {
      if (!tick.price && tick.bid && tick.ask) tick.price = (tick.bid + tick.ask) / 2;
      return tick;
    }

    if (historyPrice && historyPrice > 0) {
      return { price: historyPrice, bid: historyPrice * 0.9999, ask: historyPrice * 1.0001, source: 'history-fallback' };
    }
    return null;
  }, [streamTick, livePrices, selectedSymbol, historyPrice]);

  const isPriceValid = !!(activePrice && Number(activePrice.price) > 0);

  const accountConstraints = useMemo(() => user?.uid ? [where("userId", "==", user.uid)] : [], [user?.uid]);
  const { data: accounts, loading: accountsLoading } = useCollection<any>(user?.uid ? "demoAccounts" : null, accountConstraints);

  const activeAccounts = useMemo(() => accounts.filter(a => a.status === 'active'), [accounts]);
  const hasActiveAccount = activeAccounts.length > 0;

  const selectedAccount = useMemo(() => 
    activeAccounts.find(a => a.id === currentAccountId) || activeAccounts[0] || null
  , [activeAccounts, currentAccountId]);

  useEffect(() => {
    if (!accountsLoading && activeAccounts.length > 0 && !currentAccountId) {
      setCurrentAccountId(activeAccounts[0].id);
    }
  }, [accountsLoading, activeAccounts, currentAccountId]);

  useEffect(() => {
    if (hasMounted) {
      const updateMarketStatus = () => {
        setMarketInfo(getMarketInfo(selectedSymbol));
      };
      updateMarketStatus();
      const interval = setInterval(updateMarketStatus, 60000);
      return () => clearInterval(updateMarketStatus);
    }
  }, [selectedSymbol, hasMounted]);

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
  }, [selectedSymbol, selectedInterval]);

  useEffect(() => {
    if (hasMounted) {
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
    }
  }, [selectedInterval, hasMounted]);

  const applyGlobalSettings = useCallback(() => {
    if (!chartInstanceRef.current) return;
    const chart = chartInstanceRef.current;
    const modeMap: Record<string, PriceScaleMode> = { regular: PriceScaleMode.Normal, percent: PriceScaleMode.Percentage, indexed: PriceScaleMode.IndexedTo100, log: PriceScaleMode.Logarithmic };
    const targetScaleId = chartSettings.scales.position === 'left' ? 'left' : 'right';
    const otherScaleId = chartSettings.scales.position === 'left' ? 'right' : 'left';
    try {
      chart.priceScale(targetScaleId).applyOptions({ 
        visible: true, 
        mode: modeMap[chartSettings.scales.type] || PriceScaleMode.Normal, 
        autoScale: true, 
        borderColor: chartSettings.canvas.scales.textColor + '44',
        scaleMargins: {
          top: 0.1,
          bottom: 0.1,
        }
      });
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
    if (hasMounted) {
      localStorage.setItem('chartGlobalSettings', JSON.stringify(chartSettings));
      applyGlobalSettings();
    }
  }, [chartSettings, applyGlobalSettings, hasMounted]);

  useEffect(() => {
    if (!chartContainerRef.current) return;
    let chart; 
    try { 
      chart = createChart(chartContainerRef.current, {
        layout: { background: { type: ColorType.Solid, color: '#09090b' }, textColor: '#71717a' },
        grid: { vertLines: { color: '#18181b' }, horzLines: { color: '#18181b' } },
        width: chartContainerRef.current.clientWidth,
        height: chartContainerRef.current.clientHeight > 100 
          ? chartContainerRef.current.clientHeight 
          : (isMobile ? Math.floor(window.innerHeight * 0.42) : 500),
        timeScale: { 
          borderColor: '#27272a', 
          timeVisible: true, 
          secondsVisible: false,
          rightOffset: 15,
          barSpacing: 6,
          fixLeftEdge: false,
          fixRightEdge: false,
        },
      });
      chartInstanceRef.current = chart;
      const series = chartType === 'line' || chartType === 'area' 
        ? (chartType === 'area' ? chart.addAreaSeries() : chart.addLineSeries())
        : chart.addCandlestickSeries();
      mainSeriesRef.current = series;
      setIsChartReady(true);
      
      setTimeout(() => {
        if (chartContainerRef.current && chartInstanceRef.current) {
          const h = chartContainerRef.current.clientHeight;
          const w = chartContainerRef.current.clientWidth;
          if (h > 100 && w > 100) {
            chartInstanceRef.current.applyOptions({ width: w, height: h });
          }
        }
      }, 200);
    } catch (e) {}
    applyGlobalSettings();
    return () => { if (chartInstanceRef.current) { try { chartInstanceRef.current.remove(); } catch (e) {} chartInstanceRef.current = null; } mainSeriesRef.current = null; setIsChartReady(false); currentCandleRef.current = null; };
  }, [chartType, applyGlobalSettings, isMobile]);

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();
    const cacheKey = `${selectedSymbol}-${selectedInterval}-v2`;
    const cached = candleDataCache.get(cacheKey);

    const fetchHistory = async () => {
      if (cached && (Date.now() - cached.lastUpdated < 300000)) { 
        setIsChartLoading(false);
        if (mainSeriesRef.current) mainSeriesRef.current.setData(cached.candles);
        oldestTimestamp.current = cached.candles[0].time;
        setHistoryPrice(cached.candles[cached.candles.length - 1].close);
        
        chartInstanceRef.current?.timeScale().fitContent();
        mainSeriesRef.current?.priceScale().applyOptions({ autoScale: true });
      } else { 
        setIsChartLoading(true); 
      }

      try {
        const res = await fetch(`/api/terminal/candles?symbol=${selectedSymbol}&interval=${selectedInterval}&limit=1000`, { signal: controller.signal });
        if (!res.ok) throw new Error(`Network error: ${res.status}`);
        const data = await res.json();
        const rawCandles = data.candles || [];
        
        if (!isMounted) return;

        if (rawCandles.length > 0) {
          const sorted = [...rawCandles]
            .map(c => {
              let t = 0;
              if (typeof c.time === 'number') t = c.time;
              else if (typeof c.time === 'object' && c.time !== null) {
                t = Number(c.time.seconds || (c.time as any)._seconds || 0);
              } else {
                t = Number(c.time);
              }
              return { ...c, time: t };
            })
            .filter(c => {
              const p = (val: any) => parseFloat(String(val));
              return !isNaN(c.time) && c.time > 0 && 
                     p(c.open) > 0 && p(c.high) > 0 && p(c.low) > 0 && p(c.close) > 0 &&
                     !isNaN(p(c.open)) && !isNaN(p(c.high)) && !isNaN(p(c.low)) && !isNaN(p(c.close)) &&
                     p(c.high) >= p(c.low);
            })
            .sort((a: any, b: any) => a.time - b.time)
            .filter((v: any, i: any, a: any) => i === 0 || v.time > a[i - 1].time);

          if (mainSeriesRef.current) {
             const formatted = (chartType === 'candles' || chartType === 'bars') ? sorted : sorted.map((c: any) => ({ time: c.time, value: c.close }));
             mainSeriesRef.current.setData(formatted);
             chartInstanceRef.current?.timeScale().fitContent();
             mainSeriesRef.current.priceScale().applyOptions({ autoScale: true });

             setTimeout(() => {
               chartInstanceRef.current?.timeScale().scrollToRealTime();
               chartInstanceRef.current?.priceScale('right').applyOptions({ autoScale: true });
             }, 150);
          }

          setIsFallbackData(!!data.isFallback);
          candleDataCache.set(cacheKey, { candles: sorted, lastUpdated: Date.now() });
          
          const lastHistCandle = sorted[sorted.length - 1];
          if (!currentCandleRef.current || lastHistCandle.time > currentCandleRef.current.time) {
            currentCandleRef.current = { ...lastHistCandle };
            setHistoryPrice(lastHistCandle.close);
          }
          oldestTimestamp.current = sorted[0].time;
        }
      } catch (err: any) { 
        if (isMounted && !cached) setChartError(err.message); 
      } finally { 
        if (isMounted) setIsChartLoading(false); 
      }
    };

    if (isChartReady) fetchHistory();
    return () => { isMounted = false; controller.abort(); };
  }, [isChartReady, selectedSymbol, selectedInterval, chartType, isMobile]);

  const tradeConstraints = useMemo(() => user?.uid ? [where("userId", "==", user.uid), orderBy("openedAt", "desc")] : [], [user?.uid]);
  const { data: allUserTrades } = useCollection<any>(tradeConstraints.length ? "demoTrades" : null, tradeConstraints);
  const trades = useMemo(() => allUserTrades.filter(t => t.accountId === currentAccountId), [allUserTrades, currentAccountId]);
  const openTrades = useMemo(() => trades.filter(t => t.status === 'open'), [trades]);
  const closedTrades = useMemo(() => trades.filter(t => t.status === 'closed'), [trades]);

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
    if (activePrice && mainSeriesRef.current && !isChartLoading && isChartReady) {
      const price = Number(activePrice.price);
      if (price <= 0 || isNaN(price)) return;
      
      if (historyPrice && Math.abs((price - historyPrice) / historyPrice) > 0.5) {
        return;
      }
      
      const intervalSecs = intervalSecondsMap[selectedInterval] || 60;
      const candleTime = Math.floor(Date.now() / 1000 / intervalSecs) * intervalSecs;
      
      const barTime = Number(candleTime);
      
      if (!currentCandleRef.current || barTime > Number(currentCandleRef.current.time)) {
        currentCandleRef.current = { time: barTime, open: price, high: price, low: price, close: price };
      } else if (barTime === Number(currentCandleRef.current.time)) {
        currentCandleRef.current = { 
          ...currentCandleRef.current, 
          high: Math.max(currentCandleRef.current.high, price), 
          low: Math.min(currentCandleRef.current.low, price), 
          close: price 
        };
      }
      
      if (currentCandleRef.current && barTime >= Number(currentCandleRef.current.time)) {
        try {
          if (chartType === 'line' || chartType === 'area') {
            mainSeriesRef.current.update({ time: barTime as any, value: price });
          } else {
            mainSeriesRef.current.update(currentCandleRef.current);
          }
        } catch (e) {
          // Silent fail for non-increasing timestamps to prevent UI crashes
        }
      }
    }
  }, [activePrice, selectedInterval, isChartLoading, isChartReady, chartType, selectedSymbol, historyPrice]);

  useEffect(() => {
    if (openTrades.length > 0 && isPriceValid) {
      openTrades.forEach(t => {
        if (closingTradesRef.current.has(t.id)) return;
        const pData = livePrices[t.symbol.toUpperCase()];
        if (!pData || !pData.bid || !pData.ask) return;
        
        // UNIFIED TRIGGER LOGIC
        let triggeredPrice = 0;
        let reason = "";
        if (t.type === 'buy') {
          if (t.sl && pData.bid <= t.sl) { triggeredPrice = t.sl; reason = "stop_loss"; }
          else if (t.tp && pData.bid >= t.tp) { triggeredPrice = t.tp; reason = "take_profit"; }
        } else {
          if (t.sl && pData.ask >= t.sl) { triggeredPrice = t.sl; reason = "stop_loss"; }
          else if (t.tp && pData.ask <= t.tp) { triggeredPrice = t.tp; reason = "take_profit"; }
        }
        if (triggeredPrice > 0) {
          closingTradesRef.current.add(t.id);
          handleAutoClose(t.id, triggeredPrice, reason);
        }
      });
    }
  }, [livePrices, openTrades, handleAutoClose, isPriceValid]);

  const calculateOpenPnl = useCallback((trade: any) => {
    const symbolUpper = trade.symbol.toUpperCase();
    const priceData = livePrices[symbolUpper] || activePrice;
    if (!priceData) return 0;
    
    // BUY positions close at BID, SELL positions close at ASK
    const exitPrice = trade.type === 'buy' ? (priceData.bid || priceData.price) : (priceData.ask || priceData.price);
    const diff = trade.type === 'buy' ? exitPrice - trade.openPrice : trade.openPrice - exitPrice;
    const contractSize = CONTRACT_SIZE[symbolUpper] || 100000;
    return diff * trade.lots * contractSize;
  }, [livePrices, activePrice]);

  useEffect(() => {
    if (!mainSeriesRef.current || !isChartReady) return;
    activePriceLinesRef.current.forEach((lines) => { lines.forEach((line) => mainSeriesRef.current?.removePriceLine(line)); });
    activePriceLinesRef.current.clear();
    openTrades.filter(t => t.symbol.toUpperCase() === selectedSymbol.toUpperCase()).forEach((trade) => {
      const lines: IPriceLine[] = [];
      const currentPnl = calculateOpenPnl(trade);
      const entryLine = mainSeriesRef.current!.createPriceLine({ price: trade.openPrice, color: trade.type === 'buy' ? '#2962ff' : '#f57c00', lineWidth: 1, lineStyle: 0, axisLabelVisible: true, title: `${trade.lots.toFixed(2)}  ${currentPnl >= 0 ? '+' : ''}${currentPnl.toFixed(2)} USD`, });
      lines.push(entryLine);
      if (trade.sl) lines.push(mainSeriesRef.current!.createPriceLine({ price: trade.sl, color: '#ef4444', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: `SL @ ${trade.sl}` }));
      if (trade.tp) lines.push(mainSeriesRef.current!.createPriceLine({ price: trade.tp, color: '#10b981', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: `TP @ ${trade.tp}` }));
      activePriceLinesRef.current.set(trade.id, lines);
    });
    return () => { activePriceLinesRef.current.forEach((lines) => { lines.forEach((line) => mainSeriesRef.current?.removePriceLine(line)); }); };
  }, [openTrades, selectedSymbol, isChartReady, calculateOpenPnl]);

  async function placeTrade(type: 'buy' | 'sell') {
    if (!hasMounted) return;
    if (hasPendingPayout) { toast({ title: "Trading Suspended", description: "You have a pending payout request.", variant: "destructive" }); return; }
    if (!marketInfo.isOpen) { toast({ title: "Market Closed", description: "Trading is disabled for this instrument at this time.", variant: "destructive" }); return; }
    try {
      setActionLoading(true);
      if (!user || !currentAccountId || !activePrice) return;
      
      // BUY buys at ASK, SELL sells at BID
      const executionPrice = type === 'buy' ? (activePrice.ask || activePrice.price) : (activePrice.bid || activePrice.price);
      
      const token = await user.getIdToken(true);
      const res = await fetch('/api/terminal/trades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ accountId: currentAccountId, symbol: selectedSymbol.toUpperCase(), type, lots, price: executionPrice, sl: sl && parseFloat(sl) > 0 ? parseFloat(sl) : null, tp: tp && parseFloat(tp) > 0 ? parseFloat(tp) : null, orderType: 'market' })
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
  const handleResetView = () => { if (chartInstanceRef.current) { chartInstanceRef.current.timeScale().fitContent(); chartInstanceRef.current.timeScale().scrollToRealTime(); chartInstanceRef.current.priceScale('right').applyOptions({ autoScale: true }); } };

  async function closeTrade(tradeId: string) {
    try {
      setActionLoading(true);
      const trade = openTrades.find(t => t.id === tradeId);
      if (!trade) return;
      const priceData = livePrices[trade.symbol.toUpperCase()] || activePrice;
      
      // UNIFIED EXIT LOGIC
      // BUY positions close at BID, SELL positions close at ASK
      const closePrice = trade.type === 'buy' ? (priceData?.bid || priceData?.price || 0) : (priceData?.ask || priceData?.price || 0);
      
      if (!closePrice || closePrice <= 0) return;
      const token = await user?.getIdToken(true);
      const res = await fetch(`/api/terminal/trades/${tradeId}/close`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ closePrice, closeReason: "manual" }) });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({ title: "Close Failed", description: err.error || "Execution error", variant: "destructive" });
        return;
      }
      toast({ title: "✓ Position Closed" });
    } catch (e: any) { } finally { setActionLoading(false); }
  }

  const TOOLBAR_ITEMS = [
    { id: 'crosshair', name: 'Crosshair', icon: Crosshair }, { id: 'trend', name: 'Trend Line', icon: Slash }, { id: 'arrow', name: 'Arrow', icon: ArrowUpRight }, { id: 'hline', name: 'Horizontal Line', icon: Minus }, { id: 'vline', name: 'Vertical Line', icon: SeparatorVertical }, { id: 'ray', name: 'Ray', icon: () => <ArrowRight className="rotate-[-45deg] scale-75" /> }, { id: 'rect', name: 'Rectangle', icon: Square }, { id: 'text', name: 'Text', icon: Type }, { id: 'measure', name: 'Ruler / Measure', icon: Ruler }, { id: 'zoom-in', name: 'Zoom In', icon: ZoomIn, action: handleZoomIn }, { id: 'zoom-out', name: 'Zoom Out', icon: ZoomOut, action: handleZoomOut }, { id: 'home', name: 'Home', icon: Home, action: handleResetView }, { id: 'lock', name: 'Lock', icon: drawingsLocked ? Lock : Unlock, action: () => setDrawingsLocked(!drawingsLocked), toggle: true }, { id: 'magnet', name: 'Magnet', icon: Magnet, action: () => setMagnetMode(!magnetMode), active: magnetMode, toggle: true }, { id: 'eye', name: 'Eye', icon: drawingsHidden ? EyeOff : Eye, action: () => setDrawingsHidden(!drawingsHidden), toggle: true }, { id: 'eraser', name: 'Eraser', icon: Eraser, action: () => setIsDeleteAllOpen(true) },
  ];

  if (!user && !authLoading) return null;
  if (!accountsLoading && !hasActiveAccount) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center space-y-8">
        <div className="w-24 h-24 rounded-3xl bg-primary/10 border border-primary/20 flex items-center justify-center cyan-box-glow"><ShieldAlert className="w-12 h-12 text-primary" /></div>
        <h1 className="text-4xl font-headline font-bold text-white">No Active Account</h1>
        <div className="flex gap-4"><Button variant="outline" asChild><Link href="/dashboard">Dashboard</Link></Button><Button asChild><Link href="/challenges">Get Funded</Link></Button></div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 h-[100dvh] w-screen bg-[#09090b] flex flex-col text-zinc-300 font-sans select-none overflow-hidden">
      {hasMounted && hasPendingPayout && (
        <div className="bg-amber-500/20 border-b border-amber-500/30 px-4 py-2 flex items-center justify-center gap-3 z-[60]">
          <AlertTriangle className="w-4 h-4 text-amber-500" /><p className="text-[11px] font-bold text-amber-200 uppercase tracking-wide">⚠️ Trading suspended while payout processes.</p>
        </div>
      )}

      <header className="h-12 border-b border-zinc-800 flex items-center justify-between px-3 md:px-4 bg-zinc-950 shrink-0 z-50">
        <div className="flex items-center gap-3 md:gap-6">
          <div className="flex items-center gap-2"><Image src={branding.logoUrl} alt="Logo" width={20} height={20} className="rounded-full" /><span className="font-bold text-xs md:text-sm tracking-tight text-white hidden sm:inline">Trade Terminal</span></div>
          <Link href="/dashboard" className="flex items-center gap-2 text-[10px] font-bold text-zinc-500 hover:text-white transition-colors border-l border-zinc-800 pl-3 md:pl-6 h-12"><ArrowLeft className="w-3 h-3" /> <span className="hidden sm:inline">Dashboard</span></Link>
          <div className="flex items-center gap-1.5 px-3 py-1 bg-white/5 rounded-full border border-white/5"><UserCircle className="w-3 h-3 text-primary" /><span className="text-[10px] font-black uppercase text-zinc-400">ID: {userData?.traderId || '--------'}</span></div>
        </div>
        <div className="flex items-center gap-2 md:gap-4">
          {isMobile && hasMounted && (
            <Button 
              size="sm" 
              className="bg-primary text-black font-black text-[10px] h-8 px-3 rounded-lg"
              onClick={() => setIsOrderSheetOpen(true)}
            >
              TRADE
            </Button>
          )}
          {!isMobile && hasMounted && (
            <>
              <Button variant="ghost" size="sm" className="h-9 px-3 gap-2 text-xs font-bold text-zinc-400" onClick={() => setIsAlertModalOpen(true)}><Bell className="w-4 h-4" /> Set Alert</Button>
              <Select value={selectedTimezone} onValueChange={setSelectedTimezone}><SelectTrigger className="bg-transparent border-none h-9 w-40 text-xs font-bold"><Globe className="w-3.5 h-3.5 mr-2" /><SelectValue /></SelectTrigger><SelectContent>{TIMEZONES.map(tz => <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>)}</SelectContent></Select>
            </>
          )}
          {hasMounted && (
            <Select value={chartType} onValueChange={setChartType}><SelectTrigger className="bg-transparent border-none h-9 w-24 md:w-32 text-[10px] md:text-xs font-bold"><Activity className="w-3 h-3 md:w-3.5 md:h-3.5 mr-2" /><SelectValue /></SelectTrigger><SelectContent><SelectItem value="candles">Candles</SelectItem><SelectItem value="bars">Bars</SelectItem><SelectItem value="line">Line</SelectItem><SelectItem value="area">Area</SelectItem></SelectContent></Select>
          )}
          <Button variant="ghost" size="icon" className="h-9 w-9 text-zinc-400" onClick={() => setIsSettingsOpen(true)}><Settings className="w-4 h-4" /></Button>
          {!isMobile && hasMounted && (
            <Select value={currentAccountId ?? ""} onValueChange={setCurrentAccountId}><SelectTrigger className="bg-transparent border-none h-12 w-56 text-xs font-bold"><SelectValue placeholder={selectedAccount?.label || "Select Account"} /></SelectTrigger><SelectContent>{activeAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>)}</SelectContent></Select>
          )}
        </div>
      </header>

      <div className="h-11 md:h-10 border-b border-zinc-800 flex items-center px-1 gap-1 bg-zinc-950/50 overflow-x-auto no-scrollbar scroll-smooth shrink-0 touch-pan-x">
        {SYMBOLS.map((s) => (
          <button key={s} onClick={() => setSelectedSymbol(s)} className={cn("px-4 h-full flex items-center justify-center transition-all border-b-2 shrink-0 min-w-[70px]", s === selectedSymbol ? "border-primary bg-primary/5" : "border-transparent hover:bg-white/5")}><span className={cn("font-bold text-[10px] md:text-[11px]", s === selectedSymbol ? "text-white" : "text-zinc-500")}>{s}</span></button>
        ))}
      </div>

      <div className="h-10 md:h-9 border-b border-zinc-800 flex items-center px-4 gap-2 bg-zinc-950/50 overflow-x-auto no-scrollbar scroll-smooth shrink-0 touch-pan-x">
        {TIMEFRAMES.map((tf) => (
          <button key={tf.value} onClick={() => setSelectedInterval(tf.value)} className={cn("px-3 h-7 md:h-6 min-w-[40px] flex items-center justify-center rounded transition-all text-[10px] font-black uppercase tracking-widest", selectedInterval === tf.value ? "bg-primary text-black" : "text-muted-foreground hover:text-white hover:bg-white/5")}>{tf.label}</button>
        ))}
      </div>

      <div className="flex-1 flex min-h-0 relative">
        <div className="flex-1 flex flex-col min-w-0 bg-[#09090b] overflow-hidden">
          <div className="flex-1 relative min-h-0 bg-[#09090b] flex">
            <aside className="hidden lg:flex w-[50px] border-r border-[#2a2a2a] bg-[#1a1a1a] flex-col items-center py-2 z-40 shrink-0 shadow-2xl overflow-y-auto no-scrollbar">
              <TooltipProvider delayDuration={300}>
                <div className="flex flex-col gap-0.5 items-center w-full">
                  {TOOLBAR_ITEMS.map((item) => (
                    <ToolIcon key={item.id} name={item.name} icon={typeof item.icon === 'function' ? <item.icon /> : <item.icon />} active={item.toggle ? item.active : activeTool === item.id} onClick={() => { if (item.action) item.action(); else setActiveTool(item.id); }} />
                  ))}
                </div>
              </TooltipProvider>
            </aside>

            <div className="flex-1 relative min-h-0" ref={chartContainerRef} style={{ height: isMobile ? '42vh' : 'calc(100vh - 280px)', maxHeight: isMobile ? '42vh' : 'none' }}>
              {isChartLoading && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-zinc-950/80 backdrop-blur-sm">
                  <Loader2 className="animate-spin text-primary" /><p className="text-[10px] uppercase font-black tracking-widest mt-4">Syncing Feed...</p>
                </div>
              )}
              {(isFallbackData || streamError) && (
                <div className="absolute left-1/2 top-4 -translate-x-1/2 z-20 w-full max-w-[200px] px-2">
                  <div className={cn("px-3 py-1.5 rounded-full border text-[8px] md:text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 backdrop-blur-md shadow-2xl", streamError ? "bg-destructive/10 border-destructive/20 text-destructive" : "bg-amber-500/10 border-amber-500/20 text-amber-500")}>
                    <AlertTriangle className="w-3 h-3 shrink-0" /><span className="truncate">{streamError ? "Feed Interrupted" : "Simulated Feed"}</span>
                  </div>
                </div>
              )}
              {hasMounted && (
                <div className="absolute left-3 bottom-[60px] z-20 flex flex-col items-start gap-1 pointer-events-none">
                  <div className={cn("px-3 py-1.5 rounded-lg border flex items-center gap-2 backdrop-blur-md shadow-xl", marketInfo.isOpen ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500" : "bg-destructive/10 border-destructive/20 text-destructive")}>
                    <div className={cn("w-1.5 h-1.5 rounded-full", marketInfo.isOpen ? "bg-emerald-500 animate-pulse" : "bg-destructive")} /><span className="text-[10px] font-black uppercase tracking-widest">{marketInfo.type === 'crypto' ? '24/7 Open' : marketInfo.isOpen ? 'Market Open' : 'Market Closed'}</span>
                  </div>
                </div>
              )}
              <div className="absolute right-[10px] md:right-[65px] top-[10px] md:top-[40px] z-20 flex items-center gap-1.5 px-2 py-1 bg-zinc-900/80 border border-zinc-700/50 rounded shadow-2xl backdrop-blur-sm pointer-events-none">
                <ClockIcon className="w-3 h-3 text-primary animate-pulse" /><span className="font-mono text-[9px] md:text-[10px] font-black text-white tabular-nums tracking-wider">{countdown}</span>
              </div>
              {isChartReady && chartInstanceRef.current && mainSeriesRef.current && (
                <DrawingLayer chart={chartInstanceRef.current} series={mainSeriesRef.current} symbol={selectedSymbol} activeTool={activeTool} setActiveTool={setActiveTool} locked={drawingsLocked} hidden={drawingsHidden} />
              )}
            </div>
          </div>

          {hasMounted && (
            <PositionsPanel openTrades={openTrades} closedTrades={closedTrades} alerts={alerts} livePrices={livePrices} closeTrade={closeTrade} deleteAlert={async (id) => { if (!user) return; const token = await user.getIdToken(); await fetch(`/api/terminal/alerts?id=${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }); toast({ title: "Alert Removed" }); }} user={user} alertsLoading={alertsLoading} panelOpen={bottomPanelOpen} setPanelOpen={setBottomPanelOpen} />
          )}
        </div>

        <aside className="hidden md:flex w-72 lg:w-80 border-l border-zinc-800 bg-zinc-950 p-4 lg:p-6 flex-col gap-4 lg:gap-8 shrink-0 overflow-y-auto custom-scrollbar z-50">
           <OrderPanel 
             hasMounted={hasMounted} 
             actionLoading={actionLoading} 
             isPriceValid={isPriceValid} 
             hasPendingPayout={hasPendingPayout} 
             marketInfo={marketInfo} 
             activePrice={activePrice} 
             selectedSymbol={selectedSymbol} 
             lotsInput={lotsInput} 
             setLotsInput={setLotsInput} 
             lots={lots} 
             sl={sl} 
             setSl={setSl} 
             tp={tp} 
             setTp={setTp} 
             placeTrade={placeTrade} 
           />
        </aside>
      </div>

      {isMobile && hasMounted && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-zinc-950 border-t border-zinc-800 flex items-center justify-between px-4 z-[55] pb-safe shadow-[0_-4px_20px_rgba(0,0,0,0.5)]">
           <Button 
             className="flex-1 h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs tracking-widest rounded-xl mr-2 active:scale-95 transition-transform"
             onClick={() => setIsOrderSheetOpen(true)}
           >
             BUY
           </Button>
           <Button 
             className="flex-1 h-11 bg-red-600 hover:bg-red-700 text-white font-black text-xs tracking-widest rounded-xl ml-2 active:scale-95 transition-transform"
             onClick={() => setIsOrderSheetOpen(true)}
           >
             SELL
           </Button>
        </div>
      )}

      <Sheet open={isOrderSheetOpen} onOpenChange={setIsOrderSheetOpen}>
        <SheetContent side="bottom" className="bg-zinc-950 border-zinc-800 text-white rounded-t-3xl h-[85vh] md:h-auto overflow-y-auto custom-scrollbar">
          <SheetHeader className="pb-4"><div className="w-12 h-1 bg-zinc-800 rounded-full mx-auto mb-4" /><SheetTitle className="text-center font-headline font-bold text-2xl">Execute Order</SheetTitle></SheetHeader>
          <div className="pb-10 pt-4">
            <OrderPanel 
              hasMounted={hasMounted} 
              actionLoading={actionLoading} 
              isPriceValid={isPriceValid} 
              hasPendingPayout={hasPendingPayout} 
              marketInfo={marketInfo} 
              activePrice={activePrice} 
              selectedSymbol={selectedSymbol} 
              lotsInput={lotsInput} 
              setLotsInput={setLotsInput} 
              lots={lots} 
              sl={sl} 
              setSl={setSl} 
              tp={tp} 
              setTp={setTp} 
              placeTrade={placeTrade} 
            />
          </div>
        </SheetContent>
      </Sheet>

      <ChartSettingsModal open={isSettingsOpen} onOpenChange={setIsSettingsOpen} settings={chartSettings} onSettingsChange={setChartSettings} onResetScale={handleResetView} />
      <Dialog open={isAlertModalOpen} onOpenChange={setIsAlertModalOpen}><DialogContent className="bg-zinc-900 border-zinc-800 text-white max-sm"><DialogHeader><DialogTitle>Set Price Alert</DialogTitle></DialogHeader><div className="p-6"><Button className="w-full h-12 font-black cyan-box-glow" onClick={() => setIsAlertModalOpen(false)}>CREATE ALERT</Button></div></DialogContent></Dialog>
      <Dialog open={isDeleteAllOpen} onOpenChange={setIsDeleteAllOpen}><DialogContent className="bg-[#1c1c1c] border-zinc-800 text-white max-sm"><DialogHeader><DialogTitle>Clear All Drawings</DialogTitle></DialogHeader><div className="p-6"><p className="text-sm text-zinc-400">Permanently delete all technical analysis for <span className="text-white font-bold">{selectedSymbol}</span>?</p></div><DialogFooter className="p-4 bg-zinc-900/50 flex gap-2"><Button variant="ghost" className="flex-1" onClick={() => setIsDeleteAllOpen(false)}>Cancel</Button><Button variant="destructive" className="flex-1" onClick={() => { setActiveTool('eraser'); setIsDeleteAllOpen(false); }}>Clear All</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}

function ToolIcon({ name, icon, active = false, onClick }: { name: string, icon: React.ReactNode, active?: boolean, onClick?: () => void }) {
  return (
    <Tooltip><TooltipTrigger asChild><div onClick={onClick} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(); } }} className={cn("w-9 h-9 flex items-center justify-center rounded-md transition-all shrink-0 outline-none my-[1px] relative cursor-pointer group", active ? "bg-[#2962ff] text-white" : "text-[#b2b5be] hover:text-white hover:bg-[#2a2e39]")}><div className="flex items-center justify-center transition-transform group-active:scale-90 scale-90">{icon}</div></div></TooltipTrigger><TooltipContent side="right" className="bg-[#1e222d] border-[#2a2e39] text-white font-bold text-[10px] uppercase shadow-2xl z-[100] px-3 py-1.5 rounded-md">{name}</TooltipContent></Tooltip>
  );
}
