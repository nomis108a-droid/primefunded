'use client';

import { useEffect, useState, useMemo, useRef, useCallback, memo } from "react";
import { useAuth } from "@/context/AuthContext";
import { useCollection } from "@/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { 
  Loader2, Activity, Settings, 
  Crosshair, Circle, Slash, ArrowRight,
  Square, Type, Eraser, SeparatorVertical,
  Clock as ClockIcon, 
  UserCircle,
  MousePointer2, Pencil, LayoutGrid, Plus, History, ChevronLeft, Minus,
  TrendingUp, TrendingDown, ShieldCheck, Timer
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { where, orderBy } from "firebase/firestore";
import { createChart, ColorType, PriceScaleMode, CrosshairMode, LineStyle, IChartApi, ISeriesApi, IPriceLine } from 'lightweight-charts';
import Link from "next/link";
import { PositionsPanel } from './PositionsPanel';
import { DrawingLayer } from "./DrawingLayer";
import { ChartSettingsModal } from "./ChartSettingsModal";
import { useLivePrices } from "@/hooks/useLivePrice";
import { useTickStream } from "@/hooks/useTickStream";
import { useIsMobile } from "@/hooks/use-mobile";
import { CONTRACT_SIZE } from "@/lib/rulesConfig";
import { getTradeDate } from "@/lib/tradeUtils";

const SYMBOLS = [
  "XAUUSD", "XAGUSD", "XPTUSD", "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCHF", "USDCAD", "NZDUSD",
  "BTCUSD", "ETHUSD", "SOLUSD", "XRPUSD", "ADAUSD", "BNBUSD", "DOGEUSD"
];

const TIMEFRAMES = [
  { label: '1m', value: '1min', seconds: 60 },
  { label: '5m', value: '5min', seconds: 300 },
  { label: '15m', value: '15min', seconds: 900 },
  { label: '30m', value: '30min', seconds: 1800 },
  { label: '1H', value: '1h', seconds: 3600 },
  { label: '4H', value: '4h', seconds: 14400 },
  { label: '1D', value: '1day', seconds: 86400 },
];

/**
 * Institutional Component: Candle Countdown Timer
 */
const CandleTimer = memo(function CandleTimer({ interval }: { interval: string }) {
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    const getIntervalSeconds = (val: string) => {
      const map: Record<string, number> = {
        '1min': 60, '5min': 300, '15min': 900, '30min': 1800,
        '1h': 3600, '4h': 14400, '1day': 86400
      };
      return map[val] || 60;
    };

    const formatTime = (seconds: number) => {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = seconds % 60;
      if (h > 0) return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
      return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const tick = () => {
      const now = Math.floor(Date.now() / 1000);
      const intervalSec = getIntervalSeconds(interval);
      const remaining = intervalSec - (now % intervalSec);
      setTimeLeft(formatTime(remaining));
    };

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [interval]);

  return (
    <div className="flex items-center gap-2 px-3 py-1 bg-white/5 rounded-full border border-white/10 ml-4">
      <Timer className="w-3 h-3 text-primary animate-pulse" />
      <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
        New Candle: <span className="text-white tabular-nums">{timeLeft}</span>
      </span>
    </div>
  );
});

/**
 * Institutional Order Panel Content
 */
interface OrderPanelProps {
  currentAccountId: string | null;
  setCurrentAccountId: (id: string) => void;
  selectedAccount: any;
  activeAccounts: any[];
  activePrice: any;
  selectedSymbol: string;
  lotsInput: string;
  setLotsInput: (val: string) => void;
  sl: string;
  setSl: (val: string) => void;
  tp: string;
  setTp: (val: string) => void;
  actionLoading: boolean;
  placeTrade: (type: 'buy' | 'sell') => void;
}

