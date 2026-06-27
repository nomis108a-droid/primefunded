
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
import { createChart, ColorType, CandlestickSeries, LineSeries, IChartApi, ISeriesApi } from 'lightweight-charts';

const SYMBOLS = ["XAUUSD", "BTCUSD", "ETHUSD", "EURUSD", "GBPUSD", "USDJPY"];
const TIMEFRAMES = [
  { label: '1M', value: '1m' },
  { label: '5M', value: '5m' },
  { label: '15M', value: '15m' },
  { label: '1H', value: '1h' },
  { label: '4H', value: '4h' },
  { label: '1D', value: '1d' },
];

const getPrecision = (s: string, isTab: boolean = false) => {
  if (isTab) return (s === "XAUUSD" || s === "BTCUSD" || s === "ETHUSD") ? 2 : 5;
  if (s === "XAUUSD" || s === "USDJPY") return 3;
  if (s === "BTCUSD" || s === "ETHUSD") return 2;
  return 5;
};

export default function DemoPage() {
  const { user } = useAuth();
  const db = useFirestore();
  const { toast } = useToast();

  const [currentAccountId, setCurrentAccountId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [isChartLoading, setIsChartLoading] = useState(true);
  const [symbol, setSymbol] = useState("XAUUSD");
  const [interval, setInterval] = useState("1m");
  const [lots, setLots] = useState(0.10);
  const [prices, setPrices] = useState<Record<string, any>>({});

  // Chart Refs
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const ma20SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const ma50SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const lastCandleRef = useRef<any>(null);

  // 1. Live Price Polling
  useEffect(() => {
    const fetchLivePrices = async () => {
      try {
        const res = await fetch('/api/terminal/live-prices');
        const data = await res.json();
        if (data && !data.error) setPrices(data);
      } catch (e) {
        console.warn(`[Price-Feed] Polling failed:`, e);
      }
    };
    fetchLivePrices();
    const timer = window.setInterval(fetchLivePrices, 3000);
    return () => window.clearInterval(timer);
  }, []);

  // 2. Fetch History & Initialize Chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Create Chart
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#0a0a0a' },
        textColor: '#e0e0e0',
      },
      grid: {
        vertLines: { color: '#1a1a1a' },
        horzLines: { color: '#1a1a1a' },
      },
      width: chartContainerRef.current.clientWidth,
      height: 500,
      timeScale: {
        borderColor: '#333',
        timeVisible: true,
        secondsVisible: false,
      },
      priceScale: {
        borderColor: '#333',
      }
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });

    const ma20Series = chart.addLineSeries({ color: '#facc15', lineWidth: 1, title: 'MA20' });
    const ma50Series = chart.addLineSeries({ color: '#3b82f6', lineWidth: 1, title: 'MA50' });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    ma20SeriesRef.current = ma20Series;
    ma50SeriesRef.current = ma50Series;

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

  // 3. Load Data on Symbol/Interval change
  useEffect(() => {
    const loadData = async () => {
      if (!candleSeriesRef.current) return;
      setIsChartLoading(true);
      try {
        const res = await fetch(`/api/terminal/candles?symbol=${symbol}&interval=${interval}`);
        const data = await res.json();
        
        if (Array.isArray(data) && data.length > 0) {
          const sorted = data.sort((a, b) => a.time - b.time);
          candleSeriesRef.current.setData(sorted);
          lastCandleRef.current = sorted[sorted.length - 1];

          // Calculate MA20
          const ma20Data = sorted.map((val, index) => {
            if (index < 20) return null;
            const slice = sorted.slice(index - 20, index);
            const sum = slice.reduce((acc, curr) => acc + curr.close, 0);
            return { time: val.time, value: sum / 20 };
          }).filter(v => v !== null);
          ma20SeriesRef.current?.setData(ma20Data as any);

          // Calculate MA50
          const ma50Data = sorted.map((val, index) => {
            if (index < 50) return null;
            const slice = sorted.slice(index - 50, index);
            const sum = slice.reduce((acc, curr) => acc + curr.close, 0);
            return { time: val.time, value: sum / 50 };
          }).filter(v => v !== null);
          ma50SeriesRef.current?.setData(ma50Data as any);

          chartRef.current?.timeScale().fitContent();
        }
      } catch (e) {
        console.error("Failed to load candles:", e);
      } finally {
        setIsChartLoading(false);
      }
    };
    loadData();
  }, [symbol, interval]);

  // 4. Update Current Candle from Live Prices
  useEffect(() => {
    const livePrice = prices[symbol]?.price;
    if (!livePrice || !candleSeriesRef.current || !lastCandleRef.current) return;

    const now = Math.floor(Date.now() / 1000);
    const intervalSeconds = interval.includes('m') ? parseInt(interval) * 60 : interval.includes('h') ? parseInt(interval) * 3600 : 86400;
    const currentBarTime = Math.floor(now / intervalSeconds) * intervalSeconds;

    if (currentBarTime > lastCandleRef.current.time) {
      // New bar
      const newBar = {
        time: currentBarTime,
        open: livePrice,
        high: livePrice,
        low: livePrice,
        close: livePrice
      };
      candleSeriesRef.current.update(newBar);
      lastCandleRef.current = newBar;
    } else {
      // Update existing bar
      const updatedBar = {
        ...lastCandleRef.current,
        high: Math.max(lastCandleRef.current.high, livePrice),
        low: Math.min(lastCandleRef.current.low, livePrice),
        close: livePrice
      };
      candleSeriesRef.current.update(updatedBar);
      lastCandleRef.current = updatedBar;
    }
  }, [prices, symbol, interval]);

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
  const currentPriceData = prices[symbol];

  const metrics = useMemo(() => {
    if (!currentAccount) return { equity: 0, floatingPnL: 0 };
    let floating = 0;
    openTrades.forEach(trade => {
      const priceData = prices[trade.symbol];
      if (priceData) {
        const cp = trade.type === 'buy' ? priceData.bid : priceData.ask;
        const contractSize = trade.symbol === 'XAUUSD' ? 100 : trade.symbol === 'BTCUSD' ? 1 : trade.symbol === 'ETHUSD' ? 1 : 100000;
        floating += trade.type === 'buy' 
          ? (cp - trade.openPrice) * contractSize * trade.lots
          : (trade.openPrice - cp) * contractSize * trade.lots;
      }
    });
    return { equity: (currentAccount.balance || 0) + floating, floatingPnL: floating };
  }, [currentAccount, openTrades, prices]);

  async function placeTrade(type: "buy" | "sell") {
    if (!user || !currentAccountId || !currentPriceData) {
      toast({ variant: "destructive", title: "Execution Blocked", description: "Pricing data unavailable or no account selected." });
      return;
    }
    setActionLoading(true);
    try {
      const token = await user.getIdToken();
      const executionPrice = type === 'buy' ? currentPriceData.ask : currentPriceData.bid;
      const res = await fetch("/api/terminal/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ accountId: currentAccountId, symbol, type, lots, price: executionPrice }),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.details || "Execution rejected.");
      }
      const data = await res.json();
      toast({ title: "Order Executed", description: `${type.toUpperCase()} ${lots} ${symbol} @ ${data.openPrice.toFixed(getPrecision(symbol))}` });
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
        {/* Symbol Bar */}
        <div className="h-14 border-b border-border flex items-center px-4 gap-2 bg-card/30 overflow-x-auto no-scrollbar shrink-0 justify-between">
          <div className="flex items-center gap-2">
            {SYMBOLS.map((s) => {
              const p = prices[s];
              return (
                <button 
                  key={s} 
                  onClick={() => setSymbol(s)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg border transition-all flex items-center gap-3 shrink-0",
                    s === symbol ? "bg-primary/10 border-primary text-primary" : "bg-secondary/50 border-border text-muted-foreground hover:border-muted-foreground/30"
                  )}
                >
                  <span className="font-bold text-xs">{s}</span>
                  <span className="font-mono text-[11px] tabular-nums text-white">
                    {p?.price ? p.price.toFixed(getPrecision(s, true)) : "—"}
                  </span>
                </button>
              );
            })}
          </div>
          <Badge variant="outline" className="text-[10px] font-black uppercase tracking-widest border-primary/20 text-primary">
            FEED: Internal / Binance / Stooq — Real-time Institutional
          </Badge>
        </div>

        <div className="flex-1 flex min-h-0">
          <div className="flex-1 flex flex-col min-w-0">
            {/* Chart Area */}
            <div className="flex-1 relative bg-[#0a0a0a]">
              {/* Timeframe Selector */}
              <div className="absolute top-4 left-4 z-10 flex gap-1 bg-black/60 p-1 rounded-lg border border-white/10 backdrop-blur-md">
                {TIMEFRAMES.map((tf) => (
                  <button
                    key={tf.value}
                    onClick={() => setInterval(tf.value)}
                    className={cn(
                      "px-3 py-1 rounded text-[10px] font-black uppercase transition-all",
                      interval === tf.value ? "bg-primary text-black" : "text-muted-foreground hover:text-white"
                    )}
                  >
                    {tf.label}
                  </button>
                ))}
              </div>

              {isChartLoading && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
                  <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground animate-pulse">Syncing Price Nodes...</p>
                </div>
              )}
              <div ref={chartContainerRef} className="h-full w-full" />
            </div>
            
            {/* Positions Table */}
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
                        const priceData = prices[t.symbol];
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
                            <td className="py-2 px-4 font-mono text-muted-foreground">{t.openPrice.toFixed(getPrecision(t.symbol))}</td>
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
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Active Demo Node</Label>
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
               <div className="p-5 rounded-2xl bg-background/50 border border-border space-y-4 relative overflow-hidden group">
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
                        {currentPriceData && currentPriceData.bid > 0 ? currentPriceData.bid.toFixed(getPrecision(symbol)) : "—"}
                      </p>
                   </div>
                   <div className="h-8 w-px bg-border mx-2" />
                   <div className="text-center flex-1">
                      <p className="text-[8px] font-black uppercase text-muted-foreground mb-1">ASK</p>
                      <p className="font-mono text-sm font-bold text-destructive tabular-nums">
                        {currentPriceData && currentPriceData.ask > 0 ? currentPriceData.ask.toFixed(getPrecision(symbol)) : "—"}
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
                      className="h-14 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm transition-all hover:scale-[1.02] cursor-pointer"
                      onClick={() => placeTrade("buy")}
                      disabled={actionLoading || !currentAccount || currentAccount.status !== 'active' || !currentPriceData}
                    >
                      BUY
                    </Button>
                    <Button 
                      variant="destructive" 
                      className="h-14 font-black text-sm transition-all hover:scale-[1.02] cursor-pointer"
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
                   <span className="text-[9px] font-black uppercase text-primary tracking-widest">FEED: Institutional Charting System — Self-Hosted</span>
                </div>
                <p className="text-[10px] text-muted-foreground leading-relaxed italic">
                  Advanced candlestick charting engine with integrated technical indicators and unlimited session access.
                </p>
             </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
