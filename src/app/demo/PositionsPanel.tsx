'use client';

import { useState, useMemo } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { XCircle, Activity, Hourglass, Clock, ArrowUpRight, ArrowDownRight, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from 'date-fns';
import { getTradeDate, formatDuration, calculateHoldingTimeSeconds } from '@/lib/tradeUtils';
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

  const getPrecision = (s: string) => (s.includes("JPY") ? 3 : (['XAUUSD', 'BTCUSD', 'ETHUSD', 'SOLUSD', 'BNBUSD'].includes(s.toUpperCase()) ? 3 : 5));
  const formatPrice = (price: number | undefined, symbol: string) => price ? price.toFixed(getPrecision(symbol)) : '—';

  return (
    <div className={cn(
      "border-t border-zinc-800 bg-zinc-950 flex flex-col shrink-0 relative transition-all duration-300 ease-in-out z-40",
      !panelOpen ? "h-9" : isExpanded ? "h-[60vh]" : "h-[220px]"
    )}>
      <div className="px-3 h-9 flex justify-between items-center bg-zinc-950 shrink-0 border-b border-zinc-800/50">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex-1">
          <TabsList className="bg-transparent h-full p-0 gap-5">
            <TabsTrigger value="positions" className="bg-transparent border-none h-full text-[10px] font-black uppercase tracking-widest text-zinc-500 data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none shadow-none px-0">
              Open Positions ({openTrades.length})
            </TabsTrigger>
            <TabsTrigger value="history" className="bg-transparent border-none h-full text-[10px] font-black uppercase tracking-widest text-zinc-500 data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none shadow-none px-0">
              History
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-1">
          <button onClick={() => setPanelOpen(!panelOpen)} className="p-1 hover:bg-white/5 rounded text-zinc-500 transition-colors">
            {panelOpen ? <X size={14} /> : <Activity size={14} />}
          </button>
        </div>
      </div>

      <div className={cn("flex-1 overflow-y-auto custom-scrollbar transition-opacity duration-300", panelOpen ? "opacity-100" : "opacity-0 pointer-events-none")}>
        <Tabs value={activeTab} className="w-full h-full">
          <TabsContent value="positions" className="m-0 border-none outline-none">
            <table className="w-full text-[10px] text-left">
              <thead className="sticky top-0 bg-zinc-950 text-zinc-500 uppercase font-black tracking-widest border-b border-zinc-900">
                <tr>
                  <th className="py-2 px-3">Symbol</th>
                  <th className="py-2 px-2">Type</th>
                  <th className="py-2 px-2">Lots</th>
                  <th className="py-2 px-2">Entry</th>
                  <th className="py-2 px-2">Current Price</th>
                  <th className="py-2 px-2 text-right">PnL (USD)</th>
                  <th className="py-2 px-2 text-right">PnL (%)</th>
                  <th className="py-2 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900">
                {openTrades.length === 0 ? (
                  <tr><td colSpan={8} className="py-12 text-center italic text-zinc-600 font-bold uppercase tracking-widest text-[9px]">No open positions in terminal.</td></tr>
                ) : openTrades.map((t) => {
                  const symbolUpper = t.symbol.toUpperCase().trim();
                  const pData = livePrices[symbolUpper];
                  
                  // INSTITUTIONAL PNL LOGIC
                  // Buy position closes at Bid, Sell at Ask
                  const currentPrice = pData ? (t.type === 'buy' ? pData.bid : pData.ask) : null;
                  const contractSize = CONTRACT_SIZE[symbolUpper] || 100000;
                  
                  const pnl = currentPrice 
                    ? (t.type === 'buy' 
                        ? (currentPrice - t.openPrice) * contractSize * t.lots 
                        : (t.openPrice - currentPrice) * contractSize * t.lots)
                    : 0;
                    
                  const pct = currentPrice
                    ? ((currentPrice - t.openPrice) / t.openPrice) * 100 * (t.type === 'buy' ? 1 : -1)
                    : 0;
                  
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
                      <td className={cn("py-1.5 px-2 font-mono font-bold", pData ? "text-primary" : "text-zinc-500")}>
                        {pData ? formatPrice(currentPrice!, t.symbol) : 'SYNC...'}
                      </td>
                      <td className={cn("py-1.5 px-2 text-right font-mono font-bold", pnl >= 0 ? "text-emerald-500" : "text-red-500")}>
                        {pData ? (pnl >= 0 ? '+' : '') + pnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                      </td>
                      <td className={cn("py-1.5 px-2 text-right font-mono font-bold", pct >= 0 ? "text-emerald-500" : "text-red-500")}>
                        {pData ? (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%' : '—'}
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
                  return (
                    <tr key={t.id} className="hover:bg-white/[0.02] group transition-colors">
                      <td className="py-1.5 px-3 font-bold text-white">{t.symbol}</td>
                      <td className="py-1.5 px-2 uppercase font-bold text-zinc-400">{t.type}</td>
                      <td className="py-1.5 px-2 font-mono">{t.lots}</td>
                      <td className="py-1.5 px-2 font-mono text-zinc-500">{formatPrice(t.openPrice, t.symbol)}</td>
                      <td className="py-1.5 px-2 font-mono text-zinc-500">{formatPrice(t.closePrice, t.symbol)}</td>
                      <td className="py-1.5 px-2 font-mono text-zinc-500">{formatDuration(durationSec)}</td>
                      <td className={cn("py-1.5 px-2 text-right font-mono font-bold", (t.pnl || 0) >= 0 ? "text-emerald-500" : "text-red-500")}>{(t.pnl || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="py-1.5 px-3 text-right text-zinc-600">{cDate ? format(cDate, 'MMM d, HH:mm') : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
             </table>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