const OrderPanelContent = memo(({ 
  currentAccountId, setCurrentAccountId, selectedAccount, activeAccounts, 
  activePrice, selectedSymbol, lotsInput, setLotsInput, sl, setSl, tp, setTp, 
  actionLoading, placeTrade 
}: OrderPanelProps) => {
  const getPrecision = (s: string) => s.includes('JPY') || ['XAUUSD', 'BTCUSD', 'ETHUSD', 'SOLUSD', 'BNBUSD'].includes(s.toUpperCase()) ? 3 : 5;

  return (
    <div className="flex flex-col h-full space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label className="text-[10px] font-black uppercase text-zinc-500">Execution Node</Label>
          <Select value={currentAccountId || selectedAccount?.id} onValueChange={setCurrentAccountId}>
            <SelectTrigger className="bg-secondary/30 h-10 border-border/50 text-white">
              <SelectValue placeholder="Select Account" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
              {activeAccounts.map(acc => (
                <SelectItem key={acc.id} value={acc.id} className="text-xs font-bold">
                  {acc.label} (${(acc.balance || 0).toLocaleString()})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl">
           <div className="flex justify-between items-end mb-1">
              <span className="text-[10px] font-black uppercase text-zinc-500">Market Price</span>
              <Badge variant="outline" className="text-[8px] h-4 px-1.5 border-emerald-500/30 text-emerald-500 animate-pulse uppercase">Live</Badge>
           </div>
           <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col">
                <span className="text-[9px] font-bold text-zinc-600 uppercase">Bid</span>
                <span className="text-lg font-mono font-black text-white tabular-nums">{activePrice?.bid?.toFixed(getPrecision(selectedSymbol)) || '---'}</span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-[9px] font-bold text-zinc-600 uppercase">Ask</span>
                <span className="text-lg font-mono font-black text-white tabular-nums">{activePrice?.ask?.toFixed(getPrecision(selectedSymbol)) || '---'}</span>
              </div>
           </div>
        </div>

        <div className="space-y-2">
          <Label className="text-[10px] font-black uppercase text-zinc-500">Volume (Lots)</Label>
          <div className="relative">
            <Input 
              type="text" 
              value={lotsInput} 
              onChange={e => setLotsInput(e.target.value)} 
              className="h-11 bg-zinc-900 border-zinc-800 text-center font-mono font-bold text-white text-lg" 
            />
            <div className="absolute inset-y-0 left-0 flex items-center px-3">
              <button onClick={() => setLotsInput(String(Math.max(0.01, (parseFloat(lotsInput) || 0) - 0.01).toFixed(2)))} className="text-zinc-500 hover:text-white"><Minus size={14} /></button>
            </div>
            <div className="absolute inset-y-0 right-0 flex items-center px-3">
              <button onClick={() => setLotsInput(String(((parseFloat(lotsInput) || 0) + 0.01).toFixed(2)))} className="text-zinc-500 hover:text-white"><Plus size={14} /></button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-[9px] font-black uppercase text-zinc-500">Stop Loss</Label>
            <Input type="text" placeholder="0.000" value={sl} onChange={e => setSl(e.target.value)} className="h-9 bg-zinc-900 border-zinc-800 text-xs" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[9px] font-black uppercase text-zinc-500">Take Profit</Label>
            <Input type="text" placeholder="0.000" value={tp} onChange={e => setTp(e.target.value)} className="h-9 bg-zinc-900 border-zinc-800 text-xs" />
          </div>
        </div>
      </div>

      <div className="mt-auto grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
        <button 
          onClick={() => placeTrade('buy')} 
          disabled={actionLoading || !activePrice}
          className="h-20 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-black text-white shadow-lg active:scale-95 transition-all flex flex-col items-center justify-center gap-1 group overflow-hidden relative"
        >
          <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
          {actionLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
            <>
              <span className="text-sm tracking-widest relative z-10">BUY</span>
              <span className="text-[10px] opacity-70 relative z-10 tabular-nums">{activePrice?.ask?.toFixed(getPrecision(selectedSymbol)) || '---'}</span>
            </>
          )}
          <ArrowRight className="absolute bottom-2 right-2 w-4 h-4 -rotate-45 opacity-20" />
        </button>
        <button 
          onClick={() => placeTrade('sell')} 
          disabled={actionLoading || !activePrice}
          className="h-20 rounded-xl bg-red-600 hover:bg-red-500 font-black text-white shadow-lg active:scale-95 transition-all flex flex-col items-center justify-center gap-1 group overflow-hidden relative"
        >
          <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
          {actionLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
            <>
              <span className="text-sm tracking-widest relative z-10">SELL</span>
              <span className="text-[10px] opacity-70 relative z-10 tabular-nums">{activePrice?.bid?.toFixed(getPrecision(selectedSymbol)) || '---'}</span>
            </>
          )}
          <ArrowRight className="absolute bottom-2 right-2 w-4 h-4 rotate-45 opacity-20" />
        </button>
      </div>

      <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 space-y-3">
        <div className="flex items-center gap-2 text-primary font-black text-[9px] uppercase tracking-widest">
           <ShieldCheck size={12} /> Compliance Status
        </div>
        <div className="space-y-1">
          <div className="flex justify-between text-[10px]">
             <span className="text-zinc-500">Plan Type</span>
             <span className="text-white font-bold uppercase">{selectedAccount?.planType || '1-Step Pro'}</span>
          </div>
          <div className="flex justify-between text-[10px]">
             <span className="text-zinc-500">Day Target</span>
             <span className="text-emerald-500 font-bold">${(selectedAccount?.profitTarget || 0).toLocaleString()}</span>
          </div>
        </div>
      </div>
    </div>
  );
});

export default function DemoPage() {
  const { user, userData, loading: authLoading } = useAuth();
  const { toast } = useToast();
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
  const [mobileTab, setMobileTab] = useState<'chart' | 'positions' | 'history' | 'account'>('chart');

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<IChartApi | null>(null);
  const mainSeriesRef = useRef<ISeriesApi<any> | null>(null);
  const priceLinesRef = useRef<Map<string, IPriceLine[]>>(new Map());
  
  // High-frequency bucketing refs (Institutional Grade)
  const lastCandleTimeRef = useRef<number>(0);
  const lastOpenPriceRef = useRef<number>(0);
  const currentHighRef = useRef<number>(0);
  const currentLowRef = useRef<number>(0);

  useEffect(() => { setHasMounted(true); }, []);

  // Market Data
  const { tick: streamTick } = useTickStream(selectedSymbol);
  const livePrices = useLivePrices(SYMBOLS);
  
  const activePrice = useMemo(() => 
    streamTick?.price ? streamTick : livePrices[selectedSymbol.toUpperCase()] || null
  , [streamTick, livePrices, selectedSymbol]);

  const [fusedPrices, setFusedPrices] = useState<Record<string, any>>({});

  useEffect(() => {
    setFusedPrices(prev => ({ ...prev, ...livePrices }));
  }, [livePrices]);

  useEffect(() => {
    if (activePrice && selectedSymbol) {
      const sym = selectedSymbol.toUpperCase().trim();
      setFusedPrices(prev => ({
        ...prev,
        [sym]: activePrice
      }));
    }
  }, [activePrice, selectedSymbol]);

  // Accounts & Trades
  const accountConstraints = useMemo(() => user?.uid ? [where("userId", "==", user.uid)] : [], [user?.uid]);
  const { data: accounts } = useCollection<any>(user?.uid ? "demoAccounts" : null, accountConstraints);
  const activeAccounts = useMemo(() => accounts.filter(a => a.status === 'active' || a.status === 'passed'), [accounts]);
  const selectedAccount = useMemo(() => activeAccounts.find(a => a.id === currentAccountId) || activeAccounts[0] || null, [activeAccounts, currentAccountId]);

  const tradeConstraints = useMemo(() => user?.uid ? [where("userId", "==", user.uid), orderBy("openedAt", "desc")] : [], [user?.uid]);
  const { data: allUserTrades } = useCollection<any>(tradeConstraints.length ? "demoTrades" : null, tradeConstraints);
  const trades = useMemo(() => allUserTrades.filter(t => t.accountId === (currentAccountId || activeAccounts[0]?.id)), [allUserTrades, currentAccountId, activeAccounts]);
  const openTrades = useMemo(() => trades.filter(t => t.status === 'open'), [trades]);
  const closedTrades = useMemo(() => trades.filter(t => t.status === 'closed'), [trades]);

  const getPrecision = (s: string) => s.includes('JPY') || ['XAUUSD', 'BTCUSD', 'ETHUSD', 'SOLUSD', 'BNBUSD'].includes(s.toUpperCase()) ? 3 : 5;

  const calculateTradePnL = useCallback((trade: any) => {
    const symbolUpper = trade.symbol.toUpperCase().trim();
    const pData = fusedPrices[symbolUpper];
    if (!pData) return { pnl: 0, pct: 0 };
    const currentPrice = trade.type === 'buy' ? (pData.bid || pData.price) : (pData.ask || pData.price);
    const diff = trade.type === 'buy' ? currentPrice - trade.openPrice : trade.openPrice - currentPrice;
    const contractSize = CONTRACT_SIZE[symbolUpper] || 100000;
    return { pnl: diff * trade.lots * contractSize, pct: (diff / trade.openPrice) * 100 };
  }, [fusedPrices]);

  // Chart Init - Critical Fix: Added authLoading to dependencies to ensure ref is bound
  useEffect(() => {
    if (!hasMounted || !chartContainerRef.current || authLoading) return;
    
    setIsChartReady(false);
    priceLinesRef.current.clear();
    lastCandleTimeRef.current = 0;
    lastOpenPriceRef.current = 0;
    
    const chart = createChart(chartContainerRef.current, {
      layout: { background: { type: ColorType.Solid, color: '#09090b' }, textColor: '#71717a', fontSize: 11, fontFamily: 'Inter' },
      grid: { vertLines: { color: '#18181b' }, horzLines: { color: '#18181b' } },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
      timeScale: { rightOffset: 20, barSpacing: 8, borderColor: '#27272a', timeVisible: true },
      priceScale: { borderColor: '#27272a', autoScale: true, mode: PriceScaleMode.Normal },
      crosshair: { mode: CrosshairMode.Normal },
    });

    const series = chart.addCandlestickSeries({ 
      upColor: '#10b981', downColor: '#ef4444', borderVisible: false, wickUpColor: '#10b981', wickDownColor: '#ef4444',
      priceFormat: { type: 'price', precision: getPrecision(selectedSymbol), minMove: selectedSymbol.includes('JPY') ? 0.001 : 0.00001 }
    });

    chartInstanceRef.current = chart;
    mainSeriesRef.current = series;
    setIsChartReady(true);

    const handleResize = () => { if (chartInstanceRef.current) chartInstanceRef.current.applyOptions({ width: chartContainerRef.current!.clientWidth, height: chartContainerRef.current!.clientHeight }); };
    window.addEventListener('resize', handleResize);
    return () => { window.removeEventListener('resize', handleResize); if (chartInstanceRef.current) chartInstanceRef.current.remove(); };
  }, [selectedSymbol, hasMounted, authLoading]);

  // Stall Diagnostic Guard
  useEffect(() => {
    if (!isChartReady && isChartLoading && hasMounted && !authLoading) {
      const timer = setTimeout(() => {
        console.error(`[Chart-Stall] Chart failed to load for ${selectedSymbol} after 5s. Ready: ${isChartReady}, Container: ${!!chartContainerRef.current}`);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [isChartReady, isChartLoading, selectedSymbol, hasMounted, authLoading]);

  // History Load
  useEffect(() => {
    if (!isChartReady || !mainSeriesRef.current) return;
    setIsChartLoading(true);
    
    const fetchHistory = async () => {
      try {
        const res = await fetch(`/api/terminal/candles?symbol=${selectedSymbol}&interval=${selectedInterval}&limit=500`);
        const data = await res.json();
        if (data.candles && mainSeriesRef.current) {
          mainSeriesRef.current.setData(data.candles);
          if (data.candles.length > 0) {
            const last = data.candles[data.candles.length - 1];
            lastCandleTimeRef.current = last.time;
            lastOpenPriceRef.current = last.open;
            currentHighRef.current = last.high;
            currentLowRef.current = last.low;
          }
          chartInstanceRef.current?.timeScale().fitContent();
        }
      } catch(e) {
        console.warn('[Chart] Loading fail-safe triggered. Using existing state.');
      } finally { 
        setIsChartLoading(false); 
      }
    };
    fetchHistory();
  }, [selectedSymbol, selectedInterval, isChartReady]);

  // Tick Stream Integration (Hardened Bucketing V4 - Generic & Accurate)
  useEffect(() => {
    if (activePrice && mainSeriesRef.current && isChartReady) {
      const getIntervalSeconds = (val: string) => {
        const map: Record<string, number> = {
          '1min': 60, '5min': 300, '15min': 900, '30min': 1800,
          '1h': 3600, '4h': 14400, '1day': 86400
        };
        return map[val] || 60;
      };

      const intervalSec = getIntervalSeconds(selectedInterval);
      const now = Math.floor(Date.now() / 1000);
      const bucketTime = Math.floor(now / intervalSec) * intervalSec;
      
      if (bucketTime > lastCandleTimeRef.current) {
        // NEW CANDLE BOUNDARY CROSSED
        mainSeriesRef.current.update({
          time: bucketTime as any,
          open: activePrice.price,
          high: activePrice.price,
          low: activePrice.price,
          close: activePrice.price
        });
        lastCandleTimeRef.current = bucketTime;
        lastOpenPriceRef.current = activePrice.price;
        currentHighRef.current = activePrice.price;
        currentLowRef.current = activePrice.price;
      } else {
        // UPDATE CURRENT CANDLE OHLC
        currentHighRef.current = Math.max(currentHighRef.current || activePrice.price, activePrice.price);
        currentLowRef.current = Math.min(currentLowRef.current || activePrice.price, activePrice.price);
        
        mainSeriesRef.current.update({
          time: bucketTime as any,
          open: lastOpenPriceRef.current || activePrice.price,
          high: currentHighRef.current,
          low: currentLowRef.current,
          close: activePrice.price
        });
      }
    }
  }, [activePrice, isChartReady, selectedInterval]);

  // Trade Overlays (Lines + Markers)
  useEffect(() => {
    if (!mainSeriesRef.current || !isChartReady) return;
    
    const sym = selectedSymbol.toUpperCase().trim();
    const currentSymbolTrades = openTrades.filter(t => t.symbol.toUpperCase().trim() === sym);
    const activeIds = new Set(currentSymbolTrades.map(t => t.id));
    
    priceLinesRef.current.forEach((lines, id) => {
      if (!activeIds.has(id)) {
        lines.forEach(l => { try { mainSeriesRef.current?.removePriceLine(l); } catch(e) {} });
        priceLinesRef.current.delete(id);
      }
    });

    currentSymbolTrades.forEach(trade => {
      const { pnl, pct } = calculateTradePnL(trade);
      const pnlDisplay = (pnl >= 0 ? '+' : '') + pnl.toFixed(2);
      const title = `ENTRY ${trade.lots} | $${pnlDisplay} (${pct.toFixed(2)}%)`;
      
      let lines = priceLinesRef.current.get(trade.id);
      const hasSl = trade.sl && trade.sl > 0;
      const hasTp = trade.tp && trade.tp > 0;
      const expectedLineCount = 1 + (hasSl ? 1 : 0) + (hasTp ? 1 : 0);

      if (!lines || lines.length !== expectedLineCount) {
        if (lines) lines.forEach(l => { try { mainSeriesRef.current?.removePriceLine(l); } catch(e) {} });
        
        const entry = mainSeriesRef.current!.createPriceLine({ 
          price: trade.openPrice, color: '#11b3f5', lineStyle: LineStyle.Dashed, axisLabelVisible: true, title 
        });
        const newLines = [entry];
        
        if (hasSl) {
          newLines.push(mainSeriesRef.current!.createPriceLine({ 
            price: trade.sl, color: '#ef4444', lineStyle: LineStyle.Solid, axisLabelVisible: true, title: 'SL' 
          }));
        }
        if (hasTp) {
          newLines.push(mainSeriesRef.current!.createPriceLine({ 
            price: trade.tp, color: '#10b981', lineStyle: LineStyle.Solid, axisLabelVisible: true, title: 'TP' 
          }));
        }
        priceLinesRef.current.set(trade.id, newLines);
      } else {
        lines[0].applyOptions({ title });
      }
    });

    const markers = currentSymbolTrades.map(t => {
      const tDate = getTradeDate(t.openedAt);
      if (!tDate) return null;
      return {
        time: Math.floor(tDate.getTime() / 1000) as any,
        position: t.type === 'buy' ? 'belowBar' : 'aboveBar',
        color: t.type === 'buy' ? '#10b981' : '#ef4444',
        shape: t.type === 'buy' ? 'arrowUp' : 'arrowDown',
        text: t.type.toUpperCase(),
        size: 1
      };
    }).filter(Boolean);

    mainSeriesRef.current.setMarkers(markers as any);

  }, [openTrades, selectedSymbol, isChartReady, calculateTradePnL]);

  async function placeTrade(type: 'buy' | 'sell') {
    if (actionLoading || !user || !selectedAccount || !activePrice) return;
    setActionLoading(true);
    const witness = type === 'buy' ? activePrice.ask : activePrice.bid;

    user.getIdToken().then(token => {
      return fetch('/api/terminal/trades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ 
          accountId: selectedAccount.id, 
          symbol: selectedSymbol, 
          type, 
          lots: parseFloat(lotsInput), 
          sl: sl ? parseFloat(sl) : null, 
          tp: tp ? parseFloat(tp) : null,
          witnessPrice: witness
        })
      });
    })
    .then(async res => {
      const data = await res.json();
      if (!res.ok) toast({ title: "Order Rejected", description: data.error, variant: "destructive" });
      else { 
        toast({ title: "✓ Position Opened" }); 
        setIsOrderSheetOpen(false); 
      }
    })
    .catch(e => {
      toast({ title: "Network Error", variant: "destructive" });
    })
    .finally(() => {
      setActionLoading(false);
    });
  }

  const closeTrade = async (tradeId: string) => {
    if (actionLoading || !user) return;
    setActionLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/terminal/trades/${tradeId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
      });
      if (res.ok) toast({ title: "✓ Position Closed" });
      else {
        const data = await res.json();
        throw new Error(data.error || "Close failed");
      }
    } catch(e: any) { 
      toast({ title: "Error", description: e.message, variant: "destructive" }); 
    } finally { 
      setActionLoading(false); 
    }
  };

  if (authLoading) return <div className="fixed inset-0 bg-background flex flex-col items-center justify-center"><Loader2 className="w-10 h-10 animate-spin text-primary mb-4" /></div>;

  return (
    <div className="fixed inset-0 h-screen w-screen bg-[#09090b] flex flex-col text-zinc-300 overflow-hidden pb-safe">
      <header className="h-10 border-b border-zinc-800 flex items-center justify-between px-3 bg-zinc-950 shrink-0 z-50">
        <div className="flex items-center gap-2 md:gap-4 h-full">
          <Link href="/dashboard" className="flex items-center gap-2 pr-2 md:pr-3 border-r border-zinc-800 h-6 group">
            <ChevronLeft className="w-4 h-4 text-zinc-500 group-hover:text-primary transition-colors" />
            {!isMobile && <span className="font-bold text-[10px] uppercase tracking-widest text-zinc-400 group-hover:text-white transition-colors">BACK TO HUB</span>}
          </Link>
          <div className="flex items-center gap-1">
             <Select value={selectedSymbol} onValueChange={setSelectedSymbol}>
               <SelectTrigger className="flex items-center gap-2 px-2 py-1 bg-white/5 rounded border border-white/5 h-8 text-[10px] font-black text-white tracking-widest outline-none ring-0">
                  <SelectValue />
               </SelectTrigger>
               <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                 {SYMBOLS.map(sym => <SelectItem key={sym} value={sym} className="text-[10px] font-black">{sym}</SelectItem>)}
               </SelectContent>
             </Select>
             <div className="flex items-center gap-0.5 ml-2">
               {TIMEFRAMES.filter(tf => isMobile ? ['1m', '15m', '1H', '1D'].includes(tf.label) : true).map(tf => (
                 <button key={tf.value} onClick={() => setSelectedInterval(tf.value)} className={cn("px-2 py-1 rounded text-[10px] font-black uppercase transition-all", selectedInterval === tf.value ? "bg-primary text-black" : "text-zinc-500 hover:text-white")}>{tf.label}</button>
               ))}
             </div>
             <CandleTimer interval={selectedInterval} />
          </div>
        </div>
        <div className="flex items-center gap-2 md:gap-4">
           {activePrice && <div className="flex items-center gap-2"><div className="flex flex-col items-end"><span className="text-[8px] text-zinc-500 font-bold">BID</span><span className="font-mono text-[9px] text-white tabular-nums">{activePrice.bid?.toFixed(getPrecision(selectedSymbol))}</span></div><div className="flex flex-col items-end"><span className="text-[8px] text-zinc-500 font-bold">ASK</span><span className="font-mono text-[9px] text-white tabular-nums">{activePrice.ask?.toFixed(getPrecision(selectedSymbol))}</span></div></div>}
           {isMobile && <Button size="sm" className="bg-primary text-black font-black text-[9px] h-7 px-3 rounded" onClick={() => setIsOrderSheetOpen(true)}>TRADE</Button>}
           <button onClick={() => setIsSettingsOpen(true)} className="p-1.5 hover:bg-white/5 rounded"><Settings className="w-4 h-4 text-zinc-500" /></button>
        </div>
      </header>
      
      <div className="flex-1 flex min-h-0 relative">
        {!isMobile && (
          <aside className="w-10 border-r border-zinc-800 bg-zinc-950 flex flex-col items-center py-2 gap-2 shrink-0 z-40">
             <ToolButton active={activeTool === 'crosshair'} onClick={() => setActiveTool('crosshair')} icon={<Crosshair size={18} />} />
             <ToolButton active={activeTool === 'dot'} onClick={() => setActiveTool('dot')} icon={<MousePointer2 size={18} />} />
             <div className="w-6 h-[1px] bg-zinc-800 my-1" />
             <ToolButton active={activeTool === 'trend'} onClick={() => setActiveTool('trend')} icon={<Slash size={18} className="rotate-45" />} />
             <ToolButton active={activeTool === 'ray'} onClick={() => setActiveTool('ray')} icon={<ArrowRight size={18} className="-rotate-45" />} />
             <ToolButton active={activeTool === 'hline'} onClick={() => setActiveTool('hline')} icon={<Minus size={18} />} />
             <ToolButton active={activeTool === 'vline'} onClick={() => setActiveTool('vline')} icon={<SeparatorVertical size={18} />} />
             <div className="w-6 h-[1px] bg-zinc-800 my-1" />
             <ToolButton active={activeTool === 'rect'} onClick={() => setActiveTool('rect')} icon={<Square size={18} />} />
             <ToolButton active={activeTool === 'circle'} onClick={() => setActiveTool('circle')} icon={<Circle size={18} />} />
             <ToolButton active={activeTool === 'brush'} onClick={() => setActiveTool('brush')} icon={<Pencil size={18} />} />
             <ToolButton active={activeTool === 'text'} onClick={() => setActiveTool('text')} icon={<Type size={18} />} />
             <ToolButton active={activeTool === 'fib'} onClick={() => setActiveTool('fib')} icon={<LayoutGrid size={18} />} />
             <div className="mt-auto space-y-1 pb-2">
               <ToolButton active={false} onClick={() => setActiveTool('eraser')} icon={<Eraser size={16} />} />
             </div>
          </aside>
        )}

        <div className="flex-1 relative min-h-0 bg-[#09090b] flex flex-col border-r border-zinc-800">
          <div className={cn("flex-1 relative overflow-hidden", isMobile && mobileTab !== 'chart' && "hidden")} ref={chartContainerRef}>
            {isChartReady && chartInstanceRef.current && mainSeriesRef.current && (
              <DrawingLayer chart={chartInstanceRef.current} series={mainSeriesRef.current} symbol={selectedSymbol} activeTool={activeTool} setActiveTool={setActiveTool} />
            )}
            {isChartLoading && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-zinc-950/80 backdrop-blur-sm">
                <Loader2 className="animate-spin text-primary w-8 h-8" />
                <p className="text-[10px] font-black mt-4 uppercase tracking-[0.2em] text-zinc-400">Syncing Liquidity Feed...</p>
              </div>
            )}
          </div>
          {!isMobile ? (
            <PositionsPanel 
              openTrades={openTrades} 
              closedTrades={closedTrades} 
              alerts={[]} 
              livePrices={fusedPrices} 
              closeTrade={closeTrade} 
              deleteAlert={async () => {}} 
              user={user} 
              alertsLoading={false} 
              panelOpen={bottomPanelOpen} 
              setPanelOpen={setBottomPanelOpen} 
            />
          ) : (
            <div className={cn("flex-1 overflow-y-auto bg-zinc-950", mobileTab === 'chart' && "hidden")}>
               {mobileTab === 'positions' && <PositionsPanel openTrades={openTrades} closedTrades={closedTrades} alerts={[]} livePrices={fusedPrices} closeTrade={closeTrade} deleteAlert={async () => {}} user={user} alertsLoading={false} panelOpen={true} setPanelOpen={() => {}} defaultTab="positions" />}
               {mobileTab === 'history' && <PositionsPanel openTrades={openTrades} closedTrades={closedTrades} alerts={[]} livePrices={fusedPrices} closeTrade={closeTrade} deleteAlert={async () => {}} user={user} alertsLoading={false} panelOpen={true} setPanelOpen={() => {}} defaultTab="history" />}
            </div>
          )}
        </div>

        {!isMobile && (
          <aside className="w-80 bg-zinc-950 p-6 flex flex-col shrink-0 z-40 overflow-y-auto custom-scrollbar">
            <div className="flex items-center gap-3 mb-8">
               <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-lg shadow-primary/10">
                  <TrendingUp size={20} />
               </div>
               <div>
                  <h2 className="text-sm font-headline font-bold text-white uppercase tracking-tight">Order Entry</h2>
                  <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Institutional Node</p>
               </div>
            </div>
            <OrderPanelContent 
              currentAccountId={currentAccountId}
              setCurrentAccountId={setCurrentAccountId}
              selectedAccount={selectedAccount}
              activeAccounts={activeAccounts}
              activePrice={activePrice}
              selectedSymbol={selectedSymbol}
              lotsInput={lotsInput}
              setLotsInput={setLotsInput}
              sl={sl}
              setSl={setSl}
              tp={tp}
              setTp={setTp}
              actionLoading={actionLoading}
              placeTrade={placeTrade}
            />
          </aside>
        )}
      </div>

      {isMobile && (
        <nav className="h-16 border-t border-zinc-800 bg-zinc-950 flex items-center justify-around shrink-0 z-50">
          <MobileNavButton active={mobileTab === 'chart'} onClick={() => setMobileTab('chart')} icon={<Activity size={20} />} label="Chart" />
          <MobileNavButton active={false} onClick={() => setIsOrderSheetOpen(true)} icon={<LayoutGrid size={20} />} label="Trade" />
          <MobileNavButton active={mobileTab === 'positions'} onClick={() => setMobileTab('positions')} icon={<History size={20} />} label="Active" />
          <MobileNavButton active={mobileTab === 'account'} onClick={() => setMobileTab('account')} icon={<UserCircle size={20} />} label="Account" />
        </nav>
      )}

      <Sheet open={isOrderSheetOpen} onOpenChange={setIsOrderSheetOpen}>
        <SheetContent side="bottom" className="h-[85vh] bg-zinc-950 border-zinc-800 p-6">
          <SheetHeader>
            <SheetTitle className="text-white font-black font-headline italic uppercase flex items-center justify-between">
              {selectedSymbol}
              <Badge className="bg-primary text-black">LIVE EXECUTION</Badge>
            </SheetTitle>
          </SheetHeader>
          <div className="mt-8 h-full">
            <OrderPanelContent 
              currentAccountId={currentAccountId}
              setCurrentAccountId={setCurrentAccountId}
              selectedAccount={selectedAccount}
              activeAccounts={activeAccounts}
              activePrice={activePrice}
              selectedSymbol={selectedSymbol}
              lotsInput={lotsInput}
              setLotsInput={setLotsInput}
              sl={sl}
              setSl={setSl}
              tp={tp}
              setTp={setTp}
              actionLoading={actionLoading}
              placeTrade={placeTrade}
            />
          </div>
        </SheetContent>
      </Sheet>

      <ChartSettingsModal 
        open={isSettingsOpen} 
        onOpenChange={setIsSettingsOpen} 
        settings={{ canvas: { background: { color: '#09090b', type: 'solid' }, grid: { type: 'both', vert: { color: '#18181b' }, horz: { color: '#18181b' } }, candles: { upColor: '#10b981', downColor: '#ef4444' }, watermark: { visible: true, text: 'PRIME FUNDED' }, sessionBreaks: { enabled: true } }, scales: { type: 'regular', labels: { currentPrice: true, ohlc: true, tradeLines: true } } }} 
        onSettingsChange={() => {}} 
        onResetScale={() => { chartInstanceRef.current?.timeScale().fitContent(); }} 
      />
    </div>
  );
}

function ToolButton({ active, onClick, icon }: any) { return <button onClick={onClick} className={cn("w-8 h-8 rounded flex items-center justify-center transition-all cursor-pointer", active ? "bg-primary text-black" : "text-zinc-500 hover:text-white hover:bg-white/5")}>{icon}</button>; }
function MobileNavButton({ active, onClick, icon, label }: any) { return <button onClick={onClick} className={cn("flex flex-col items-center justify-center gap-1 transition-all", active ? "text-primary" : "text-zinc-500")}>{icon}<span className="text-[8px] font-bold uppercase">{label}</span></button>; }
