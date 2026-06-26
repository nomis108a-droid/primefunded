'use client';

import { useState, useMemo, useEffect } from 'react';
import { Navigation } from '@/components/Navigation';
import { useAuth } from '@/context/AuthContext';
import { useCollection, useFirestore } from '@/firebase';
import { 
  collection, 
  where, 
  orderBy, 
  query,
  onSnapshot
} from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Play, 
  Activity, 
  Wallet, 
  History,
  AlertCircle,
  XCircle,
  Plus
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const PLANS = [
  { id: '10k', size: 10000, label: '$10k Demo' },
  { id: '25k', size: 25000, label: '$25k Demo' },
  { id: '50k', size: 50000, label: '$50k Demo' },
];

const SYMBOLS = ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'BTCUSD'];

export default function DemoPage() {
  const { user } = useAuth();
  const db = useFirestore();
  const { toast } = useToast();

  const [activeAccount, setActiveAccount] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [prices, setPrices] = useState<Record<string, any>>({});
  
  // FIXED: Strictly memoized and auth-guarded account query
  const accountConstraints = useMemo(() => {
    if (!user?.uid) return [];
    return [
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    ];
  }, [user?.uid]);

  const { data: accounts, loading: accountsLoading } = useCollection<any>(
    user?.uid ? 'demoAccounts' : null,
    accountConstraints
  );

  // FIXED: Strictly memoized and auth-guarded trades query
  const tradeConstraints = useMemo(() => {
    if (!user?.uid || !activeAccount?.id) return [];
    return [
      where('userId', '==', user.uid),
      where('accountId', '==', activeAccount.id),
      where('status', '==', 'open')
    ];
  }, [user?.uid, activeAccount?.id]);

  const { data: openTrades } = useCollection<any>(
    (user?.uid && activeAccount?.id) ? 'demoTrades' : null,
    tradeConstraints
  );

  // Institutional Price Feed Listener
  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, 'livePrices'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newPrices: Record<string, any> = {};
      snapshot.docs.forEach(doc => {
        newPrices[doc.id] = doc.data();
      });
      setPrices(newPrices);
    });
    return () => unsubscribe();
  }, [db]);

  const handleCreateAccount = async (plan: any) => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/terminal/accounts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ plan: plan.id })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Provisioning failed');
      
      toast({ title: "Account Provisioned", description: `Demo account ${plan.label} is live.` });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Creation Failed", description: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenTrade = async (symbol: string, type: 'buy' | 'sell', lots: number) => {
    if (!activeAccount || !user) return;
    
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/terminal/trades', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          accountId: activeAccount.id,
          symbol,
          type,
          lots
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Execution failed');

      toast({ title: "Position Executed", description: `${type.toUpperCase()} ${lots} lot ${symbol}` });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Execution Error", description: err.message });
    }
  };

  const handleCloseTrade = async (trade: any) => {
    if (!user) return;

    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/terminal/trades/${trade.id}/close`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Closure failed');

      toast({ title: "Position Closed", description: `Realized P&L: $${data.pnl.toFixed(2)}` });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    }
  };

  // Real-time Equity Calculator (Display Only)
  const accountMetrics = useMemo(() => {
    if (!activeAccount) return { equity: 0, floatingPnl: 0 };
    let floatingPnl = 0;
    openTrades.forEach(trade => {
      const price = prices[trade.symbol];
      if (price) {
        const currentPrice = trade.type === 'buy' ? price.bid : price.ask;
        const contractSize = symbolToContractSize(trade.symbol);
        floatingPnl += trade.type === 'buy' 
          ? (currentPrice - trade.openPrice) * contractSize * trade.lots
          : (trade.openPrice - currentPrice) * contractSize * trade.lots;
      }
    });
    return { 
      equity: activeAccount.balance + floatingPnl, 
      floatingPnl 
    };
  }, [activeAccount, openTrades, prices]);

  function symbolToContractSize(symbol: string) {
    if (symbol === 'XAUUSD') return 100;
    if (symbol === 'BTCUSD') return 1;
    return 100000;
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Navigation />
      <main className="flex-1 p-4 md:p-8 overflow-y-auto custom-scrollbar">
        <header className="mb-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-headline font-bold mb-1 text-white">Demo Terminal</h1>
            <p className="text-muted-foreground text-sm">Practice institutional trading protocols with virtual capital.</p>
          </div>
          <div className="flex gap-2">
            {PLANS.map(plan => (
              <Button 
                key={plan.id} 
                variant="outline" 
                size="sm" 
                className="font-bold border-primary/20 hover:bg-primary/10 cursor-pointer"
                onClick={() => handleCreateAccount(plan)}
                disabled={loading}
              >
                <Plus className="w-4 h-4 mr-2" /> {plan.label}
              </Button>
            ))}
          </div>
        </header>

        <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
          <div className="space-y-6">
            <h2 className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <Wallet className="w-3.5 h-3.5" /> Virtual Nodes
            </h2>
            <div className="space-y-3">
              {accountsLoading ? (
                [1, 2].map(i => <div key={i} className="h-24 bg-secondary/20 rounded-xl animate-pulse" />)
              ) : accounts.length === 0 ? (
                <div className="p-10 border-2 border-dashed border-border/50 rounded-2xl text-center">
                  <p className="text-xs text-muted-foreground italic">No demo nodes found.</p>
                </div>
              ) : (
                accounts.map(acc => (
                  <Card 
                    key={acc.id} 
                    onClick={() => setActiveAccount(acc)}
                    className={cn(
                      "cursor-pointer transition-all border-border/50 bg-card/40 hover:border-primary/30",
                      activeAccount?.id === acc.id && "border-primary bg-primary/5 ring-1 ring-primary/20"
                    )}
                  >
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start mb-2">
                        <Badge variant="outline" className="text-[9px] font-black uppercase">{acc.plan}</Badge>
                        <Badge className={cn("text-[9px] uppercase font-black", acc.status === 'active' ? 'bg-emerald-500' : 'bg-destructive')}>
                          {acc.status}
                        </Badge>
                      </div>
                      <p className="text-lg font-black text-white">${(acc.balance / 1000).toFixed(0)}k Balance</p>
                      <p className="text-[10px] text-muted-foreground truncate uppercase font-bold tracking-tighter">ID: {acc.id.slice(0, 8)}</p>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>

          <div className="xl:col-span-3 space-y-8">
            {activeAccount ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <MetricSmall label="Virtual Balance" value={`$${activeAccount.balance.toLocaleString()}`} icon={<Wallet className="text-primary" />} />
                  <MetricSmall 
                    label="Current Equity" 
                    value={`$${accountMetrics.equity.toLocaleString(undefined, { maximumFractionDigits: 2 })}`} 
                    icon={<Activity className="text-accent" />} 
                    subValue={`${accountMetrics.floatingPnl >= 0 ? '+' : ''}$${accountMetrics.floatingPnl.toFixed(2)} Floating`}
                    subColor={accountMetrics.floatingPnl >= 0 ? 'text-emerald-500' : 'text-destructive'}
                  />
                  <MetricSmall label="Max Loss Limit" value={`$${(activeAccount.maxLoss).toLocaleString()}`} icon={<AlertCircle className="text-destructive" />} />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <Card className="bg-card/40 border-border/50">
                    <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Play className="w-5 h-5 text-primary" /> Execution Desk</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                      {SYMBOLS.map(symbol => {
                        const price = prices[symbol];
                        return (
                          <div key={symbol} className="flex items-center justify-between p-4 bg-background/40 rounded-xl border border-white/5 group hover:border-primary/20 transition-all">
                            <div>
                              <p className="font-black text-white">{symbol}</p>
                              <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">
                                Sp: {(price?.ask - price?.bid || 0).toFixed(5)}
                              </p>
                            </div>
                            <div className="flex items-center gap-6">
                               <div className="text-right">
                                  <p className="text-xs font-mono text-emerald-500 font-bold">{price?.bid.toFixed(5) || '---'}</p>
                                  <p className="text-[8px] uppercase font-black text-muted-foreground">BID</p>
                               </div>
                               <div className="text-right">
                                  <p className="text-xs font-mono text-destructive font-bold">{price?.ask.toFixed(5) || '---'}</p>
                                  <p className="text-[8px] uppercase font-black text-muted-foreground">ASK</p>
                               </div>
                            </div>
                            <div className="flex gap-2">
                               <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] cursor-pointer" onClick={() => handleOpenTrade(symbol, 'buy', 1)} disabled={activeAccount.status !== 'active'}>BUY</Button>
                               <Button size="sm" variant="destructive" className="font-black text-[10px] cursor-pointer" onClick={() => handleOpenTrade(symbol, 'sell', 1)} disabled={activeAccount.status !== 'active'}>SELL</Button>
                            </div>
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>

                  <Card className="bg-card/40 border-border/50">
                    <CardHeader><CardTitle className="text-lg flex items-center gap-2"><History className="w-5 h-5 text-accent" /> Active Positions</CardTitle></CardHeader>
                    <CardContent className="p-0">
                       <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                          <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-bold">
                            <tr>
                              <th className="py-3 px-4">Symbol</th>
                              <th className="py-3 px-2">Type</th>
                              <th className="py-3 px-2 text-right">PnL</th>
                              <th className="py-3 px-4 text-right">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {openTrades.length === 0 ? (
                              <tr><td colSpan={4} className="py-10 text-center italic text-xs text-muted-foreground">No open positions.</td></tr>
                            ) : openTrades.map(trade => {
                              const price = prices[trade.symbol];
                              let pnl = 0;
                              if (price) {
                                const currentPrice = trade.type === 'buy' ? price.bid : price.ask;
                                const contractSize = symbolToContractSize(trade.symbol);
                                pnl = trade.type === 'buy' 
                                  ? (currentPrice - trade.openPrice) * contractSize * trade.lots
                                  : (trade.openPrice - currentPrice) * contractSize * trade.lots;
                              }

                              return (
                                <tr key={trade.id} className="hover:bg-white/5">
                                  <td className="py-3 px-4 font-bold text-white">{trade.symbol}</td>
                                  <td className="py-3 px-2">
                                    <Badge variant="outline" className={cn("text-[9px] uppercase font-black", trade.type === 'buy' ? 'text-emerald-500' : 'text-destructive')}>
                                      {trade.type}
                                    </Badge>
                                  </td>
                                  <td className={cn("py-3 px-2 text-right font-mono font-bold", pnl >= 0 ? 'text-emerald-500' : 'text-destructive')}>
                                    {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}
                                  </td>
                                  <td className="py-3 px-4 text-right">
                                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:bg-destructive/10 cursor-pointer" onClick={() => handleCloseTrade(trade)}>
                                      <XCircle className="w-4 h-4" />
                                    </Button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </>
            ) : (
              <div className="h-[60vh] flex flex-col items-center justify-center text-center space-y-6">
                <div className="w-20 h-20 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center animate-float">
                   <Activity className="w-10 h-10 text-primary" />
                </div>
                <div className="max-w-md">
                   <h3 className="text-2xl font-headline font-bold text-white uppercase">Initialize Demo Node</h3>
                   <p className="text-muted-foreground">Select a virtual funding plan from the header to begin your risk-free practice session. All demo nodes follow institutional hard-breach rules.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function MetricSmall({ label, value, icon, subValue, subColor }: { label: string, value: string, icon: any, subValue?: string, subColor?: string }) {
  return (
    <Card className="bg-card/40 border-border/50">
      <CardContent className="p-6">
        <div className="flex justify-between items-start mb-2">
           <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</p>
           {icon}
        </div>
        <h3 className="text-3xl font-headline font-bold text-white tabular-nums">{value}</h3>
        {subValue && <p className={cn("text-[9px] font-bold uppercase mt-1", subColor)}>{subValue}</p>}
      </CardContent>
    </Card>
  );
}
