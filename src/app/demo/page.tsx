'use client';

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { useCollection } from "@/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { 
  Loader2, ArrowLeft, Minus, Activity, Bell, Globe, Settings, 
  Crosshair, Circle, Slash, ArrowUpRight, ArrowRight,
  Square, Type, Ruler, ZoomIn, ZoomOut, Home, Eraser, SeparatorVertical,
  Clock as ClockIcon, AlertTriangle, Lock, Unlock, Magnet,
  TrendingUp, Eye, EyeOff, ShieldAlert, UserCircle, XCircle
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
import { CONTRACT_SIZE } from "@/lib/rulesConfig";

const SYMBOLS = [
  "XAUUSD", "XAGUSD", "XPTUSD", "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCHF", "USDCAD", "NZDUSD",
  "BTCUSD", "ETHUSD", "SOLUSD", "XRPUSD", "BNBUSD", "DOGEUSD", "ADAUSD"
];

const TIMEFRAMES = [
  { label: '1m', value: '1min' }, { label: '5m', value: '5min' }, { label: '15m', value: '15min' },
  { label: '30m', value: '30min' }, { label: '1H', value: '1h' }, { label: '4H', value: '4h' },
  { label: '1D', value: '1day' },
];

function OrderPanel({ 
  hasMounted, 
  actionLoading, 
  activePrice, 
  selectedSymbol, 
  lotsInput, 
  setLotsInput, 
  sl, 
  setSl, 
  tp, 
  setTp, 
  placeTrade,
  marketOpen
}: any) {
  const precision = selectedSymbol.includes('JPY') ? 3 : (selectedSymbol === 'XAUUSD' ? 3 : 5);
  const spread = activePrice ? Math.abs(activePrice.ask - activePrice.bid) : 0;

  return (
    <div className="space-y-6">
      <div className="h-14 bg-zinc-900/50 border border-zinc-800 rounded-lg flex flex-col items-center justify-center gap-1 shadow-inner">
        <div className="flex items-center gap-4 text-[10px] font-black uppercase tracking-[0.1em]">
          <div className="flex flex-col items-center">
            <span className="text-zinc-500 text-[8px]">BID</span>
            <span className="text-white font-mono">{activePrice?.bid?.toLocaleString('en-US', { minimumFractionDigits: precision })}</span>
          </div>
          <div className="w-px h-6 bg-zinc-800" />
          <div className="flex flex-col items-center">
            <span className="text-zinc-500 text-[8px]">ASK</span>
            <span className="text-white font-mono">{activePrice?.ask?.toLocaleString('en-US', { minimumFractionDigits: precision })}</span>
          </div>
        </div>
        <div className="text-[8px] font-black text-primary/60 uppercase tracking-widest">
          SPREAD: {spread.toLocaleString('en-US', { minimumFractionDigits: precision })}
        </div>
      </div>
      
      <div className="space-y-6">
        <div className="flex flex-col gap-2">
          <Label className="text-[10px] font-black uppercase text-zinc-500">Volume (Lots)</Label>
          <div className="flex items-center gap-2">
            <button onClick={() => setLotsInput((parseFloat(lotsInput) - 0.01).toFixed(2))} className="w-10 h-11 bg-zinc-900 rounded-lg border border-zinc-800 font-bold hover:bg-zinc-800 transition-colors">-</button>
            <Input
              type="text"
              value={lotsInput}
              onChange={(e) => setLotsInput(e.target.value)}
              className="h-11 bg-zinc-900/50 text-center font-mono font-bold text-white border-zinc-800"
            />
            <button onClick={() => setLotsInput((parseFloat(lotsInput) + 0.01).toFixed(2))} className="w-10 h-11 bg-zinc-900 rounded-lg border border-zinc-800 font-bold hover:bg-zinc-800 transition-colors">+</button>
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
            disabled={actionLoading || !activePrice || !marketOpen} 
            className="w-full h-16 rounded-xl font-black text-xs tracking-widest bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg active:scale-95 transition-all disabled:opacity-50"
          >
            {actionLoading ? <Loader2 className="animate-spin w-5 h-5 mx-auto" /> : "BUY / LONG"}
          </button>
          <button 
            type="button" 
            onClick={() => placeTrade('sell')} 
            disabled={actionLoading || !activePrice || !marketOpen} 
            className="w-full h-16 rounded-xl font-black text-xs tracking-widest bg-red-600 hover:bg-red-700 text-white shadow-lg active:scale-95 transition-all disabled:opacity-50"
          >
            {actionLoading ? <Loader2 className="animate-spin w-5 h-5 mx-auto" /> : "SELL / SHORT"}
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
  const [selectedSymbol, setSelectedSymbol] = useState("XAUUSD");
  const [selectedInterval, setSelectedInterval] = useState("1min");
  const [lotsInput, setLotsInput] = useState("0.10");
  const [sl, setSl] = useState("");
  const [tp, setTp] = useState("");
  const [bottomPanelOpen, setBottomPanelOpen] = useState(false);
  const [activeTool, setActiveTool] = useState('crosshair');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isOrderSheetOpen, setIsOrderSheetOpen] = useState(false);

  useEffect(() => { setHasMounted(true); }, []);

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
  const activeAccounts = useMemo(() => accounts.filter(a => a.status === 'active'), [accounts]);
  const selectedAccount = useMemo(() => activeAccounts.find(a => a.id === currentAccountId) || activeAccounts[0] || null, [activeAccounts, currentAccountId]);

  const tradeConstraints = useMemo(() => user?.uid ? [where("userId", "==", user.uid), orderBy("openedAt", "desc")] : [], [user?.uid]);
  const { data: allUserTrades } = useCollection<any>(tradeConstraints.length ? "demoTrades" : null, tradeConstraints);
  const trades = useMemo(() => allUserTrades.filter(t => t.accountId === (currentAccountId || activeAccounts[0]?.id)), [allUserTrades, currentAccountId, activeAccounts]);
  const openTrades = useMemo(() => trades.filter(t => t.status === 'open'), [trades]);
  const closedTrades = useMemo(() => trades.filter(t => t.status === 'closed'), [trades]);

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<IChartApi | null>(null);
  const mainSeriesRef = useRef<ISeriesApi<any> | null>(null);

  // PLACE TRADE LOGIC - Hardened
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

  // CLOSE TRADE LOGIC - Hardened
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

  // CHART INIT
  useEffect(() => {
    if (!chartContainerRef.current) return;
    const chart = createChart(chartContainerRef.current, {
      layout: { background: { type: ColorType.Solid, color: '#09090b' }, textColor: '#71717a' },
      grid: { vertLines: { color: '#18181b' }, horzLines: { color: '#18181b' } },
      width: chartContainerRef.current.clientWidth,
      height: 500,
      timeScale: { rightOffset: 15, barSpacing: 6, borderColor: '#27272a' }
    });
    const series = chart.addCandlestickSeries({ upColor: '#10b981', downColor: '#ef4444', borderVisible: false, wickUpColor: '#10b981', wickDownColor: '#ef4444' });
    chartInstanceRef.current = chart;
    mainSeriesRef.current = series;
    setIsChartReady(true);
    return () => chart.remove();
  }, []);

  // FETCH HISTORY
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

  return (
    <div className="fixed inset-0 h-screen w-screen bg-[#09090b] flex flex-col text-zinc-300 overflow-hidden">
      <header className="h-12 border-b border-zinc-800 flex items-center justify-between px-4 bg-zinc-950 shrink-0 z-50">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Image src={branding.logoUrl} alt="Logo" width={20} height={20} className="rounded-full" />
            <span className="font-bold text-sm text-white">Trade Terminal</span>
          </div>
          <Link href="/dashboard" className="text-[10px] font-bold text-zinc-500 hover:text-white transition-colors border-l border-zinc-800 pl-6 h-12 flex items-center gap-2"><ArrowLeft className="w-3 h-3" /> Dashboard</Link>
        </div>
        <div className="flex items-center gap-4">
          <div className="px-3 py-1 bg-white/5 rounded-full border border-white/5 flex items-center gap-1.5"><UserCircle className="w-3 h-3 text-primary" /><span className="text-[10px] font-black text-zinc-400">ID: {userData?.traderId}</span></div>
          {isMobile && <Button size="sm" className="bg-primary text-black font-black text-[10px] h-8" onClick={() => setIsOrderSheetOpen(true)}>TRADE</Button>}
          {!isMobile && (
            <Select value={currentAccountId ?? ""} onValueChange={setCurrentAccountId}>
              <SelectTrigger className="bg-transparent border-none h-12 w-56 text-xs font-bold"><SelectValue placeholder="Select Account" /></SelectTrigger>
              <SelectContent>{activeAccounts.map(a => <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>)}</SelectContent>
            </Select>
          )}
        </div>
      </header>

      <div className="h-10 border-b border-zinc-800 flex items-center px-1 gap-1 bg-zinc-950/50 overflow-x-auto no-scrollbar shrink-0">
        {SYMBOLS.map(s => (
          <button key={s} onClick={() => setSelectedSymbol(s)} className={cn("px-4 h-full border-b-2 transition-all", s === selectedSymbol ? "border-primary bg-primary/5 text-white" : "border-transparent text-zinc-500 hover:text-zinc-300")}><span className="font-bold text-[10px]">{s}</span></button>
        ))}
      </div>

      <div className="flex-1 flex min-h-0 relative">
        <aside className="hidden lg:flex w-12 border-r border-zinc-800 bg-zinc-950 flex-col items-center py-4 gap-4">
          <Crosshair className="w-5 h-5 text-zinc-500" />
          <Slash className="w-5 h-5 text-zinc-500" />
          <Type className="w-5 h-5 text-zinc-500" />
          <Eraser className="w-5 h-5 text-zinc-500" />
        </aside>

        <div className="flex-1 relative min-h-0 bg-[#09090b]">
          <div className="absolute inset-0" ref={chartContainerRef} />
          {isChartLoading && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-zinc-950/80 backdrop-blur-sm">
              <Loader2 className="animate-spin text-primary" /><p className="text-[10px] font-black mt-4">Syncing Market Feed...</p>
            </div>
          )}
        </div>

        <aside className="hidden lg:flex w-80 border-l border-zinc-800 bg-zinc-950 p-6 flex-col gap-8 shrink-0">
          <OrderPanel 
            hasMounted={hasMounted} 
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
            marketOpen={true}
          />
        </aside>
      </div>

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

      <Sheet open={isOrderSheetOpen} onOpenChange={setIsOrderSheetOpen}>
        <SheetContent side="bottom" className="bg-zinc-950 border-zinc-800 text-white rounded-t-3xl h-[70vh]">
          <SheetHeader><SheetTitle className="text-center">Execute Order</SheetTitle></SheetHeader>
          <div className="pt-8">
            <OrderPanel hasMounted={hasMounted} actionLoading={actionLoading} activePrice={activePrice} selectedSymbol={selectedSymbol} lotsInput={lotsInput} setLotsInput={setLotsInput} sl={sl} setSl={setSl} tp={tp} setTp={setTp} placeTrade={placeTrade} marketOpen={true} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
