'use client';

import { useEffect, useState, memo, useCallback } from 'react';
import { Navigation } from '@/components/Navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Zap,
  RefreshCw,
  Clock,
  ShieldCheck,
  Server,
  Fingerprint,
  Activity,
  AlertTriangle
} from 'lucide-react';
import { db } from '@/lib/firebase';
import { onSnapshot, collection, doc, setDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

/**
 * @fileOverview Institutional Price Monitor & Liquidity Bridge
 * This page acts as the primary broadcast node for the terminal.
 * When open, it polls liquidity at high frequency and updates Firestore.
 */

const SYMBOLS = [
  "XAUUSD", "XAGUSD", "XPTUSD", "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCHF", "USDCAD", "NZDUSD",
  "BTCUSD", "ETHUSD", "SOLUSD", "XRPUSD", "BNBUSD", "DOGEUSD", "ADAUSD"
];

const MiniChart = memo(({ history }: { history: number[] }) => {
  if (!history || history.length < 2) {
    return (
      <div className="h-[40px] w-full flex items-center justify-center">
        <div className="w-full h-[1px] bg-zinc-800" />
      </div>
    );
  }

  const min = Math.min(...history);
  const max = Math.max(...history);
  const range = (max - min) || (min * 0.0001) || 1;
  const height = 40;
  const width = 180;
  
  const points = history.map((val, i) => {
    const x = (i / (history.length - 1)) * width;
    const y = height - ((val - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  return (
    <div className="h-[40px] w-full mt-2">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible" preserveAspectRatio="none">
        <polyline
          fill="none"
          stroke="#11b3f5"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
          className="drop-shadow-[0_0_5px_rgba(17,179,245,0.5)]"
        />
      </svg>
    </div>
  );
});

MiniChart.displayName = 'MiniChart';

export default function AdminPriceTracker() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [prices, setPrices] = useState<Record<string, any>>({});
  const [priceHistory, setPriceHistory] = useState<Record<string, number[]>>({});
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const isVerified = localStorage.getItem('adminVerified') === 'true';
    setIsAuthenticated(isVerified);
  }, []);

  /**
   * LIQUIDITY BRIDGE ENGINE
   * Polls external APIs and broadcasts to Firestore.
   */
  const syncLiquidity = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const res = await fetch('/api/terminal/live-prices', { cache: 'no-store' });
      if (!res.ok) throw new Error('API Offline');
      const data = await res.json();
      
      const updateTime = new Date();
      setLastSync(updateTime);

      // Broadcast to Firestore
      for (const [symbol, priceData] of Object.entries(data)) {
        const sym = symbol.toUpperCase();
        if (SYMBOLS.includes(sym)) {
          const docRef = doc(db, 'livePrices', sym);
          setDoc(docRef, {
            ...priceData as any,
            symbol: sym,
            updatedAt: serverTimestamp()
          }, { merge: true }).catch(() => {});
        }
      }
    } catch (err) {
      console.warn('[Bridge] Sync cycle skipped');
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing]);

  // High-frequency polling when tab is active
  useEffect(() => {
    if (!isAuthenticated) return;
    syncLiquidity();
    const interval = setInterval(syncLiquidity, 3000);
    return () => clearInterval(interval);
  }, [isAuthenticated, syncLiquidity]);

  // Real-time listener for UI state and Charting
  useEffect(() => {
    if (!isAuthenticated) return;

    const unsub = onSnapshot(collection(db, 'livePrices'), (snapshot) => {
      const newPrices: Record<string, any> = {};
      
      setPriceHistory(prev => {
        const next = { ...prev };
        snapshot.docs.forEach(d => {
          const docId = d.id.toUpperCase();
          if (SYMBOLS.includes(docId)) {
            const data = d.data();
            newPrices[docId] = data;
            
            if (data.price) {
              const currentHist = next[docId] || [];
              const lastPoint = currentHist[currentHist.length - 1];
              
              // Only add if price changed to keep chart clean
              if (lastPoint !== data.price) {
                next[docId] = [...currentHist, data.price].slice(-60);
              }
            }
          }
        });
        return next;
      });

      setPrices(newPrices);
    });

    return () => unsub();
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <Fingerprint className="w-12 h-12 text-primary/40 mb-4" />
        <h2 className="text-xl font-headline font-bold text-white mb-2">Restricted Access</h2>
        <Button className="mt-8 px-10 rounded-xl font-bold" asChild><a href="/admin">Go to Terminal</a></Button>
      </div>
    );
  }

  const isOandaOnline = prices["XAUUSD"]?.price > 0;
  const isBinanceOnline = prices["BTCUSD"]?.price > 0;

  return (
    <div className="flex min-h-screen bg-background">
      <Navigation />
      <main className="flex-1 p-8 overflow-y-auto custom-scrollbar">
        <header className="mb-10 flex justify-between items-end">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Zap className="w-6 h-6 text-primary fill-primary" />
              <h1 className="text-3xl font-headline font-bold text-white uppercase tracking-tight">System Heartbeat</h1>
            </div>
            <Badge variant="outline" className="text-[10px] font-black uppercase tracking-widest border-primary/30 text-primary">
              Institutional Liquidity Bridge
            </Badge>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden md:block">
              <p className="text-[10px] font-black uppercase text-emerald-500 flex items-center gap-2">
                <ShieldCheck className="w-3 h-3" /> Active Bridge Status
              </p>
              <p className="text-[8px] text-zinc-500 uppercase font-bold tracking-widest">Client broadcast node: ONLINE</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => window.location.reload()} className="h-9 px-4 rounded-xl font-bold">
              <RefreshCw className={cn("w-4 h-4 mr-2", isSyncing && "animate-spin")} /> Refresh UI
            </Button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-12">
          <Card className="lg:col-span-2 relative overflow-hidden bg-emerald-500/5 border-emerald-500/20 shadow-2xl">
             <div className="p-6 flex items-start gap-4">
                <div className="p-3 bg-emerald-500/10 rounded-2xl border border-emerald-500/20">
                   <ShieldCheck className="w-8 h-8 shrink-0 text-emerald-500" />
                </div>
                <div>
                   <h3 className="font-black text-sm uppercase tracking-tight mb-1 text-emerald-500">
                     Autonomous Liquidity Engine
                   </h3>
                   <p className="text-zinc-300 text-xs leading-relaxed font-medium">
                     Market data is automatically synchronized by the server-side cron engine every minute. This browser node provides high-frequency (2s) updates while active.
                   </p>
                </div>
             </div>
          </Card>

          <Card className="bg-card/40 border-border/50">
            <div className="p-6 flex flex-col justify-center items-center h-full">
               <p className="text-[10px] font-black text-zinc-500 uppercase mb-2">Feed Status</p>
               <div className="flex flex-col gap-2 w-full">
                  <div className="flex justify-between items-center bg-zinc-950/50 p-2 rounded-lg border border-white/5">
                    <span className="text-[10px] font-bold text-white">OANDA (FX)</span>
                    <Badge className={cn("h-4 px-2 text-[8px] font-black", isOandaOnline ? "bg-emerald-500/20 text-emerald-500" : "bg-destructive/20 text-destructive")}>
                      {isOandaOnline ? 'ONLINE' : 'OFFLINE'}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center bg-zinc-950/50 p-2 rounded-lg border border-white/5">
                    <span className="text-[10px] font-bold text-white">BINANCE (CRYPTO)</span>
                    <Badge className={cn("h-4 px-2 text-[8px] font-black", isBinanceOnline ? "bg-emerald-500/20 text-emerald-500" : "bg-destructive/20 text-destructive")}>
                      {isBinanceOnline ? 'ONLINE' : 'OFFLINE'}
                    </Badge>
                  </div>
               </div>
            </div>
          </Card>

          <Card className="bg-card/40 border-border/50">
            <div className="p-6 text-center flex flex-col justify-center items-center h-full">
               <p className="text-[10px] font-black text-zinc-500 uppercase mb-1">Local Pulse</p>
               <h4 className="text-2xl font-headline font-bold text-white tabular-nums flex items-center gap-2">
                 <Clock className="w-4 h-4 text-primary" />
                 {lastSync ? format(lastSync, 'HH:mm:ss') : '--:--:--'}
               </h4>
               <p className="text-[8px] text-zinc-600 font-bold uppercase mt-1">Updates every 3s</p>
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4 mb-20">
          {SYMBOLS.map(sym => {
            const data = prices[sym];
            const priceFormatted = data?.price ? data.price.toLocaleString(undefined, { 
              minimumFractionDigits: sym.includes('JPY') ? 3 : (sym.includes('USD') && !['BTCUSD', 'ETHUSD', 'BNBUSD'].includes(sym) ? 5 : 2) 
            }) : '---';

            return (
              <Card key={sym} className="bg-card/30 border-border/50 p-4 hover:border-primary/30 transition-all group">
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between items-end mb-1">
                    <span className="font-bold text-white text-xs group-hover:text-primary transition-colors">{sym}</span>
                    <span className="font-mono text-[10px] text-primary tabular-nums">
                      {priceFormatted}
                    </span>
                  </div>
                  <MiniChart history={priceHistory[sym] || []} />
                </div>
              </Card>
            );
          })}
        </div>

        <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 flex items-center gap-3">
          <Activity className="w-4 h-4 text-primary animate-pulse" />
          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
            Trading nodes are currently listening to this heartbeat. Maintain this window for high-performance terminal liquidity.
          </p>
        </div>
      </main>
    </div>
  );
}
