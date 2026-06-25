"use client";

import { useState, useMemo, useEffect } from 'react';
import { Navigation } from '@/components/Navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { 
  Search, 
  Download, 
  Filter, 
  History, 
  SearchX, 
  ChevronLeft, 
  ChevronRight, 
  ArrowUpDown, 
  Calendar,
  Trophy,
  Zap,
  ShieldCheck,
  XCircle,
  Clock,
  CheckCircle2
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/AuthContext';
import { useCollection, useFirestore } from '@/firebase';
import { orderBy, where, limit, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { format, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { cn } from '@/lib/utils';
import { getTradeDate, enrichTrades } from '@/lib/tradeUtils';

export default function HistoryPage() {
  const { user, userData } = useAuth();
  const db = useFirestore();
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const [dateRange, setDateRange] = useState({
    start: '',
    end: ''
  });

  const { data: trades, loading: tradesLoading } = useCollection<any>(
    user ? `users/${user.uid}/trades` : null,
    [orderBy('date', 'desc'), limit(500)]
  );

  const accountConstraints = useMemo(() => [
    where('userId', '==', user?.uid || '_none_'),
    orderBy('createdAt', 'desc'),
    limit(20)
  ], [user?.uid]);

  const { data: accountHistory, loading: accountsLoading } = useCollection<any>(
    user ? 'mt5_accounts' : null,
    accountConstraints
  );

  // Use SHARED logic for positioning matching
  const enrichedPositions = useMemo(() => {
    return enrichTrades(trades, userData?.mt5Login || 'N/A');
  }, [trades, userData?.mt5Login]);

  const filteredTrades = useMemo(() => {
    return enrichedPositions.filter(trade => {
      const matchesSymbol = trade.symbol?.toLowerCase().includes(searchTerm.toLowerCase());
      
      let matchesDate = true;
      const tradeDate = getTradeDate(trade.closeTime || trade.openTime);
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
  }, [enrichedPositions, searchTerm, dateRange]);

  const paginatedTrades = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredTrades.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredTrades, currentPage]);

  const totalPages = Math.ceil(filteredTrades.length / itemsPerPage);

  const exportToCSV = () => {
    if (!filteredTrades.length) return;
    
    const headers = ['Symbol', 'Type', 'OpenTime', 'CloseTime', 'Lots', 'PnL', 'Duration'];
    const rows = filteredTrades.map(t => {
      return [
        t.symbol || 'N/A', 
        t.type || 'N/A', 
        t.openTime ? format(getTradeDate(t.openTime)!, 'yyyy-MM-dd HH:mm:ss') : 'N/A',
        t.closeTime ? format(getTradeDate(t.closeTime)!, 'yyyy-MM-dd HH:mm:ss') : 'N/A',
        t.lots || '0', 
        t.pnl || '0',
        t.duration
      ];
    });
    
    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `primefunded_positions_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex min-h-screen bg-background">
      <Navigation />
      <main className="flex-1 p-4 md:p-8 overflow-y-auto custom-scrollbar">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-10">
          <div>
            <h1 className="text-3xl font-headline font-bold mb-1 text-white">Institutional Journal</h1>
            <p className="text-muted-foreground text-sm">Comprehensive history of your funding journey and positions.</p>
          </div>
          <Button 
            variant="outline" 
            onClick={exportToCSV}
            disabled={!filteredTrades.length}
            className="w-full md:w-auto font-bold border-border/50 rounded-xl hover:bg-secondary cursor-pointer"
          >
            <Download className="w-4 h-4 mr-2" /> Export CSV
          </Button>
        </header>

        <section className="mb-12">
          <div className="flex items-center gap-2 mb-6">
            <Trophy className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-headline font-bold text-white uppercase tracking-tight">Phase Progression</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {accountsLoading ? (
               [1, 2].map(i => <div key={i} className="h-32 bg-secondary/20 rounded-2xl animate-pulse border border-border/30" />)
            ) : accountHistory.length > 0 ? (
               accountHistory.map((acc: any) => {
                  const isBreached = acc.status === 'breached' || acc.status === 'terminated';
                  const isActive = acc.status === 'active';
                  const isPassed = acc.status === 'passed' || acc.status === 'completed';

                  return (
                    <Card key={acc.id} className={cn(
                      "bg-card/40 border-border/50 hover:border-primary/20 transition-all",
                      isBreached && "border-destructive/40 bg-destructive/5",
                      isActive && "border-emerald-500/40 bg-emerald-500/5",
                      isPassed && "border-primary/40 bg-primary/5"
                    )}>
                       <CardContent className="p-5 space-y-3">
                          <div className="flex justify-between items-start">
                             <Badge className={cn(
                               "uppercase text-[9px] font-black border-none px-2",
                               isBreached ? "bg-destructive/20 text-destructive" :
                               isActive ? "bg-emerald-500/20 text-emerald-500" :
                               "bg-primary/20 text-primary"
                             )}>
                               {acc.phase || acc.accountPlan}
                             </Badge>
                             <span className="text-[10px] text-muted-foreground font-medium">
                              {acc.createdAt?.seconds ? format(new Date(acc.createdAt.seconds * 1000), 'yyyy-MM-dd') : 'N/A'}
                             </span>
                          </div>
                          <div>
                             <p className="text-xs font-bold text-white">{acc.accountSize || ('$' + (acc.accountBalance/1000).toFixed(0) + 'k')} Account</p>
                             <p className="text-[10px] text-muted-foreground font-mono">Node ID: {acc.login || '---'}</p>
                          </div>
                          
                          <div className="space-y-2 pt-1">
                            <div className="flex items-center gap-1.5">
                               {isBreached ? (
                                  <XCircle className="w-3 h-3 text-destructive" />
                               ) : isActive ? (
                                  <Clock className="w-3 h-3 text-emerald-500" />
                               ) : (
                                  <CheckCircle2 className="w-3 h-3 text-primary" />
                               )}
                               <span className={cn(
                                 "text-[9px] font-black uppercase tracking-widest",
                                 isBreached ? "text-destructive" :
                                 isActive ? "text-emerald-500" :
                                 "text-primary"
                               )}>
                                 {isBreached ? 'TERMINATED' : isActive ? 'ACTIVE STATUS' : 'PHASE PASSED'}
                               </span>
                            </div>
                          </div>
                       </CardContent>
                    </Card>
                  );
               })
            ) : (
               <Card className="col-span-full bg-secondary/5 border-dashed border-border/50 py-10">
                  <CardContent className="flex flex-col items-center justify-center text-center opacity-50">
                     <Clock className="w-8 h-8 mb-2" />
                     <p className="text-sm font-bold">No historical trading nodes found.</p>
                  </CardContent>
               </Card>
            )}
          </div>
        </section>

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input 
              className="pl-10 h-11 bg-secondary/30 border-border/50 text-white rounded-xl focus:border-primary/50 transition-all" 
              placeholder="Filter by Symbol (e.g. EURUSD)..." 
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>
          <div className="flex gap-2">
            <Input 
              type="date" 
              className="h-11 bg-secondary/30 border-border/50 text-white rounded-xl text-xs" 
              value={dateRange.start}
              onChange={(e) => setDateRange({...dateRange, start: e.target.value})}
            />
            <Input 
              type="date" 
              className="h-11 bg-secondary/30 border-border/50 text-white rounded-xl text-xs" 
              value={dateRange.end}
              onChange={(e) => setDateRange({...dateRange, end: e.target.value})}
            />
          </div>
          <Button 
            variant="secondary" 
            onClick={() => { setDateRange({start:'', end:''}); setSearchTerm(''); }}
            className="h-11 px-6 font-bold rounded-xl border border-border/50 cursor-pointer"
          >
            Reset
          </Button>
        </div>

        <Card className="border-border/50 bg-card/40 backdrop-blur-sm overflow-hidden">
          <CardHeader className="border-b border-white/5 pb-4">
            <CardTitle className="text-lg flex items-center gap-2 text-white">
              <History className="w-5 h-5 text-primary" /> Position Journal
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-black tracking-widest">
                  <tr className="border-b border-border/50">
                    <th className="py-4 px-6">Symbol</th>
                    <th className="py-4 px-2">Type</th>
                    <th className="py-4 px-4">Open Time</th>
                    <th className="py-4 px-4">Close Time</th>
                    <th className="py-4 px-4">Duration</th>
                    <th className="py-4 px-2 text-right">Lot</th>
                    <th className="py-4 px-6 text-right">P&L</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {tradesLoading ? (
                    [...Array(5)].map((_, i) => (
                      <tr key={i} className="animate-pulse">
                        <td colSpan={7} className="py-6 px-6"><div className="h-4 bg-secondary/50 rounded w-full" /></td>
                      </tr>
                    ))
                  ) : paginatedTrades.length > 0 ? (
                    paginatedTrades.map((trade: any) => {
                      return (
                        <tr key={trade.id} className="hover:bg-primary/5 transition-colors group">
                          <td className="py-4 px-6 font-bold text-white">{trade.symbol || 'N/A'}</td>
                          <td className="py-4 px-2">
                             <Badge variant="outline" className={cn(
                               "text-[9px] font-black uppercase px-2 py-0",
                               trade.type?.toLowerCase() === 'buy' ? 'border-emerald-500/30 text-emerald-500 bg-emerald-500/5' : 'border-destructive/30 text-destructive bg-destructive/5'
                             )}>
                               {trade.type || 'N/A'}
                             </Badge>
                          </td>
                          <td className="py-4 px-4 text-muted-foreground font-mono text-xs">
                            {trade.openTime ? format(getTradeDate(trade.openTime)!, 'yyyy-MM-dd HH:mm') : 'N/A'}
                          </td>
                          <td className="py-4 px-4 text-muted-foreground font-mono text-xs">
                            {trade.closeTime ? format(getTradeDate(trade.closeTime)!, 'yyyy-MM-dd HH:mm') : 'N/A'}
                          </td>
                          <td className="py-4 px-4 text-muted-foreground text-xs flex items-center gap-1.5 pt-5">
                            <Clock className="w-3 h-3" />
                            {trade.duration}
                          </td>
                          <td className="py-4 px-2 text-right text-white font-mono">{trade.lots || '0.00'}</td>
                          <td className={cn(
                            "py-4 px-6 text-right font-bold tabular-nums",
                            (trade.pnl || 0) >= 0 ? 'text-emerald-500' : 'text-destructive'
                          )}>
                            {(trade.pnl || 0) >= 0 ? '+' : ''}${(trade.pnl || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={7} className="py-32 text-center">
                        <div className="flex flex-col items-center justify-center space-y-6 max-w-sm mx-auto">
                          <div className="w-20 h-20 bg-secondary/30 rounded-full flex items-center justify-center border border-white/5">
                            <SearchX className="w-10 h-10 text-muted-foreground opacity-20" />
                          </div>
                          <div>
                            <h3 className="text-xl font-bold text-white mb-2">No positions found</h3>
                            <p className="text-muted-foreground text-sm leading-relaxed">
                              No historical position data matches your current filters. Live executions will appear here instantly.
                            </p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between p-6 border-t border-white/5 bg-secondary/10">
                <p className="text-xs text-muted-foreground font-medium">
                  Showing <span className="text-white">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="text-white">{Math.min(currentPage * itemsPerPage, filteredTrades.length)}</span> of <span className="text-white">{filteredTrades.length}</span> positions
                </p>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-8 w-8 p-0 rounded-lg" 
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => prev - 1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <div className="flex items-center gap-1 px-4">
                    <span className="text-xs font-bold text-white">{currentPage}</span>
                    <span className="text-xs text-muted-foreground">/</span>
                    <span className="text-xs text-muted-foreground">{totalPages}</span>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-8 w-8 p-0 rounded-lg" 
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(prev => prev + 1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}