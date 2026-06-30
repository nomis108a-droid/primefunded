
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { Navigation } from '@/components/Navigation';
import { ADMIN_EMAILS } from '@/lib/admin';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Activity, 
  RefreshCw, 
  AlertTriangle, 
  Loader2, 
  Database, 
  CheckCircle2, 
  XCircle,
  Clock,
  ShieldCheck,
  ExternalLink
} from 'lucide-react';
import { db } from '@/lib/firebase';
import { doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

export default function AdminPriceTracker() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  
  const [prices, setPrices] = useState<Record<string, any>>({});
  const [isPumping, setIsPumping] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [status, setStatus] = useState({
    oanda: 'idle' as 'idle' | 'online' | 'error',
    kraken: 'idle' as 'idle' | 'online' | 'error'
  });
  const [errorCount, setErrorCount] = useState(0);

  // 1. Authorization Guard
  useEffect(() => {
    if (!authLoading) {
      if (!user || !ADMIN_EMAILS.includes(user.email || "")) {
        router.replace('/dashboard');
      }
    }
  }, [user, authLoading, router]);

  // 2. Data Pump Logic
  const pumpPrices = useCallback(async () => {
    try {
      const res = await fetch('/api/terminal/live-prices', { cache: 'no-store' });
      if (!res.ok) throw new Error('API Feed Offline');
      
      const data = await res.json();
      setPrices(data);
      setLastSync(new Date());

      // Update Health
      const hasForex = Object.keys(data).some(k => !['BTCUSD', 'ETHUSD', 'SOLUSD'].includes(k));
      const hasCrypto = Object.keys(data).some(k => ['BTCUSD', 'ETHUSD', 'SOLUSD'].includes(k));
      
      setStatus({
        oanda: hasForex ? 'online' : 'error',
        kraken: hasCrypto ? 'online' : 'error'
      });

      // Write to Firestore (Batch)
      if (Object.keys(data).length > 0) {
        const batch = writeBatch(db);
        Object.entries(data).forEach(([symbol, payload]) => {
          const ref = doc(db, 'livePrices', symbol);
          batch.set(ref, {
            ...payload as any,
            updatedAt: serverTimestamp()
          }, { merge: true });
        });
        await batch.commit();
        setErrorCount(0);
      }
    } catch (err) {
      console.error('[Tracker] Pump Failed:', err);
      setErrorCount(prev => prev + 1);
      setStatus({ oanda: 'error', kraken: 'error' });
    }
  }, []);

  useEffect(() => {
    if (!isPumping) return;
    
    pumpPrices(); // Initial
    const interval = setInterval(pumpPrices, 2500); // 2.5s loop
    
    return () => clearInterval(interval);
  }, [isPumping, pumpPrices]);

  if (authLoading || !user || !ADMIN_EMAILS.includes(user.email || "")) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Navigation />
      <main className="flex-1 p-8 overflow-y-auto custom-scrollbar">
        <header className="mb-10">
          <div className="flex items-center gap-3 mb-2">
            <Database className="w-6 h-6 text-primary" />
            <h1 className="text-3xl font-headline font-bold text-white uppercase tracking-tight">Institutional Price Synchronizer</h1>
          </div>
          <p className="text-muted-foreground">Admin Portal: Pumping real-time market data to the Firestore Global Node.</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 mb-12">
          {/* Main Control Card */}
          <Card className={cn(
            "lg:col-span-2 border-2 transition-all shadow-2xl",
            isPumping ? "border-primary/50 bg-primary/5" : "border-border/50 bg-card/40"
          )}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                System Power Status
                <Badge variant={isPumping ? "default" : "secondary"} className="animate-pulse">
                  {isPumping ? "LIVE PUMPING" : "STANDBY"}
                </Badge>
              </CardTitle>
              <CardDescription>
                When active, this page acts as the heart of the platform's market data.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="p-6 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-start gap-4">
                <AlertTriangle className="text-destructive w-8 h-8 shrink-0" />
                <div>
                  <h4 className="text-destructive font-black text-xs uppercase tracking-widest mb-1">Critical Operating Instruction</h4>
                  <p className="text-zinc-300 text-sm leading-relaxed">
                    Keep this browser tab open and focused. All user terminals (BUY/SELL buttons, charts, and price labels) depend on this sync loop to receive market data. Closing this page will freeze prices for all traders.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-secondary/30 border border-border">
                  <p className="text-[10px] font-black text-muted-foreground uppercase mb-2">OANDA Feed (FX/Metals)</p>
                  <div className="flex items-center gap-2">
                    {status.oanda === 'online' ? <CheckCircle2 className="text-emerald-500 w-4 h-4" /> : <XCircle className="text-destructive w-4 h-4" />}
                    <span className={cn("text-xs font-bold", status.oanda === 'online' ? "text-white" : "text-destructive")}>
                      {status.oanda === 'online' ? "Connected" : "Disconnected"}
                    </span>
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-secondary/30 border border-border">
                  <p className="text-[10px] font-black text-muted-foreground uppercase mb-2">Kraken Feed (Crypto)</p>
                  <div className="flex items-center gap-2">
                    {status.kraken === 'online' ? <CheckCircle2 className="text-emerald-500 w-4 h-4" /> : <XCircle className="text-destructive w-4 h-4" />}
                    <span className={cn("text-xs font-bold", status.kraken === 'online' ? "text-white" : "text-destructive")}>
                      {status.kraken === 'online' ? "Connected" : "Disconnected"}
                    </span>
                  </div>
                </div>
              </div>

              <Button 
                onClick={() => setIsPumping(!isPumping)}
                className={cn(
                  "w-full h-14 font-black text-lg rounded-xl transition-all shadow-xl",
                  isPumping 
                    ? "bg-destructive text-white hover:bg-destructive/90" 
                    : "bg-primary text-black hover:bg-primary/90 shadow-primary/20"
                )}
              >
                {isPumping ? <XCircle className="mr-2 w-6 h-6" /> : <Activity className="mr-2 w-6 h-6" />}
                {isPumping ? "STOP PRICE SYNC" : "START GLOBAL SYNC"}
              </Button>
            </CardContent>
          </Card>

          {/* Sync Stats */}
          <div className="lg:col-span-2 grid grid-cols-2 gap-6">
            <StatCard 
              title="Last Synchronization" 
              value={lastSync ? format(lastSync, 'HH:mm:ss') : '--:--:--'} 
              icon={<Clock />} 
              subValue={isPumping ? "Active Interval: 2.5s" : "Sync Disabled"}
            />
            <StatCard 
              title="System Latency" 
              value="< 300ms" 
              icon={<Activity />} 
              subValue="Direct Node-to-DB"
            />
            <StatCard 
              title="Network Health" 
              value={errorCount === 0 ? "EXCELLENT" : "DEGRADED"} 
              icon={<ShieldCheck />} 
              color={errorCount === 0 ? "emerald" : "red"}
              subValue={`${errorCount} Failed cycles`}
            />
             <Card className="bg-secondary/10 border-border p-6 flex flex-col justify-center text-center group hover:bg-primary/5 transition-colors cursor-pointer" onClick={() => window.open('/demo', '_blank')}>
                <ExternalLink className="w-8 h-8 text-primary mx-auto mb-4 group-hover:scale-110 transition-transform" />
                <p className="text-[10px] font-black uppercase text-muted-foreground">Test User Terminal</p>
             </Card>
          </div>
        </div>

        {/* Price Monitor Table */}
        <Card className="border-border/50 bg-card/40 overflow-hidden shadow-2xl">
          <CardHeader className="bg-secondary/20 border-b border-border/50">
            <CardTitle className="text-lg">Live Node Monitor</CardTitle>
            <CardDescription>Real-time data payload currently being written to Firestore.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-black tracking-widest">
                  <tr>
                    <th className="py-4 px-6">Symbol</th>
                    <th className="py-4 px-4 text-right">Price</th>
                    <th className="py-4 px-4 text-right">Bid</th>
                    <th className="py-4 px-4 text-right">Ask</th>
                    <th className="py-4 px-6 text-right">Last Packet</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {Object.keys(prices).length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-20 text-center text-muted-foreground italic">
                        {isPumping ? "Waiting for first data packet..." : "Sync loop inactive. Press START above."}
                      </td>
                    </tr>
                  ) : Object.entries(prices).map(([symbol, data]: [string, any]) => (
                    <tr key={symbol} className="hover:bg-primary/5 transition-colors group">
                      <td className="py-4 px-6 font-black text-white">{symbol}</td>
                      <td className="py-4 px-4 text-right font-mono font-bold text-primary">
                        {data.price.toFixed(symbol.includes('JPY') ? 3 : 5)}
                      </td>
                      <td className="py-4 px-4 text-right font-mono text-zinc-400">
                        {data.bid.toFixed(symbol.includes('JPY') ? 3 : 5)}
                      </td>
                      <td className="py-4 px-4 text-right font-mono text-zinc-400">
                        {data.ask.toFixed(symbol.includes('JPY') ? 3 : 5)}
                      </td>
                      <td className="py-4 px-6 text-right text-xs text-muted-foreground font-mono">
                        {data.updatedAt ? format(new Date(data.updatedAt), 'HH:mm:ss.SSS') : '--'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function StatCard({ title, value, icon, subValue, color = "blue" }: { title: string, value: string, icon: any, subValue: string, color?: string }) {
  const colorMap: any = {
    blue: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    emerald: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    red: 'bg-destructive/10 text-destructive border-destructive/20',
  };
  return (
    <Card className="bg-card/40 border-border/50">
      <CardContent className="p-6">
        <div className="flex justify-between items-center mb-4">
          <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">{title}</p>
          <div className={cn("p-2 rounded-lg border", colorMap[color])}>{icon}</div>
        </div>
        <p className="text-3xl font-headline font-bold text-white mb-1">{value}</p>
        <p className="text-[10px] font-bold text-zinc-500 uppercase">{subValue}</p>
      </CardContent>
    </Card>
  );
}
