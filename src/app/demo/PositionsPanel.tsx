'use client';

import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { XCircle, Check, X, Loader2, Bell, Trash2, Clock, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, differenceInSeconds } from 'date-fns';
import { getTradeDate, formatDuration } from '@/lib/tradeUtils';
import { useToast } from '@/hooks/use-toast';

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
  setPanelOpen
}: PositionsPanelProps) {
  const [activeTab, setActiveTab] = useState("positions");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editType, setEditingType] = useState<'sl' | 'tp' | null>(null);
  const [editValue, setEditValue] = useState("");
  const [updating, setUpdating] = useState(false);
  const { toast } = useToast();

  const getPrecision = (s: string) => (s === "USDJPY" ? 3 : (s === "XAUUSD" || s === "BTCUSD" || s === "ETHUSD" ? 2 : 5));
  const formatPrice = (price: number | undefined, symbol: string) => price ? price.toFixed(getPrecision(symbol)) : '—';

  const handleUpdateLevel = async (tradeId: string) => {
    if (!user || !editType) return;
    setUpdating(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/terminal/trades/${tradeId}/update`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ [editType]: editValue === "" ? null : parseFloat(editValue) }),
      });
      if (!res.ok) throw new Error("Failed to update level");
      toast({ title: "Target Updated", description: `${editType.toUpperCase()} level modified.` });
      setEditingId(null);
      setEditingType(null);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Update Failed", description: err.message });
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className={cn(
      "border-t border-zinc-800 bg-zinc-950 flex flex-col shrink-0 relative transition-all duration-200 ease-in-out z-40",
      panelOpen ? "h-[200px]" : "h-[40px]"
    )}>
      {/* Drag Handle / Toggle Bar */}
      <div 
        className="h-1 bg-zinc-800 hover:bg-primary/50 cursor-ns-resize transition-colors absolute top-0 left-0 right-0 z-50"
        onClick={() => setPanelOpen(!panelOpen)}
      />

      <div className="px-4 h-9 border-b border-zinc-800 flex justify-between items-center bg-zinc-950/50 shrink-0">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex-1">
          <TabsList className="bg-transparent h-full p-0 gap-6">
            <TabsTrigger value="positions" className="bg-transparent border-none h-full text-[10px] font-black uppercase tracking-widest text-zinc-500 data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none shadow-none px-0">
              Open Positions ({openTrades.length})
            </TabsTrigger>
            <TabsTrigger value="history" className="bg-transparent border-none h-full text-[10px] font-black uppercase tracking-widest text-zinc-500 data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none shadow-none px-0">
              Trade History
            </TabsTrigger>
            <TabsTrigger value="alerts" className="bg-transparent border-none h-full text-[10px] font-black uppercase tracking-widest text-zinc-500 data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none shadow-none px-0">
              Price Alerts ({alerts.length})
            </TabsTrigger>
          </TabsList>
        </Tabs>
        
        <button 
          onClick={() => setPanelOpen(!panelOpen)}
          className="p-1 hover:bg-white/5 rounded text-zinc-500 transition-colors cursor-pointer"
        >
          {panelOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
      </div>

      <div className={cn(
        "flex-1 overflow-y-auto custom-scrollbar transition-opacity duration-200",
        panelOpen ? "opacity-100" : "opacity-0 pointer-events-none"
      )}>
        <Tabs value={activeTab} className="w-full h-full">
          <TabsContent value="positions" className="m-0 border-none outline-none">
            <table className="w-full text-[11px] text-left">
              <thead className="sticky top-0 bg-zinc-950/90 backdrop-blur-md text-zinc-500 uppercase text-[9px] font-black tracking-widest border-b border-zinc-800">
                <tr>
                  <th className="py-1.5 px-2">Symbol</th>
                  <th className="py-1.5 px-2">Type</th>
                  <th className="py-1.5 px-2">Lots</th>
                  <th className="py-1.5 px-2">Entry</th>
                  <th className="py-1.5 px-2">S/L</th>
                  <th className="py-1.5 px-2">T/P</th>
                  <th className="py-1.5 px-2">Open Time</th>
                  <th className="py-1.5 px-2 text-right">PnL (USD)</th>
                  <th className="py-1.5 px-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900">
                {openTrades.length === 0 ? (
                  <tr><td colSpan={9} className="py-10 text-center italic text-zinc-600">No active positions.</td></tr>
                ) : openTrades.map((t) => {
                  const pData = livePrices[t.symbol];
                  let pnl = 0;
                  if (pData) {
                    const cp = t.type === 'buy' ? pData.bid : pData.ask;
                    const cSize = t.symbol === 'XAUUSD' ? 100 : ['BTCUSD', 'ETHUSD', 'XRPUSD', 'SOLUSD', 'DOGEUSD', 'ADAUSD', 'BNBUSD'].includes(t.symbol) ? 1 : 100000;
                    pnl = t.type === 'buy' ? (cp - t.openPrice) * cSize * t.lots : (t.openPrice - cp) * cSize * t.lots;
                  }
                  const openDate = getTradeDate(t.openedAt);
                  const isEditingSL = editingId === t.id && editType === 'sl';
                  const isEditingTP = editingId === t.id && editType === 'tp';

                  return (
                    <tr key={t.id} className="hover:bg-white/5 group transition-colors h-[36px]">
                      <td className="py-1 px-2 font-bold text-white">{t.symbol}</td>
                      <td className="py-1 px-2"><span className={cn("font-black uppercase text-[10px]", t.type === 'buy' ? "text-emerald-500" : "text-red-500")}>{t.type}</span></td>
                      <td className="py-1 px-2 font-mono text-zinc-400">{t.lots.toFixed(2)}</td>
                      <td className="py-1 px-2 font-mono text-zinc-400">{formatPrice(t.openPrice, t.symbol)}</td>
                      
                      <td className="py-1 px-2 font-mono">
                        {isEditingSL ? (
                          <div className="flex items-center gap-1">
                            <Input size={1} value={editValue} onChange={e => setEditValue(e.target.value)} className="h-6 w-20 text-[10px] bg-zinc-900 border-zinc-700" autoFocus />
                            <button onClick={() => handleUpdateLevel(t.id)} disabled={updating} className="text-emerald-500 hover:text-emerald-400"><Check className="w-3 h-3" /></button>
                            <button onClick={() => setEditingId(null)} className="text-zinc-500 hover:text-zinc-400"><X className="w-3 h-3" /></button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="text-zinc-500">{t.sl ? formatPrice(t.sl, t.symbol) : '—'}</span>
                            <button onClick={() => { setEditingId(t.id); setEditingType('sl'); setEditValue(t.sl || ""); }} className="text-primary hover:underline text-[9px] font-bold opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">MODIFY</button>
                          </div>
                        )}
                      </td>

                      <td className="py-1 px-2 font-mono">
                        {isEditingTP ? (
                          <div className="flex items-center gap-1">
                            <Input size={1} value={editValue} onChange={e => setEditValue(e.target.value)} className="h-6 w-20 text-[10px] bg-zinc-900 border-zinc-700" autoFocus />
                            <button onClick={() => handleUpdateLevel(t.id)} disabled={updating} className="text-emerald-500 hover:text-emerald-400"><Check className="w-3 h-3" /></button>
                            <button onClick={() => setEditingId(null)} className="text-zinc-500 hover:text-zinc-400"><X className="w-3 h-3" /></button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="text-zinc-500">{t.tp ? formatPrice(t.tp, t.symbol) : '—'}</span>
                            <button onClick={() => { setEditingId(t.id); setEditingType('tp'); setEditValue(t.tp || ""); }} className="text-primary hover:underline text-[9px] font-bold opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">MODIFY</button>
                          </div>
                        )}
                      </td>

                      <td className="py-1 px-2 font-mono text-zinc-500 text-[10px]">{openDate ? format(openDate, 'HH:mm:ss') : '—'}</td>
                      <td className={cn("py-1 px-2 text-right font-mono font-bold tabular-nums", pnl >= 0 ? "text-emerald-500" : "text-red-500")}>
                        {pnl >= 0 ? '+' : ''}{pnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-1 px-2 text-right">
                        <button onClick={() => closeTrade(t.id)} className="p-1 hover:bg-red-500/20 text-red-500/50 hover:text-red-500 transition-colors rounded cursor-pointer">
                          <XCircle className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TabsContent>
          
          <TabsContent value="history" className="m-0 border-none outline-none">
             <table className="w-full text-[11px] text-left">
              <thead className="sticky top-0 bg-zinc-950/90 backdrop-blur-md text-zinc-500 uppercase text-[9px] font-black tracking-widest border-b border-zinc-800">
                <tr>
                  <th className="py-1.5 px-2">Symbol</th>
                  <th className="py-1.5 px-2">Type</th>
                  <th className="py-1.5 px-2">Lots</th>
                  <th className="py-1.5 px-2">Open</th>
                  <th className="py-1.5 px-2">Close</th>
                  <th className="py-1.5 px-2">Duration</th>
                  <th className="py-1.5 px-2 text-right">PnL</th>
                  <th className="py-1.5 px-2 text-right">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900">
                {closedTrades.map((t) => {
                  const oDate = getTradeDate(t.openedAt);
                  const cDate = getTradeDate(t.closedAt);
                  const dur = (oDate && cDate) ? formatDuration(differenceInSeconds(cDate, oDate)) : '—';
                  return (
                    <tr key={t.id} className="hover:bg-white/5 group transition-colors h-[36px]">
                      <td className="py-1 px-2 font-bold text-white">{t.symbol}</td>
                      <td className="py-1 px-2 uppercase font-bold text-[10px]">{t.type}</td>
                      <td className="py-1 px-2 font-mono">{t.lots}</td>
                      <td className="py-1 px-2 font-mono text-zinc-500">{formatPrice(t.openPrice, t.symbol)}</td>
                      <td className="py-1 px-2 font-mono text-zinc-500">{formatPrice(t.closePrice, t.symbol)}</td>
                      <td className="py-1 px-2 font-mono text-zinc-500">{dur}</td>
                      <td className={cn("py-1 px-2 text-right font-mono font-bold", (t.pnl || 0) >= 0 ? "text-emerald-500" : "text-red-500")}>
                        {(t.pnl || 0).toLocaleString()}
                      </td>
                      <td className="py-1 px-2 text-right text-zinc-600">{cDate ? format(cDate, 'MMM d, HH:mm') : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
             </table>
          </TabsContent>

          <TabsContent value="alerts" className="m-0 border-none outline-none">
            <table className="w-full text-[11px] text-left">
              <thead className="sticky top-0 bg-zinc-950/90 backdrop-blur-md text-zinc-500 uppercase text-[9px] font-black tracking-widest border-b border-zinc-800">
                <tr>
                  <th className="py-1.5 px-2">Symbol</th>
                  <th className="py-1.5 px-2">Condition</th>
                  <th className="py-1.5 px-2">Target Price</th>
                  <th className="py-1.5 px-2">Status</th>
                  <th className="py-1.5 px-2">Set At</th>
                  <th className="py-1.5 px-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900">
                {alertsLoading ? (
                  <tr><td colSpan={6} className="py-10 text-center"><Loader2 className="animate-spin w-4 h-4 mx-auto text-primary" /></td></tr>
                ) : alerts.length === 0 ? (
                  <tr><td colSpan={6} className="py-10 text-center italic text-zinc-600">No active alerts.</td></tr>
                ) : alerts.map((a) => {
                  const setDate = getTradeDate(a.createdAt);
                  return (
                    <tr key={a.id} className="hover:bg-white/5 transition-colors h-[36px]">
                      <td className="py-1 px-2 font-bold text-white">{a.symbol}</td>
                      <td className="py-1 px-2 uppercase text-[10px] font-black text-zinc-400">Price {a.condition}</td>
                      <td className="py-1 px-2 font-mono text-white">{formatPrice(a.targetPrice, a.symbol)}</td>
                      <td className="py-1 px-2">
                        <Badge className={cn(
                          "text-[9px] uppercase font-black px-2 h-4",
                          a.status === 'active' ? "bg-primary/10 text-primary" : "bg-zinc-800 text-zinc-500"
                        )}>{a.status}</Badge>
                      </td>
                      <td className="py-1 px-2 text-zinc-600">{setDate ? format(setDate, 'MMM d, HH:mm') : '—'}</td>
                      <td className="py-1 px-2 text-right">
                        <button onClick={() => deleteAlert(a.id)} className="p-1 hover:bg-red-500/20 text-red-500/50 hover:text-red-500 transition-colors rounded cursor-pointer">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
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
