"use client";

import { useState, useMemo, useEffect } from 'react';
import { Navigation } from '@/components/Navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { 
  Search, 
  Download, 
  History, 
  SearchX, 
  ChevronLeft, 
  ChevronRight, 
  Clock,
  XCircle,
  Calendar,
  Hourglass
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/AuthContext';
import { useCollection } from '@/firebase';
import { orderBy, where, limit } from 'firebase/firestore';
import { format, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { cn } from '@/lib/utils';
import { getTradeDate, calculateHoldingTimeSeconds, formatDuration } from '@/lib/tradeUtils';

export default function HistoryPage() {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  // 1. Fetch User Accounts (Include all statuses for permanent audit)
  const accountConstraints = useMemo(() => {
    if (!user?.uid) return [];
    return [where('userId', '==', user.uid)];
  }, [user?.uid]);

  const { data: accounts, loading: accountsLoading } = useCollection<any>(
    user?.uid ? 'demoAccounts' : null,
    accountConstraints
  );

  // 2. Default selection to first available account
  useEffect(() => {
    if (accounts.length > 0 && !selectedAccountId) {
      setSelectedAccountId(accounts[0].id);
    }
  }, [accounts, selectedAccountId]);

  // 3. Fetch Trades for Selected Account
  const tradeConstraints = useMemo(() => {
    if (!user?.uid || !selectedAccountId) return [];
    return [
      where('userId', '==', user.uid),
      where('accountId', '==', selectedAccountId),
      where('status', '==', 'closed'),
      orderBy('closedAt', 'desc'),
      limit(500)
    ];
  }, [user?.uid, selectedAccountId]);

  const { data: trades, loading: tradesLoading } = useCollection<any>(
    user?.uid && selectedAccountId ? 'demoTrades' : null,
    tradeConstraints
  );

  // 4. Client-side Filtering
  const filteredTrades = useMemo(() => {
    return trades.filter(trade => {
      // 4a. Duplicate/Stale record cleanup (Jul 6 bugged entries)
      const cDate = getTradeDate(trade.closedAt);
      if (cDate) {
        const isJuly6 = cDate.getMonth() === 6 && cDate.getDate() === 6 && cDate.getFullYear() === 2024;
        if (isJuly6 && (trade.pnl === -83.63 || trade.pnl === "-83.63")) return false;
      }

      const matchesSymbol = trade.symbol?.toLowerCase().includes(searchTerm.toLowerCase());
      
      let matchesDate = true;
      const tradeDate = getTradeDate(trade.closedAt);
      if (dateRange.start && dateRange.end && tradeDate) {
        try {
          matchesDate = isWithinInterval(tradeDate, {
            start: startOfDay(new Date(dateRange.start)),
            end: endOfDay(new Date(dateRange.end))
          });
        } catch (e) {
          matchesDate = true;
        }
      }

      return matchesSymbol && matchesDate;
    });
  }, [trades, searchTerm, dateRange]);

  const paginatedTrades = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredTrades.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredTrades, currentPage]);

  const totalPages = Math.ceil(filteredTrades.length / itemsPerPage);

  const exportToCSV = () => {
    if (!filteredTrades.length) return;
    const headers = ['Symbol', 'Type', 'Lots', 'Entry', 'Exit', 'Duration', 'Commission', 'PnL', 'Date'];
    const rows = filteredTrades.map(t => {
      const durationSec = calculateHoldingTimeSeconds(t.openedAt, t.closedAt);
      return [
        t.symbol, t.type, t.lots, t.openPrice, t.closePrice, formatDuration(durationSec), t.commission || 0, t.pnl, 
        t.closedAt ? format(getTradeDate(t.closedAt)!, 'yyyy-MM-dd HH:mm:ss') : 'N/A'
      ];
    });
    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.setAttribute("href", URL.createObjectURL(blob));
    link.setAttribute("download", `primefunded_trades_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    link.click();
  };

  return (
    <div className="flex min-h-screen bg-background">
      <Navigation />
      <main className="flex-1 p-4 md:p-8 overflow-y-auto custom-scrollbar">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-10">
          <div>
            <h1 className="text-3xl font-headline font-bold mb-1 text-white">Execution Journal</h1>
            <p className="text-muted-foreground text-sm">Full audit trail of your challenge executions.</p>
          </div>
          <Button variant="outline" onClick={exportToCSV} disabled={!filteredTrades.length} className="font-bold border-border/50 rounded-xl hover:bg-secondary">
            <Download className="w-4 h-4 mr-2" /> Export CSV
          </Button>
        </header>

        {/* Account Selector Pills */}
        {!accountsLoading && accounts.length === 0 ? (
          <Card className="border-2 border-dashed border-border/50 bg-secondary/5 p-12 text-center mb-8">
            <SearchX className="w-12 h-12 text-muted-foreground opacity-20 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-white mb-1">No trading nodes found</h3>
            <p className="text-sm text-muted-foreground">Start a challenge to generate your first audit trail.</p>
          </Card>
        ) : (
          <div className="flex flex-wrap gap-2 mb-8">
            {accounts.map((acc: any) => (
              <button
                key={acc.id}
                onClick={() => setSelectedAccountId(acc.id)}
                className={cn(
                  "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border flex items-center gap-2",
                  selectedAccountId === acc.id 
                    ? "bg-primary text-black border-primary shadow-[0_0_15px_rgba(17,179,245,0.4)]" 
                    : "bg-secondary/50 text-muted-foreground border-border/50 hover:border-primary/30"
                )}
              >
                {acc.label}
                <Badge className={cn(
                  "text-[8px] px-1.5 h-4 border-none font-black",
                  acc.status === 'active' ? "bg-emerald-500/20 text-emerald-500" :
                  acc.status === 'passed' ? "bg-amber-500/20 text-amber-500" :
                  "bg-destructive/20 text-destructive"
                )}>
                  {acc.status}
                </Badge>
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input className="pl-10 h-11 bg-secondary/30 border-border/50 text-white rounded-xl focus:border-primary/50 transition-all" placeholder="Search by Symbol..." value={searchTerm} onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }} />
          </div>
          <div className="flex gap-2">
            <Input type="date" className="h-11 bg-secondary/30 border-border/50 text-white rounded-xl text-xs" value={dateRange.start} onChange={e => setDateRange({...dateRange, start: e.target.value})} />
            <Input type="date" className="h-11 bg-secondary/30 border-border/50 text-white rounded-xl text-xs" value={dateRange.end} onChange={e => setDateRange({...dateRange, end: e.target.value})} />
          </div>
          <Button variant="secondary" onClick={() => { setDateRange({start:'', end:''}); setSearchTerm(''); }} className="h-11 px-6 font-bold rounded-xl border border-border/50">Reset</Button>
        </div>

        <Card className="border-border/50 bg-card/40 backdrop-blur-sm overflow-hidden shadow-2xl">
          <CardHeader className="border-b border-white/5 pb-4">
            <CardTitle className="text-lg flex items-center gap-2 text-white"><History className="w-5 h-5 text-primary" /> Position History</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-black tracking-widest">
                  <tr className="border-b border-border/50">
                    <th className="py-4 px-6">Symbol</th>
                    <th className="py-4 px-2">Type</th>
                    <th className="py-4 px-2 text-right">Lots</th>
                    <th className="py-4 px-4 text-right">Entry</th>
                    <th className="py-4 px-4 text-right">Exit</th>
                    <th className="py-4 px-4 text-center">Duration</th>
                    <th className="py-4 px-2 text-right">Commission</th>
                    <th className="py-4 px-6 text-right">Final P&L</th>
                    <th className="py-4 px-4">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {tradesLoading ? (
                    [...Array(5)].map((_, i) => <tr key={i} className="animate-pulse"><td colSpan={9} className="py-6 px-6"><div className="h-4 bg-secondary/50 rounded w-full" /></td></tr>)
                  ) : paginatedTrades.length > 0 ? (
                    paginatedTrades.map((t: any) => {
                      const durationSec = calculateHoldingTimeSeconds(t.openedAt, t.closedAt);
                      return (
                        <tr key={t.id} className="hover:bg-primary/5 transition-colors group">
                          <td className="py-4 px-6 font-bold text-white">{t.symbol}</td>
                          <td className="py-4 px-2">
                             <Badge variant="outline" className={cn("text-[9px] font-black uppercase px-2", t.type === 'buy' ? 'border-emerald-500/30 text-emerald-500 bg-emerald-500/5' : 'border-destructive/30 text-destructive bg-destructive/5')}>{t.type}</Badge>
                          </td>
                          <td className="py-4 px-2 text-right text-zinc-400 font-mono">{t.lots}</td>
                          <td className="py-4 px-4 text-right text-muted-foreground font-mono text-xs">${t.openPrice?.toLocaleString()}</td>
                          <td className="py-4 px-4 text-right text-white font-mono text-xs">${t.closePrice?.toLocaleString()}</td>
                          <td className="py-4 px-4 text-center">
                            <Badge variant="outline" className="h-5 px-1.5 text-[8px] border-zinc-800 text-zinc-400 flex items-center gap-1 mx-auto justify-center w-fit">
                              <Hourglass className="w-2.5 h-2.5" /> {formatDuration(durationSec)}
                            </Badge>
                          </td>
                          <td className="py-4 px-2 text-right font-mono text-xs text-destructive/80">
                            -${(t.commission || 0).toFixed(2)}
                          </td>
                          <td className={cn("py-4 px-6 text-right font-bold tabular-nums", (t.pnl || 0) >= 0 ? 'text-emerald-500' : 'text-destructive')}>
                            {(t.pnl || 0) >= 0 ? '+' : ''}${(t.pnl || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-4 px-4 text-xs text-muted-foreground">
                            {t.closedAt ? format(getTradeDate(t.closedAt)!, 'MMM d, HH:mm') : '—'}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr><td colSpan={9} className="py-32 text-center text-muted-foreground italic">No historical records found for the selected criteria.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between p-6 border-t border-white/5 bg-secondary/10">
                <p className="text-xs text-muted-foreground">Showing node logs for page {currentPage} of {totalPages}</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="h-8 rounded-lg" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
                  <Button variant="outline" size="sm" className="h-8 rounded-lg" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
