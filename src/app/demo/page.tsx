
'use client';

import { useEffect, useRef, useState, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { useFirestore, useCollection } from "@/firebase";
import { createChart, CrosshairMode, IChartApi, ISeriesApi } from "lightweight-charts";
import { Navigation } from "@/components/Navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { 
  Activity, 
  Wallet, 
  History, 
  Plus, 
  XCircle, 
  Terminal,
  Clock,
  Loader2
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { where } from "firebase/firestore";
import { useLivePrices } from "@/hooks/useLivePrice";

const SYMBOLS = ["XAUUSD", "BTCUSD", "EURUSD", "GBPUSD", "USDJPY"];
const INTERVALS = [
  { label: "1m", value: "1m", seconds: 60 },
  { label: "5m", value: "5m", seconds: 300 },
  { label: "15m", value: "15m", seconds: 900 },
  { label: "1h", value: "1h", seconds: 3600 },
  { label: "4h", value: "4h", seconds: 14400 },
  { label: "1D", value: "1d", seconds: 86400 },
];

export default function DemoPage() {
  const { user } = useAuth();
  const db = useFirestore();
  const { toast } = useToast();

  const [currentAccountId, setCurrentAccountId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [symbol, setSymbol] = useState("EURUSD");
  const [interval, setInterval] = useState("1m");
  const [lots, setLots] = useState(0.10);

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  // 1. Live Price Hook
  const prices = useLivePrices(SYMBOLS);

  // 2. Accounts & Trades Listeners
  const accountConstraints = useMemo(() => {
    if (!user?.uid) return [];
    return [where("userId", "==", user.uid)];
  }, [user?.uid]);

  const { data: accounts, loading: accountsLoading } = useCollection<any>(
    user?.uid ? "demoAccounts" : null,
    accountConstraints
  );

  useEffect(() => {
    if (accounts.length > 0 && !currentAccountId) {
      setCurrentAccountId(accounts[0].id);
    }
  }, [accounts, currentAccountId]);

  const tradeConstraints = useMemo(() => {
    if (!user?.uid || !currentAccountId) return [];
    return [
      where("userId", "==", user.uid),
      where("accountId", "==", currentAccountId),
      where("status", "==", "open")
    ];
  }, [user?.uid, currentAccountId]);

  const { data: openTrades } = useCollection<any>(
    (user?.uid && currentAccountId) ? "demoTrades" : null,
    tradeConstraints
  );

  // 3. Chart Initialization
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const handleResize = () => {
      if (chartRef.current && chartContainerRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };

    chartRef.current = createChart(chartContainerRef.current, {
      layout: {
        background: { color: "#0f1117" },
        textColor: "#94a3b8",
      },
      grid: {
        vertLines: { color: "#1f2937" },
        horzLines: { color: "#1f2937" },
      },
      crosshair: { mode: CrosshairMode.Normal },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
      timeScale: {
        timeVisible: true,
        secondsVisible: true,
      },
    });

    seriesRef.current = chartRef.current.addCandlestickSeries({
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, []);

  // 4. Fetch Historical Data
  useEffect(() => {
    async function fetchHistory() {
      if (!seriesRef.current || !chartRef.current) return;
      
      try {
        const url = `/api/terminal/candles?symbol=${symbol}&interval=${interval}`;
        const res = await fetch(url);
        
        if (!res.ok) return;
        const data = await res.json();
        
        if (Array.isArray(data) && data.length > 0) {
          seriesRef.current.setData(data);
          chartRef.current.timeScale().fitContent();
        }
      } catch (e) {}
    }
    fetchHistory();
  }, [symbol, interval]);

  // 5. Update Chart with Tick-by-Tick Live Ticks
  useEffect(() => {
    const p = prices[symbol];
    if (!p || !seriesRef.current) return;
    
    const selectedInterval = INTERVALS.find(i => i.value === interval);
    const step = selectedInterval?.seconds || 60;
    const snappedTime = Math.floor(Date.now() / 1000 / step) * step;

    try {
      seriesRef.current.update({
        time: snappedTime as any,
        open: p.price,
        high: p.price,
        low: p.price,
        close: p.price,
      });
    } catch (e) {}
  }, [prices[symbol]?.price, symbol, interval]);

  const currentAccount = useMemo(() => accounts.find((a) => a.id === currentAccountId), [accounts, currentAccountId]);
  
  const metrics = useMemo(() => {
    if (!currentAccount) return { equity: 0, floatingPnL: 0 };
    let floating = 0;
    openTrades.forEach(trade => {
      const price = prices[trade.symbol];
      if (price) {
        const cp = trade.type === 'buy' ? price.bid : price.ask;
        const contractSize = trade.symbol === 'XAUUSD' ? 100 : trade.symbol === 'BTCUSD' ? 1 : 100000;
        floating += trade.type === 'buy' 
          ? (cp - trade.openPrice) * contractSize * trade.lots
          : (trade.openPrice - cp) * contractSize * trade.lots;
      }
    });
    return { 
      equity: currentAccount.balance + floating, 
      floatingPnL: floating 
    };
  }, [currentAccount, openTrades, prices]);

  async function placeTrade(type: "buy" | "sell") {
    if (!user || !currentAccountId) return;
    setActionLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/terminal/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ accountId: currentAccountId, symbol, type, lots }),
      });
      if (!res.ok) throw new Error("Trade failed");
      toast({ title: "Order Executed", description: `${type.toUpperCase()} ${lots} ${symbol}` });
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
      toast({ variant: "destructive", title: "Closure Error" });
    }
  }

  const currentPrice = prices[symbol];

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Navigation />
      
      <main className="flex-1 flex flex-col min-w-0">
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
                    {p?.price?.toFixed(5) ?? "—"}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1 bg-secondary/30 p-1 rounded-lg border border-border">
            {INTERVALS.map((i) => (
              <button
                key={i.value}
                onClick={() => setInterval(i.value)}
                className={cn(
                  "px-2 py-1 rounded text-[10px] font-black uppercase transition-all",
                  interval === i.value ? "bg-primary text-black" : "text-muted-foreground hover:text-white"
                )}
              >
                {i.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 flex min-h-0">
          <div className="flex-1 flex flex-col min-w-0">
            <div ref={chartContainerRef} className="flex-1 bg-background relative" />
            
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
                        const price = prices[t.symbol];
                        let pnl = 0;
                        if (price) {
                           const cp = t.type === 'buy' ? price.bid : price.ask;
                           const contractSize = t.symbol === 'XAUUSD' ? 100 : t.symbol === 'BTCUSD' ? 1 : 100000;
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
                            <td className="py-2 px-4 font-mono text-muted-foreground">{t.openPrice.toFixed(5)}</td>
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
                      <p className="font-mono text-sm font-bold text-emerald-500 tabular-nums">{currentPrice?.bid?.toFixed(5) ?? "—"}</p>
                   </div>
                   <div className="h-8 w-px bg-border mx-2" />
                   <div className="text-center flex-1">
                      <p className="text-[8px] font-black uppercase text-muted-foreground mb-1">ASK</p>
                      <p className="font-mono text-sm font-bold text-destructive tabular-nums">{currentPrice?.ask?.toFixed(5) ?? "—"}</p>
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
                      disabled={actionLoading || !currentAccount || currentAccount.status !== 'active'}
                    >
                      BUY
                    </Button>
                    <Button 
                      variant="destructive" 
                      className="h-14 font-black text-sm transition-all hover:scale-[1.02] cursor-pointer"
                      onClick={() => placeTrade("sell")}
                      disabled={actionLoading || !currentAccount || currentAccount.status !== 'active'}
                    >
                      SELL
                    </Button>
                  </div>
                </div>
             </div>

             <div className="mt-auto p-4 rounded-xl bg-primary/5 border border-primary/10">
                <div className="flex items-center gap-2 mb-2">
                   <Terminal className="w-3 h-3 text-primary" />
                   <span className="text-[9px] font-black uppercase text-primary tracking-widest">Feed: Real-time Bridge</span>
                </div>
                <p className="text-[10px] text-muted-foreground leading-relaxed italic">
                  Live tick updates via Binance/Twelve Data bridge. 
                </p>
             </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
