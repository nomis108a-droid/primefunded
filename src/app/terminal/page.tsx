
"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { collection, onSnapshot, query, where, orderBy } from "firebase/firestore";
import { useAuth } from "@/context/AuthContext";
import { useFirestore, useCollection } from "@/firebase";
import { createChart, CrosshairMode, IChartApi, ISeriesApi } from "lightweight-charts";
import { Navigation } from "@/components/Navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Activity, Wallet, History, Plus, XCircle, TrendingUp, TrendingDown, Clock, Loader2, Terminal } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const SYMBOLS = ["XAUUSD", "BTCUSD", "EURUSD", "GBPUSD", "USDJPY"];

export default function TerminalPage() {
  const { user } = useAuth();
  const db = useFirestore();
  const { toast } = useToast();

  const [currentAccountId, setCurrentAccountId] = useState<string | null>(null);
  const [prices, setPrices] = useState<Record<string, any>>({});
  const [actionLoading, setActionLoading] = useState(false);

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  // 1. Price Feed Listener (Public)
  useEffect(() => {
    if (!db) return;
    const unsub = onSnapshot(collection(db, "livePrices"), (snap) => {
      const next: Record<string, any> = {};
      snap.docs.forEach((d) => (next[d.id] = d.data()));
      setPrices(next);
    });
    return unsub;
  }, [db]);

  // 2. Accounts Listener (Memoized with mandatory userId filter)
  const accountConstraints = useMemo(() => {
    if (!user?.uid) return [];
    return [where("userId", "==", user.uid)];
  }, [user?.uid]);

  const { data: accounts } = useCollection<any>(
    user?.uid ? "demoAccounts" : null,
    accountConstraints
  );

  useEffect(() => {
    if (accounts.length > 0 && !currentAccountId) {
      setCurrentAccountId(accounts[0].id);
    }
  }, [accounts, currentAccountId]);

  // 3. Open Trades Listener (Memoized with strict userId and accountId filters)
  const tradeConstraints = useMemo(() => {
    if (!user?.uid || !currentAccountId) return [];
    return [
      where("userId", "==", user.uid),
      where("accountId", "==", currentAccountId),
      where("status", "==", "open"),
      orderBy("openedAt", "desc")
    ];
  }, [user?.uid, currentAccountId]);

  const { data: openTrades } = useCollection<any>(
    (user?.uid && currentAccountId) ? "demoTrades" : null,
    tradeConstraints
  );

  // 4. Chart Initialization
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
        background: { color: "#020817" },
        textColor: "#94a3b8",
      },
      grid: {
        vertLines: { color: "#1e293b" },
        horzLines: { color: "#1e293b" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
      timeScale: {
        timeVisible: true,
        secondsVisible: true,
      },
    });

    seriesRef.current = chartRef.current.addCandlestickSeries({
      upColor: "#10b981",
      downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#10b981",
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

  const [symbol, setSymbol] = useState("EURUSD");
  const [lots, setLots] = useState(0.10);

  // 5. Update Chart with Live Ticks
  useEffect(() => {
    const p = prices[symbol];
    if (!p || !seriesRef.current) return;
    
    const now = Math.floor(Date.now() / 1000);
    try {
      seriesRef.current.update({
        time: now as any,
        open: p.price,
        high: p.price,
        low: p.price,
        close: p.price,
      });
    } catch (e) {}
  }, [prices, symbol]);

  async function placeTrade(type: "buy" | "sell") {
    if (!user || !currentAccountId) {
      toast({ variant: "destructive", title: "Error", description: "Select an account to trade." });
      return;
    }
    setActionLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/terminal/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ accountId: currentAccountId, symbol, type, lots }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Trade failed");
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
      if (!res.ok) throw new Error(data.error || "Close failed");
      toast({ title: "Position Closed", description: `Realized P&L: $${data.pnl.toFixed(2)}` });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Closure Error", description: err.message });
    }
  }

  async function createAccount(plan: string) {
    if (!user) return;
    setActionLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/terminal/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Creation failed");
      toast({ title: "Account Provisioned", description: `Demo account ${plan} is live.` });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Creation Failed", description: err.message });
    } finally {
      setActionLoading(false);
    }
  }

  const currentAccount = accounts.find((a) => a.id === currentAccountId);
  const currentPrice = prices[symbol];

  const floatingPnL = useMemo(() => {
    return openTrades.reduce((acc, trade) => {
      const price = prices[trade.symbol];
      if (!price) return acc;
      const cp = trade.type === 'buy' ? price.bid : price.ask;
      const contractSize = trade.symbol === 'XAUUSD' ? 100 : trade.symbol === 'BTCUSD' ? 1 : 100000;
      return acc + (trade.type === 'buy' 
        ? (cp - trade.openPrice) * contractSize * trade.lots
        : (trade.openPrice - cp) * contractSize * trade.lots);
    }, 0);
  }, [openTrades, prices]);

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Navigation />
      
      <main className="flex-1 flex flex-col min-w-0">
        <div className="h-14 border-b border-border flex items-center px-4 gap-2 bg-card/30 overflow-x-auto no-scrollbar shrink-0">
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
                    floatingPnL >= 0 ? "text-emerald-500 border-emerald-500/20 bg-emerald-500/5" : "text-destructive border-destructive/20 bg-destructive/5"
                  )}>
                    Floating: {floatingPnL >= 0 ? '+' : ''}${floatingPnL.toLocaleString(undefined, { minimumFractionDigits: 2 })}
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
                    {accounts.length === 0 && (
                      <SelectItem value="_none" disabled>No nodes available</SelectItem>
                    )}
                  </SelectContent>
                </Select>
                <Button 
                  variant="outline" 
                  className="w-full text-[10px] font-black uppercase tracking-widest h-9 border-primary/20 text-primary hover:bg-primary/10 transition-colors"
                  onClick={() => createAccount("10k")}
                  disabled={actionLoading}
                >
                  <Plus className="w-3 h-3 mr-2" /> New $10k Account
                </Button>
             </div>

             {currentAccount && (
               <div className="p-5 rounded-2xl bg-background/50 border border-border space-y-4 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-16 h-16 bg-primary/5 blur-2xl group-hover:bg-primary/10 transition-colors" />
                  <div className="flex justify-between items-start">
                     <div>
                        <p className="text-[9px] font-black uppercase text-muted-foreground tracking-widest mb-1">Status</p>
                        <Badge className={cn(
                          "text-[9px] font-black uppercase h-5",
                          currentAccount.status === 'active' ? "bg-emerald-500" : "bg-destructive text-white"
                        )}>{currentAccount.status}</Badge>
                     </div>
                     <div className="text-right">
                        <p className="text-[9px] font-black uppercase text-muted-foreground tracking-widest mb-1">Virtual Balance</p>
                        <p className="font-bold text-lg text-white font-headline">${currentAccount.balance.toLocaleString()}</p>
                     </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
                     <div>
                        <p className="text-[8px] font-black uppercase text-muted-foreground mb-1">Max Loss</p>
                        <p className="font-bold text-xs text-destructive">${currentAccount.maxLoss.toLocaleString()}</p>
                     </div>
                     <div className="text-right">
                        <p className="text-[8px] font-black uppercase text-muted-foreground mb-1">Profit Target</p>
                        <p className="font-bold text-xs text-primary">${currentAccount.profitTarget.toLocaleString()}</p>
                     </div>
                  </div>
               </div>
             )}

             <div className="space-y-6">
                <div className="flex items-center justify-between p-4 bg-background/50 rounded-xl border border-border">
                   <div className="text-center">
                      <p className="text-[8px] font-black uppercase text-muted-foreground mb-1">BID</p>
                      <p className="font-mono text-sm font-bold text-emerald-500 tabular-nums">{currentPrice?.bid?.toFixed(5) ?? "—"}</p>
                   </div>
                   <div className="h-8 w-px bg-border mx-2" />
                   <div className="text-center">
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
                      className="h-14 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                      onClick={() => placeTrade("buy")}
                      disabled={actionLoading || !currentAccount || currentAccount.status !== 'active'}
                    >
                      BUY
                    </Button>
                    <Button 
                      variant="destructive" 
                      className="h-14 font-black text-sm transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
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
                   <span className="text-[9px] font-black uppercase text-primary tracking-widest">Protocol Active</span>
                </div>
                <p className="text-[10px] text-muted-foreground leading-relaxed italic">
                  Institutional rules are active. Demo nodes follow hard-breach rules: liquidation on max loss or daily drawdown breach.
                </p>
             </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
