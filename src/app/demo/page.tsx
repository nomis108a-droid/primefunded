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
  Loader2, Activity, Settings, 
  Crosshair, Circle, Slash, ArrowRight,
  Square, Type, Eraser, SeparatorVertical,
  Clock as ClockIcon, Lock, Unlock,
  UserCircle, XCircle,
  MousePointer2, Pencil, LayoutGrid, Plus, History, ChevronLeft, Minus
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
];

export default function DemoPage() {
  const { user, userData, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const [hasMounted, setHasMounted] = useState(false);
  const [currentAccountId, setCurrentAccountId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [isChartLoading, setIsChartLoading] = useState(true);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
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

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<IChartApi | null>(null);
  const mainSeriesRef = useRef<ISeriesApi<any> | null>(null);
  const priceLinesRef = useRef<Map<string, IPriceLine[]>>(new Map());

  useEffect(() => { setHasMounted(true); }, []);

  // Market Data
  const { tick: streamTick } = useTickStream(selectedSymbol);
  const livePrices = useLivePrices(SYMBOLS);
  const activePrice = useMemo(() => streamTick?.price ? streamTick : livePrices[selectedSymbol.toUpperCase()] || null, [streamTick, livePrices, selectedSymbol]);

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
    const symbolUpper = trade.symbol.toUpperCase();
    const pData = livePrices[symbolUpper] || activePrice;
    if (!pData) return { pnl: 0, pct: 0 };
    const currentPrice = trade.type === 'buy' ? (pData.bid || pData.price) : (pData.ask || pData.price);
    const diff = trade.type === 'buy' ? currentPrice - trade.openPrice : trade.openPrice - currentPrice;
    const contractSize = CONTRACT_SIZE[symbolUpper] || 100000;
    return { pnl: diff * trade.lots * contractSize, pct: (diff / trade.openPrice) * 100 };
  }, [livePrices, activePrice]);

  // Chart Init
  useEffect(() => {
    if (!chartContainerRef.current) return;
    setIsChartReady(false);
    priceLinesRef.current.clear();
    
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
  }, [selectedSymbol]);

  // History Load
  useEffect(() => {
    if (!isChartReady || !mainSeriesRef.current) return;
    const fetchHistory = async () => {
      try {
        const res = await fetch(`/api/terminal/candles?symbol=${selectedSymbol}&interval=${selectedInterval}&limit=500`);
        const data = await res.json();
        if (data.candles && mainSeriesRef.current) {
          mainSeriesRef.current.setData(data.candles);
          chartInstanceRef.current?.timeScale().fitContent();
        }
      } catch(e) {} finally { setIsChartLoading(false); setIsInitialLoad(false); }
    };
    fetchHistory();
  }, [selectedSymbol, selectedInterval, isChartReady]);

  // Tick Stream
  useEffect(() => {
    if (activePrice && mainSeriesRef.current && isChartReady) {
      const data = mainSeriesRef.current.data();
      if (data.length > 0) {
        const last = data[data.length - 1] as any;
        mainSeriesRef.current.update({ ...last, close: activePrice.price, high: Math.max(last.high, activePrice.price), low: Math.min(last.low, activePrice.price) });
      }
    }
  }, [activePrice, isChartReady]);

  // Trade Overlays
  useEffect(() => {
    if (!mainSeriesRef.current || !isChartReady) return;
    const activeIds = new Set(openTrades.map(t => t.id));
    priceLinesRef.current.forEach((lines, id) => {
      if (!activeIds.has(id)) {
        lines.forEach(l => { try { mainSeriesRef.current?.removePriceLine(l); } catch(e) {} });
        priceLinesRef.current.delete(id);
      }
    });

    openTrades.forEach(trade => {
      if (trade.symbol.toUpperCase() !== selectedSymbol.toUpperCase()) return;
      const { pnl, pct } = calculateTradePnL(trade);
      const title = `${trade.type.toUpperCase()} ${trade.lots} | $${pnl.toFixed(2)} (${pct.toFixed(2)}%)`;
      let lines = priceLinesRef.current.get(trade.id);
      
      if (!lines) {
        const entry = mainSeriesRef.current!.createPriceLine({ price: trade.openPrice, color: '#11b3f5', lineStyle: LineStyle.Dashed, axisLabelVisible: true, title });
        const newLines = [entry];
        if (trade.sl > 0) newLines.push(mainSeriesRef.current!.createPriceLine({ price: trade.sl, color: '#ef4444', lineStyle: LineStyle.Solid, axisLabelVisible: true, title: 'SL' }));
        if (trade.tp > 0) newLines.push(mainSeriesRef.current!.createPriceLine({ price: trade.tp, color: '#10b981', lineStyle: LineStyle.Solid, axisLabelVisible: true, title: 'TP' }));
        priceLinesRef.current.set(trade.id, newLines);
      } else {
        lines[0].applyOptions({ title });
        // Reconcile SL/TP changes
        const currentSl = trade.sl > 0 ? trade.sl : null;
        const currentTp = trade.tp > 0 ? trade.tp : null;
        if (lines.length !== (1 + (currentSl ? 1 : 0) + (currentTp ? 1 : 0))) {
          lines.forEach(l => { try { mainSeriesRef.current?.removePriceLine(l); } catch(e) {} });
          priceLinesRef.current.delete(trade.id);
        }
      }
    });
  }, [openTrades, selectedSymbol, isChartReady, calculateTradePnL]);

  async function placeTrade(type: 'buy' | 'sell') {
    if (actionLoading || !user || !selectedAccount || !activePrice) return;
    setActionLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/terminal/trades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ accountId: selectedAccount.id, symbol: selectedSymbol, type, lots: parseFloat(lotsInput), sl: sl ? parseFloat(sl) : null, tp: tp ? parseFloat(tp) : null })
      });
      if (!res.ok) toast({ title: "Order Rejected", variant: "destructive" });
      else { toast({ title: "✓ Position Opened" }); setIsOrderSheetOpen(false); }
    } catch(e) { toast({ title: "Network Error", variant: "destructive" }); } finally { setActionLoading(false); }
  }

  async function closeTrade(tradeId: string) {
    if (actionLoading || !user) return;
    setActionLoading(true);
    try {
      const trade = openTrades.find(t => t.id === tradeId);
      if (!trade) return;
      const token = await user.getIdToken();
      const res = await fetch(`/api/terminal/trades/${tradeId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
      });
      if (res.ok) toast({ title: "✓ Position Closed" });
    } catch(e) { toast({ title: "Error", variant: "destructive" }); } finally { setActionLoading(false); }
  }

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
          </div>
        </div>
        <div className="flex items-center gap-2 md:gap-4">
           {activePrice && <div className="flex items-center gap-2"><div className="flex flex-col items-end"><span className="text-[8px] text-zinc-500 font-bold">BID</span><span className="font-mono text-[9px] text-white">{activePrice.bid?.toFixed(getPrecision(selectedSymbol))}</span></div><div className="flex flex-col items-end"><span className="text-[8px] text-zinc-500 font-bold">ASK</span><span className="font-mono text-[9px] text-white">{activePrice.ask?.toFixed(getPrecision(selectedSymbol))}</span></div></div>}
           <Button size="sm" className="bg-primary text-black font-black text-[9px] h-7 px-3 rounded" onClick={() => setIsOrderSheetOpen(true)}>TRADE</Button>
           <button onClick={() => setIsSettingsOpen(true)} className="p-1.5 hover:bg-white/5 rounded"><Settings className="w-4 h-4 text-zinc-500" /></button>
        </div>
      </header>
      <div className="flex-1 flex min-h-0 relative mb-[env(safe-area-inset-bottom)]">
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
        <div className="flex-1 relative min-h-0 bg-[#09090b] flex flex-col">
          <div className={cn("flex-1 relative overflow-hidden", isMobile && mobileTab !== 'chart' && "hidden")} ref={chartContainerRef}>
            {isChartReady && chartInstanceRef.current && mainSeriesRef.current && (
              <DrawingLayer chart={chartInstanceRef.current} series={mainSeriesRef.current} symbol={selectedSymbol} activeTool={activeTool} setActiveTool={setActiveTool} locked={drawingsLocked} hidden={drawingsHidden} />
            )}
            {isChartLoading && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-zinc-950/80 backdrop-blur-sm">
                <Loader2 className="animate-spin text-primary w-8 h-8" />
                <p className="text-[10px] font-black mt-4 uppercase tracking-[0.2em] text-zinc-400">Syncing Liquidity Feed...</p>
              </div>
            )}
          </div>
          {!isMobile ? (
            <PositionsPanel openTrades={openTrades} closedTrades={closedTrades} alerts={[]} livePrices={livePrices} closeTrade={closeTrade} deleteAlert={async () => {}} user={user} alertsLoading={false} panelOpen={bottomPanelOpen} setPanelOpen={setBottomPanelOpen} />
          ) : (
            <div className={cn("flex-1 overflow-y-auto bg-zinc-950", mobileTab === 'chart' && "hidden")}>
               {mobileTab === 'positions' && <PositionsPanel openTrades={openTrades} closedTrades={closedTrades} alerts={[]} livePrices={livePrices} closeTrade={closeTrade} deleteAlert={async () => {}} user={user} alertsLoading={false} panelOpen={true} setPanelOpen={() => {}} defaultTab="positions" />}
               {mobileTab === 'history' && <PositionsPanel openTrades={openTrades} closedTrades={closedTrades} alerts={[]} livePrices={livePrices} closeTrade={closeTrade} deleteAlert={async () => {}} user={user} alertsLoading={false} panelOpen={true} setPanelOpen={() => {}} defaultTab="history" />}
            </div>
          )}
        </div>
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
        <SheetContent side="bottom" className="h-[85vh] bg-zinc-950 border-zinc-800 p-6"><SheetHeader><SheetTitle className="text-white font-black font-headline italic uppercase">{selectedSymbol}</SheetTitle></SheetHeader><div className="space-y-6 mt-6"><div className="space-y-3"><Label className="text-[10px] font-black uppercase text-zinc-500">Volume (Lots)</Label><Input type="number" value={lotsInput} onChange={e => setLotsInput(e.target.value)} className="h-12 bg-zinc-900 border-zinc-800 text-center font-mono font-bold text-white" /></div><div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label className="text-[9px] font-black uppercase text-zinc-500">Stop Loss</Label><Input type="number" placeholder="0.000" value={sl} onChange={e => setSl(e.target.value)} className="h-10 bg-zinc-900 border-zinc-800" /></div><div className="space-y-2"><Label className="text-[9px] font-black uppercase text-zinc-500">Take Profit</Label><Input type="number" placeholder="0.000" value={tp} onChange={e => setTp(e.target.value)} className="h-10 bg-zinc-900 border-zinc-800" /></div></div><div className="grid gap-4 pt-4"><button onClick={() => placeTrade('buy')} className="h-14 rounded-xl bg-emerald-600 font-black text-white shadow-lg active:scale-95 transition-all">BUY / LONG</button><button onClick={() => placeTrade('sell')} className="h-14 rounded-xl bg-red-600 font-black text-white shadow-lg active:scale-95 transition-all">SELL / SHORT</button></div></div></SheetContent>
      </Sheet>
      <ChartSettingsModal open={isSettingsOpen} onOpenChange={setIsSettingsOpen} settings={{ canvas: { background: { color: '#09090b', type: 'solid' }, grid: { type: 'both', vert: { color: '#18181b' }, horz: { color: '#18181b' } }, candles: { upColor: '#10b981', downColor: '#ef4444' }, watermark: { visible: true, text: 'PRIME FUNDED' }, sessionBreaks: { enabled: true } }, scales: { type: 'regular', labels: { currentPrice: true, ohlc: true, tradeLines: true } } }} onSettingsChange={() => {}} onResetScale={() => { chartInstanceRef.current?.timeScale().fitContent(); }} />
    </div>
  );
}

function ToolButton({ active, onClick, icon }: any) { return <button onClick={onClick} className={cn("w-8 h-8 rounded flex items-center justify-center transition-all cursor-pointer", active ? "bg-primary text-black" : "text-zinc-500 hover:text-white hover:bg-white/5")}>{icon}</button>; }
function MobileNavButton({ active, onClick, icon, label }: any) { return <button onClick={onClick} className={cn("flex flex-col items-center justify-center gap-1 transition-all", active ? "text-primary" : "text-zinc-500")}>{icon}<span className="text-[8px] font-bold uppercase">{label}</span></button>; }
