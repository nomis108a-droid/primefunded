
'use client';

import { useEffect, useState, useMemo, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { useFirestore, useCollection } from "@/firebase";
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
  XCircle, 
  Terminal,
  Loader2
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { where } from "firebase/firestore";

const SYMBOLS = ["XAUUSD", "BTCUSD", "EURUSD", "GBPUSD", "USDJPY"];
const TV_SYMBOL_MAP: Record<string, string> = {
  "XAUUSD": "OANDA:XAUUSD",
  "BTCUSD": "BINANCE:BTCUSDT",
  "EURUSD": "OANDA:EURUSD",
  "GBPUSD": "OANDA:GBPUSD",
  "USDJPY": "OANDA:USDJPY"
};

const YAHOO_MAP: Record<string, string> = {
  "XAUUSD": "GC=F",
  "BTCUSD": "BTC-USD",
  "EURUSD": "EURUSD=X",
  "GBPUSD": "GBPUSD=X",
  "USDJPY": "JPY=X"
};

export default function DemoPage() {
  const { user } = useAuth();
  const db = useFirestore();
  const { toast } = useToast();

  const [currentAccountId, setCurrentAccountId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [isChartLoading, setIsChartLoading] = useState(true);
  const [symbol, setSymbol] = useState("XAUUSD");
  const [lots, setLots] = useState(0.10);

  // Yahoo Finance Live Price State
  const [prices, setPrices] = useState<Record<string, any>>({});

  useEffect(() => {
    const fetchYahooPrices = async () => {
      const updated: Record<string, any> = {};
      
      await Promise.all(Object.entries(YAHOO_MAP).map(async ([pfSym, yahooSym]) => {
        try {
          const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${yahooSym}?interval=1m&range=1d`);
          const data = await res.json();
          const result = data.chart.result?.[0];
          
          if (result && result.meta) {
            const price = result.meta.regularMarketPrice;
            const spread = 0.0002; // 0.02% institutional spread
            updated[pfSym] = {
              symbol: pfSym,
              price,
              bid: price - (price * spread),
              ask: price + (price * spread),
              updatedAt: new Date()
            };
          }
        } catch (e) {
          console.warn(`[Yahoo-Feed] Failed for ${pfSym}:`, e);
        }
      }));

      if (Object.keys(updated).length > 0) {
        setPrices(prev => ({ ...prev, ...updated }));
      }
    };

    fetchYahooPrices();
    const interval = setInterval(fetchYahooPrices, 5000);
    return () => clearInterval(interval);
  }, []);

  // Accounts Listener
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

  // Open Trades Listener
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

  // TradingView Widget Initialization
  useEffect(() => {
    const scriptId = "tradingview-widget-script";
    let script = document.getElementById(scriptId) as HTMLScriptElement;

    const initWidget = () => {
      if (typeof window !== "undefined" && (window as any).TradingView) {
        setIsChartLoading(true);
        
        // Safety fallback to hide loader if callback never fires
        const fallbackTimeout = setTimeout(() => setIsChartLoading(false), 5000);

        new (window as any).TradingView.widget({
          container_id: "tv_chart_container",
          symbol: TV_SYMBOL_MAP[symbol] || `OANDA:${symbol}`,
          interval: "1",
          theme: "dark",
          style: "1",
          locale: "en",
          toolbar_bg: "#0f1117",
          enable_publishing: false,
          hide_side_toolbar: false,
          allow_symbol_change: false,
          details: true,
          hotlist: true,
          calendar: true,
          height: "100%",
          width: "100%",
          autosize: true,
          onChartReady: () => {
            setIsChartLoading(false);
            clearTimeout(fallbackTimeout);
          }
        });
      }
    };

    if (!script) {
      script = document.createElement("script");
      script.id = scriptId;
      script.src = "https://s3.tradingview.com/tv.js";
      script.async = true;
      script.onload = initWidget;
      document.body.appendChild(script);
    } else {
      initWidget();
    }
  }, [symbol]);

  const currentAccount = useMemo(() => accounts.find((a) => a.id === currentAccountId), [accounts, currentAccountId]);
  
  const currentPrice = prices[symbol];

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
      equity: (currentAccount.balance || 0) + floating, 
      floatingPnL: floating 
    };
  }, [currentAccount, openTrades, prices]);

  async function placeTrade(type: "buy" | "sell") {
    if (!user || !currentAccountId || !currentPrice) return;
    setActionLoading(true);
    
    try {
      const token = await user.getIdToken();
      const executionPrice = type === 'buy' ? currentPrice.ask : currentPrice.bid;
      
      const res = await fetch("/api/terminal/trades", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json", 
          "Authorization": `Bearer ${token}` 
        },
        body: JSON.stringify({ 
          accountId: currentAccountId, 
          symbol, 
          type, 
          lots,
          price: executionPrice // Pass Yahoo price directly to API
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.details || "Execution rejected by terminal.");
      }

      const data = await res.json();
      toast({ title: "Order Executed", description: `${type.toUpperCase()} ${lots} ${symbol} @ ${data.openPrice.toFixed(5)}` });
      
    } catch (err: any) {
      console.error("[Execution-Error]", err);
      toast({ 
        variant: "destructive", 
        title: "Execution Error", 
        description: err.message 
      });
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
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Closure failed");
      }

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
                    {p?.price ? p.price.toFixed(5) : "—"}
                  </span>
                </button>
              );
            })}
          </div>

          <Badge variant="outline" className="text-[10px] font-black uppercase tracking-widest border-primary/20 text-primary">
            Yahoo Finance REST Feed
          </Badge>
        </div>

        <div className="flex-1 flex min-h-0">
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex-1 relative bg-background">
              {isChartLoading && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
                  <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground animate-pulse">Initializing Terminal...</p>
                </div>
              )}
              <div id="tv_chart_container" className="h-full w-full" style={{ height: '100%', width: '100%' }} />
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
                      <p className="font-mono text-sm font-bold text-emerald-500 tabular-nums">
                        {currentPrice && currentPrice.bid > 0 ? currentPrice.bid.toFixed(5) : "—"}
                      </p>
                   </div>
                   <div className="h-8 w-px bg-border mx-2" />
                   <div className="text-center flex-1">
                      <p className="text-[8px] font-black uppercase text-muted-foreground mb-1">ASK</p>
                      <p className="font-mono text-sm font-bold text-destructive tabular-nums">
                        {currentPrice && currentPrice.ask > 0 ? currentPrice.ask.toFixed(5) : "—"}
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
                      disabled={actionLoading || !currentAccount || currentAccount.status !== 'active' || !currentPrice}
                    >
                      BUY
                    </Button>
                    <Button 
                      variant="destructive" 
                      className="h-14 font-black text-sm transition-all hover:scale-[1.02] cursor-pointer"
                      onClick={() => placeTrade("sell")}
                      disabled={actionLoading || !currentAccount || currentAccount.status !== 'active' || !currentPrice}
                    >
                      SELL
                    </Button>
                  </div>
                </div>
             </div>

             <div className="mt-auto p-4 rounded-xl bg-primary/5 border border-primary/10">
                <div className="flex items-center gap-2 mb-2">
                   <Terminal className="w-3 h-3 text-primary" />
                   <span className="text-[9px] font-black uppercase text-primary tracking-widest">Feed: Yahoo Finance</span>
                </div>
                <p className="text-[10px] text-muted-foreground leading-relaxed italic">
                  Institutional BID/ASK synchronized via global Yahoo REST endpoint.
                </p>
             </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
