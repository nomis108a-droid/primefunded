'use client';

import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { XCircle, Check, X, Loader2, Bell, Trash2, Clock, ChevronDown, ChevronUp, Maximize2, Minimize2, ArrowUpRight, ArrowDownRight, Activity, Hourglass } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, differenceInSeconds } from 'date-fns';
import { getTradeDate, formatDuration, calculateHoldingTimeSeconds } from '@/lib/tradeUtils';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { CONTRACT_SIZE } from "@/lib/rulesConfig";

interface PositionsPanelProps {
  openTrades: any[];
  closedTrades: any[];
  alerts: any[];
  livePrices: Record<string, any>;
  closeTrade: (id: string) => Promise<void>;
  deleteAlert: (id: string) => Promise<void>;
  user: any;
  alertsLoading: boolean;
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  defaultTab?: string;
}

export function PositionsPanel({ 
  openTrades, 
  closedTrades, 
  alerts, 
  livePrices, 
  closeTrade, 
  deleteAlert, 
  user,
  alertsLoading,
  panelOpen,
  setPanelOpen,
  defaultTab = "positions"
}: PositionsPanelProps) {
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [isExpanded, setIsExpanded] = useState(false);
  const isMobile = useIsMobile();

  const getPrecision = (s: string) => (s.includes("JPY") ? 3 : (['XAUUSD', 'BTCUSD', 'ETHUSD', 'SOLUSD', 'BNBUSD'].includes(s.toUpperCase()) ? 3 : 5));
  const formatPrice = (price: number | undefined, symbol: string) => price ? price.toFixed(getPrecision(symbol)) : '—';

  return (
    <div className={cn(
      "border-t border-zinc-800 bg-zinc-950 flex flex-col shrink-0 relative transition-all duration-300 ease-in-out z-40",
      isMobile ? "flex-1 h-full border-none" : !panelOpen ? "h-9" : isExpanded ? "h-[60vh]" : "h-[220px]"
    )}>
      {!isMobile && (
        <div className="px-3 h-9 flex justify-between items-center bg-zinc-950 shrink-0 border-b border-zinc-800/50">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex-1">
            <TabsList className="bg-transparent h-full p-0 gap-5">
              <TabsTrigger value="positions" className="bg-transparent border-none h-full text-[10px] font-black uppercase tracking-widest text-zinc-500 data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none shadow-none px-0">
                Open Positions ({openTrades.length})
              </TabsTrigger>
              <TabsTrigger value="history" className="bg-transparent border-none h-full text-[10px] font-black uppercase tracking-widest text-zinc-500 data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none shadow-none px-0">
                History
              </TabsTrigger>
              <TabsTrigger value="alerts" className="bg-transparent border-none h-full text-[10px] font-black uppercase tracking-widest text-zinc-500 data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none shadow-none px-0">
                Alerts ({alerts.length})
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex items-center gap-1">
            <button onClick={() => setIsExpanded(!isExpanded)} className="p-1 hover:bg-white/5 rounded text-zinc-500 transition-colors">{isExpanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}</button>
            <button onClick={() => setPanelOpen(!panelOpen)} className="p-1 hover:bg-white/5 rounded text-zinc-500 transition-colors">{panelOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}</button>
          </div>
        </div>
      )}

      {isMobile && (
        <div className="p-6 pb-0 flex justify-between items-center">
           <h2 className="text-2xl font-black font-headline tracking-tighter uppercase italic text-white">{activeTab === 'positions' ? 'Active Positions' : 'Trade Ledger'}</h2>
           <Badge variant="outline" className="text-[10px] font-black uppercase border-primary/20 text-primary">{activeTab === 'positions' ? openTrades.length : closedTrades.length} Nodes</Badge>
        </div>
      )}

      <div className={cn("flex-1 overflow-y-auto custom-scrollbar transition-opacity duration-300", (panelOpen || isMobile) ? "opacity-100" : "opacity-0 pointer-events-none")}>
        {!isMobile ? (
          <Tabs value={activeTab} className="w-full h-full">
            <TabsContent value="positions" className="m-0 border-none outline-none">
              <table className="w-full text-[10px] text-left">
                <thead className="sticky top-0 bg-zinc-950 text-zinc-500 uppercase font-black tracking-widest border-b border-zinc-900">
                  <tr>
                    <th className="py-2 px-3">Symbol</th>
                    <th className="py-2 px-2">Type</th>
                    <th className="py-2 px-2">Lots</th>
                    <th className="py-2 px-2">Entry</th>
                    <th className="py-2 px-2">S/L</th>
                    <th className="py-2 px-2">T/P</th>
                    <th className="py-2 px-2">Current Price</th>
                    <th className="py-2 px-2 text-right">PnL (USD)</th>
                    <th className="py-2 px-2 text-right">PnL (%)</th>
                    <th className="py-2 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-900">
                  {openTrades.length === 0 ? (
                    <tr><td colSpan={10} className="py-12 text-center italic text-zinc-600 font-bold uppercase tracking-widest text-[9px]">No open positions in terminal.</td></tr>
                  ) : openTrades.map((t) => {
                    const symbolUpper = t.symbol.toUpperCase();
                    const pData = livePrices[symbolUpper];
                    let pnl = 0;
                    let pct = 0;
                    const currentPrice = pData ? (t.type === 'buy' ? pData.bid : pData.ask) : t.openPrice;
                    
                    if (pData) {
                      const contractSize = CONTRACT_SIZE[symbolUpper] || 100000;
                      pnl = t.type === 'buy' ? (currentPrice - t.openPrice) * contractSize * t.lots : (t.openPrice - currentPrice) * contractSize * t.lots;
                      pct = ((currentPrice - t.openPrice) / t.openPrice) * 100 * (t.type === 'buy' ? 1 : -1);
                    }
                    
                    return (
                      <tr key={t.id} className="hover:bg-white/[0.02] group transition-colors">
                        <td className="py-1.5 px-3 font-bold text-white tracking-wide">{t.symbol}</td>
                        <td className="py-1.5 px-2">
                          <span className={cn(
                            "font-black uppercase px-1.5 py-0.5 rounded-[2px] text-[8px]", 
                            t.type === 'buy' ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
                          )}>
                            {t.type}
                          </span>
                        </td>
                        <td className="py-1.5 px-2 font-mono text-zinc-400">{t.lots.toFixed(2)}</td>
                        <td className="py-1.5 px-2 font-mono text-zinc-400">{formatPrice(t.openPrice, t.symbol)}</td>
                        <td className="py-1.5 px-2 font-mono text-zinc-500">{t.sl ? formatPrice(t.sl, t.symbol) : '—'}</td>
                        <td className="py-1.5 px-2 font-mono text-zinc-500">{t.tp ? formatPrice(t.tp, t.symbol) : '—'}</td>
                        <td className="py-1.5 px-2 font-mono text-primary">{formatPrice(currentPrice, t.symbol)}</td>
                        <td className={cn("py-1.5 px-2 text-right font-mono font-bold", pnl >= 0 ? "text-emerald-500" : "text-red-500")}>
                          {pnl >= 0 ? '+' : ''}{pnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className={cn("py-1.5 px-2 text-right font-mono font-bold", pct >= 0 ? "text-emerald-500" : "text-red-500")}>
                          {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
                        </td>
                        <td className="py-1.5 px-3 text-right">
                          <button onClick={() => closeTrade(t.id)} className="p-1 hover:bg-red-500/20 text-red-500/40 hover:text-red-500 transition-all rounded">
                            <XCircle size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TabsContent>
            <TabsContent value="history" className="m-0 border-none outline-none">
               <table className="w-full text-[10px] text-left">
                <thead className="sticky top-0 bg-zinc-950 text-zinc-500 uppercase font-black tracking-widest border-b border-zinc-900">
                  <tr><th className="py-2 px-3">Symbol</th><th className="py-2 px-2">Type</th><th className="py-2 px-2">Lots</th><th className="py-2 px-2">Open</th><th className="py-2 px-2">Close</th><th className="py-2 px-2">Dur.</th><th className="py-2 px-2 text-right">PnL</th><th className="py-2 px-3 text-right">Time</th></tr>
                </thead>
                <tbody className="divide-y divide-zinc-900">
                  {closedTrades.map((t) => {
                    const cDate = getTradeDate(t.closedAt);
                    const durationSec = calculateHoldingTimeSeconds(t.openedAt, t.closedAt);
                    const durationStr = formatDuration(durationSec);
                    return (
                      <tr key={t.id} className="hover:bg-white/[0.02] group transition-colors">
                        <td className="py-1.5 px-3 font-bold text-white">{t.symbol}</td>
                        <td className="py-1.5 px-2 uppercase font-bold text-zinc-400">{t.type}</td>
                        <td className="py-1.5 px-2 font-mono">{t.lots}</td>
                        <td className="py-1.5 px-2 font-mono text-zinc-500">{formatPrice(t.openPrice, t.symbol)}</td>
                        <td className="py-1.5 px-2 font-mono text-zinc-500">{formatPrice(t.closePrice, t.symbol)}</td>
                        <td className="py-1.5 px-2 font-mono text-zinc-500">{durationStr}</td>
                        <td className={cn("py-1.5 px-2 text-right font-mono font-bold", (t.pnl || 0) >= 0 ? "text-emerald-500" : "text-red-500")}>{(t.pnl || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className="py-1.5 px-3 text-right text-zinc-600">{cDate ? format(cDate, 'MMM d, HH:mm') : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
               </table>
            </TabsContent>
          </Tabs>
        ) : (
          <div className="p-4 space-y-4">
            {activeTab === 'positions' ? (
              openTrades.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-zinc-600 space-y-4"><Activity className="w-12 h-12 opacity-20" /><p className="text-xs font-black uppercase tracking-widest">No active positions</p></div>
              ) : openTrades.map(t => {
                const symbolUpper = t.symbol.toUpperCase();
                const pData = livePrices[symbolUpper];
                let pnl = 0;
                let pct = 0;
                const currentPrice = pData ? (t.type === 'buy' ? pData.bid : pData.ask) : t.openPrice;

                if (pData) {
                  const contractSize = CONTRACT_SIZE[symbolUpper] || 100000;
                  pnl = t.type === 'buy' ? (currentPrice - t.openPrice) * contractSize * t.lots : (t.openPrice - currentPrice) * contractSize * t.lots;
                  pct = ((currentPrice - t.openPrice) / t.openPrice) * 100 * (t.type === 'buy' ? 1 : -1);
                }
                return (
                  <div key={t.id} className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-5 space-y-4 relative overflow-hidden group">
                    <div className={cn("absolute top-0 left-0 w-1 h-full", t.type === 'buy' ? "bg-emerald-500" : "bg-red-500")} />
                    <div className="flex justify-between items-start">
                      <div><h4 className="text-lg font-black text-white italic tracking-tighter uppercase">{t.symbol}</h4><div className="flex items-center gap-2 mt-0.5"><span className={cn("text-[9px] font-black uppercase px-1.5 py-0.5 rounded", t.type === 'buy' ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500")}>{t.type} {t.lots.toFixed(2)}</span><span className="text-[9px] font-mono text-zinc-500">#{t.id?.slice(0, 8)}</span></div></div>
                      <div className="text-right">
                        <p className={cn("text-xl font-bold font-mono tabular-nums leading-none", pnl >= 0 ? "text-emerald-500" : "text-red-500")}>
                          {pnl >= 0 ? '+' : ''}{pnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                        <p className={cn("text-[9px] font-black uppercase mt-1.5", pct >= 0 ? "text-emerald-500" : "text-red-500")}>
                          {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 border-y border-white/5 py-3"><div><p className="text-[8px] font-black uppercase text-zinc-500 mb-0.5">Entry Price</p><p className="text-xs font-bold font-mono text-white">{formatPrice(t.openPrice, t.symbol)}</p></div><div className="text-right"><p className="text-[8px] font-black uppercase text-zinc-500 mb-0.5">Current</p><p className="text-xs font-bold font-mono text-primary">{formatPrice(currentPrice, t.symbol)}</p></div></div>
                    <div className="flex gap-3"><Button variant="outline" size="sm" className="flex-1 h-11 border-zinc-800 font-bold text-xs rounded-xl" onClick={() => closeTrade(t.id)}><X size={14} className="mr-2" /> Partial Exit</Button><Button size="sm" className="flex-1 h-11 bg-red-600 hover:bg-red-700 text-white font-black text-xs rounded-xl" onClick={() => closeTrade(t.id)}>CLOSE POSITION</Button></div>
                  </div>
                );
              })
            ) : (
              closedTrades.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-zinc-600 space-y-4"><Clock className="w-12 h-12 opacity-20" /><p className="text-xs font-black uppercase tracking-widest">No historical logs</p></div>
              ) : closedTrades.map(t => {
                const durationSec = calculateHoldingTimeSeconds(t.openedAt, t.closedAt);
                const durationStr = formatDuration(durationSec);
                return (
                  <div key={t.id} className="bg-zinc-900/30 border border-zinc-800/50 rounded-2xl p-4 flex justify-between items-center group">
                    <div className="flex items-center gap-4"><div className={cn("w-10 h-10 rounded-xl flex items-center justify-center border", (t.pnl || 0) >= 0 ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500" : "bg-red-500/10 border-red-500/20 text-red-500")}>{(t.pnl || 0) >= 0 ? <ArrowUpRight size={20} /> : <ArrowDownRight size={20} />}</div><div><h4 className="font-bold text-white text-sm">{t.symbol} <span className="text-[10px] text-zinc-500 font-normal uppercase ml-1">{t.type}</span></h4><div className="flex items-center gap-2 mt-0.5"><p className="text-[10px] text-zinc-500">{t.closedAt ? format(getTradeDate(t.closedAt)!, 'MMM d, HH:mm') : 'Recently'}</p><Badge variant="outline" className="h-4 px-1.5 text-[8px] border-zinc-800 text-zinc-400 flex items-center gap-1"><Hourglass className="w-2 h-2" /> {durationStr}</Badge></div></div></div>
                    <div className="text-right"><p className={cn("font-bold font-mono text-sm", (t.pnl || 0) >= 0 ? "text-emerald-500" : "text-red-500")}>{(t.pnl || 0) >= 0 ? '+' : ''}{(t.pnl || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p><p className="text-[9px] font-black uppercase text-zinc-500 tracking-tighter mt-0.5">{t.lots} Lots</p></div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}