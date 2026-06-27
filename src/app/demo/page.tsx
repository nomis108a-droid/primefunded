'use client';

import { useEffect, useState, useMemo, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { useFirestore, useCollection } from "@/firebase";
import { Navigation } from "@/components/Navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { 
  Activity, 
  Wallet, 
  History, 
  XCircle, 
  Terminal,
  Loader2,
  Clock
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { where } from "firebase/firestore";
import { createChart, ColorType, IChartApi, ISeriesApi } from 'lightweight-charts';

const SYMBOLS = ["XAUUSD", "BTCUSD", "ETHUSD", "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCHF"];
const TIMEFRAMES = [
  { label: '1M', value: '1min' },
  { label: '5M', value: '5min' },
  { label: '15M', value: '15min' },
  { label: '1H', value: '1h' },
  { label: '4H', value: '4h' },
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
  const { user } = useAuth();
  const db = useFirestore();
  const { toast } = useToast();

  const [currentAccountId, setCurrentAccountId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [isChartLoading, setIsChartLoading] = useState(true);
  const [selectedSymbol, setSelectedSymbol] = useState("XAUUSD");
  const [selectedInterval, setSelectedInterval] = useState("1min");
  const [lots, setLots] = useState(0.10);
  const [livePrices, setLivePrices] = useState<Record<string, any>>({});

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

  // 2. Initialize Chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#0a0a0a' },
        textColor: '#888',
      },
      grid: {
        vertLines: { color: '#1a1a1a' },
        horzLines: { color: '#1a1a1a' },
      },
      width: chartContainerRef.current.clientWidth,
      height: 420,
      timeScale: {
        borderColor: '#222',
        timeVisible: true,
      },
      rightPriceScale: {
        borderColor: '#222',
      },
      watermark: { visible: false }
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
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

  // 3. Load Data
  useEffect(() => {
    if (!candleSeriesRef.current) return;
    currentCandleRef.current = null;
    const load = async () => {
      setIsChartLoading(true);
      try {
        const res = await fetch(`/api/terminal/candles?symbol=${selectedSymbol}&interval=${selectedInterval}`);
        if (!res.ok) return;
        const candles = await res.json();
        if (Array.isArray(candles) && candles.length > 0) {
          candleSeriesRef.current?.setData(candles);
          chartInstanceRef.current?.timeScale().fitContent();
        }
      } catch (e: any) {
        console.warn('[Chart] Candles fetch failed:', e.message);
      } finally {
        setIsChartLoading(false);
      }
    };
    load();
  }, [selectedSymbol, selectedInterval]);

  // 4. Live Tick Update - Fixed Persistent Logic
  useEffect(() => {
    if (!candleSeriesRef.current || !livePrices[selectedSymbol]) return;
    const price = livePrices[selectedSymbol].price;
    if (!price || price <= 0) return;

    const intervalMap: Record<string, number> = {
      '1min': 60, '5min': 300, '15min': 900, '1h': 3600, '4h': 14400, '1day': 86400
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

  const currentAccount = useMemo(() => accounts.find((a) => a.id === currentAccountId), [accounts, currentAccountId]);
  const currentPriceData = livePrices[selectedSymbol];

  const metrics = useMemo(() => {
    if (!currentAccount) return { equity: 0, floatingPnL: 0 };
    let floating = 0;
    openTrades.forEach(trade => {
      const priceData = livePrices[trade.symbol];
      if (priceData) {
        const cp = trade.type === 'buy' ? priceData.bid : priceData.ask;
        const contractSize = trade.symbol === 'XAUUSD' ? 100 : trade.symbol === 'BTCUSD' ? 1 : trade.symbol === 'ETHUSD' ? 1 : 100000;
        floating += trade.type === 'buy' 
          ? (cp - trade.openPrice) * contractSize * trade.lots
          : (trade.openPrice - cp) * contractSize * trade.lots;
      }
    });
    return { equity: (currentAccount.balance || 0) + floating, floatingPnL: floating };
  }, [currentAccount, openTrades, livePrices]);

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
        body: JSON.stringify({ accountId: currentAccountId, symbol: selectedSymbol, type, lots, price: executionPrice }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Execution rejected.");
      }
      toast({ title: "Order Executed", description: `${type.toUpperCase()} ${lots} ${selectedSymbol}` });
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
    <div className="flex h-screen bg-background overflow-hidden">
      <Navigation />
      <main className="flex-1 flex flex-col min-w-0">
        <div className="h-14 border-b border-border flex items-center px-4 gap-2 bg-card/30 overflow-x-auto no-scrollbar shrink-0">
          <div className="flex items-center gap-2">
            {SYMBOLS.map((s) => {
              const p = livePrices[s];
              return (
                <button 
                  key={s} 
                  onClick={() => setSelectedSymbol(s)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg border transition-all flex items-center gap-3 shrink-0",
                    s === selectedSymbol ? "bg-primary/10 border-primary text-primary" : "bg-secondary/50 border-border text-muted-foreground hover:border-muted-foreground/30"
                  )}
                >
                  <span className="font-bold text-xs">{s}</span>
                  <span className="font-mono text-[11px] tabular-nums text-white">
                    {formatPrice(p?.price, s)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 flex min-h-0">
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex-1 relative bg-[#0a0a0a]">
              <div className="absolute top-4 left-4 z-10 flex gap-1 bg-black/60 p-1 rounded-lg border border-white/10 backdrop-blur-md">
                {TIMEFRAMES.map((tf) => (
                  <button
                    key={tf.value}
                    onClick={() => setSelectedInterval(tf.value)}
                    className={cn(
                      "px-3 py-1 rounded text-[10px] font-black uppercase transition-all",
                      selectedInterval === tf.value ? "bg-primary text-black" : "text-muted-foreground hover:text-white"
                    )}
                  >
                    {tf.label}
                  </button>
                ))}
              </div>

              {isChartLoading && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
                  <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">Syncing Node...</p>
                </div>
              )}
              
              <div ref={chartContainerRef} className="h-full w-full relative">
                {/* Security Overlay to block external links */}
                <div className="absolute inset-0 pointer-events-none z-0" />
                <div className="absolute bottom-0 left-0 w-20 h-8 z-10" />
              </div>
            </div>
            
            <div className="h-[250px] border-t border-border bg-card/30 overflow-hidden flex flex-col shrink-0">
               <div className="px-4 py-2 border-b border-border flex justify-between items-center bg-secondary/20">
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                    <History className="w-3.5 h-3.5" /> Open Positions ({openTrades.length})
                  </h3>
                  <Badge variant="outline" className={cn(
                    "text-[10px] font-black uppercase",
                    metrics.floatingPnL >= 0 ? "text-emerald-500 border-emerald-500/20 bg-emerald-500/5" : "text-destructive border-destructive/20 bg-destructive/5"
                  )}>
                    Floating: {metrics.floatingPnL >= 0 ? '+' : ''}${metrics.floatingPnL.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </Badge>
               </div>
               <div className="flex-1 overflow-y-auto custom-scrollbar">
                  <table className="w-full text-xs text-left">
                    <thead className="sticky top-0 bg-background/80 backdrop-blur-md text-muted-foreground uppercase text-[9px] font-bold">
                      <tr>
                        <th className="py-2 px-4">Symbol</th>
                        <th className="py-2 px-2">Type</th>
                        <th className="py-2 px-2">Lots</th>
                        <th className="py-2 px-4">Entry</th>
                        <th className="py-2 px-4 text-right">PnL</th>
                        <th className="py-2 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {openTrades.length === 0 ? (
                        <tr><td colSpan={6} className="py-12 text-center italic text-muted-foreground opacity-50">No active positions.</td></tr>
                      ) : openTrades.map((t) => {
                        const priceData = livePrices[t.symbol];
                        let pnl = 0;
                        if (priceData) {
                           const cp = t.type === 'buy' ? priceData.bid : priceData.ask;
                           const contractSize = t.symbol === 'XAUUSD' ? 100 : t.symbol === 'BTCUSD' ? 1 : t.symbol === 'ETHUSD' ? 1 : 100000;
                           pnl = t.type === 'buy' 
                             ? (cp - t.openPrice) * contractSize * t.lots
                             : (t.openPrice - cp) * contractSize * t.lots;
                        }

                        return (
                          <tr key={t.id} className="hover:bg-white/5 group transition-colors">
                            <td className="py-2 px-4 font-bold text-white">{t.symbol}</td>
                            <td className="py-2 px-2">
                              <Badge className={cn(
                                "text-[8px] font-black uppercase h-4",
                                t.type === 'buy' ? "bg-emerald-500/20 text-emerald-500" : "bg-destructive/20 text-destructive"
                              )}>{t.type}</Badge>
                            </td>
                            <td className="py-2 px-2 font-mono text-zinc-300">{t.lots.toFixed(2)}</td>
                            <td className="py-2 px-4 font-mono text-muted-foreground">{formatPrice(t.openPrice, t.symbol)}</td>
                            <td className={cn(
                              "py-2 px-4 text-right font-mono font-bold tabular-nums",
                              pnl >= 0 ? "text-emerald-500" : "text-destructive"
                            )}>
                              {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}
                            </td>
                            <td className="py-2 px-4 text-right">
                              <button 
                                onClick={() => closeTrade(t.id)}
                                className="p-1 hover:bg-destructive/20 text-destructive/50 hover:text-destructive transition-colors rounded-lg"
                              >
                                <XCircle className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
               </div>
            </div>
          </div>

          <aside className="w-80 border-l border-border bg-card/20 p-6 flex flex-col gap-8 shrink-0 overflow-y-auto custom-scrollbar">
             <div className="space-y-4">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Active Demo Account</Label>
                <Select value={currentAccountId ?? ""} onValueChange={setCurrentAccountId}>
                  <SelectTrigger className="bg-background border-border h-12">
                    <SelectValue placeholder="Select account" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.label} (${a.balance.toLocaleString()})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
             </div>

             {currentAccount && (
               <div className="p-5 rounded-2xl bg-background/50 border border-border space-y-4">
                  <div className="flex justify-between items-start">
                     <div>
                        <p className="text-[9px] font-black uppercase text-muted-foreground tracking-widest mb-1">Status</p>
                        <Badge className={cn(
                          "text-[9px] font-black uppercase h-5",
                          currentAccount.status === 'active' ? "bg-emerald-500" : "bg-destructive text-white"
                        )}>{currentAccount.status}</Badge>
                     </div>
                     <div className="text-right">
                        <p className="text-[9px] font-black uppercase text-muted-foreground tracking-widest mb-1">Equity</p>
                        <p className="font-bold text-lg text-white font-headline">${metrics.equity.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                     </div>
                  </div>
               </div>
             )}

             <div className="space-y-6">
                <div className="flex items-center justify-between p-4 bg-background/50 rounded-xl border border-border">
                   <div className="text-center flex-1">
                      <p className="text-[8px] font-black uppercase text-muted-foreground mb-1">BID</p>
                      <p className="font-mono text-sm font-bold text-emerald-500 tabular-nums">
                        {formatPrice(currentPriceData?.bid, selectedSymbol)}
                      </p>
                   </div>
                   <div className="h-8 w-px bg-border mx-2" />
                   <div className="text-center flex-1">
                      <p className="text-[8px] font-black uppercase text-muted-foreground mb-1">ASK</p>
                      <p className="font-mono text-sm font-bold text-destructive tabular-nums">
                        {formatPrice(currentPriceData?.ask, selectedSymbol)}
                      </p>
                   </div>
                </div>

                <div className="space-y-4">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Order Lots</Label>
                  <Input 
                    type="number" 
                    step="0.01" 
                    min="0.01"
                    value={lots} 
                    onChange={(e) => setLots(parseFloat(e.target.value) || 0)}
                    className="h-12 bg-background border-border text-center font-bold text-lg text-white"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <Button 
                      className="h-14 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm transition-all hover:scale-[1.02]"
                      onClick={() => placeTrade("buy")}
                      disabled={actionLoading || !currentAccount || currentAccount.status !== 'active' || !currentPriceData}
                    >
                      BUY
                    </Button>
                    <Button 
                      variant="destructive" 
                      className="h-14 font-black text-sm transition-all hover:scale-[1.02]"
                      onClick={() => placeTrade("sell")}
                      disabled={actionLoading || !currentAccount || currentAccount.status !== 'active' || !currentPriceData}
                    >
                      SELL
                    </Button>
                  </div>
                </div>
             </div>

             <div className="mt-auto p-4 rounded-xl bg-primary/5 border border-primary/10">
                <div className="flex items-center gap-2 mb-2">
                   <Terminal className="w-3 h-3 text-primary" />
                   <span className="text-[9px] font-black uppercase text-primary tracking-widest">Self-Hosted Chart Node</span>
                </div>
                <p className="text-[10px] text-muted-foreground leading-relaxed italic">
                  Advanced technical charting engine with high-frequency price aggregation.
                </p>
             </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
