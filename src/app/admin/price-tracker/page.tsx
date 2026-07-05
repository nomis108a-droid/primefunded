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
  Fingerprint,
  Activity,
  AlertTriangle
} from 'lucide-react';
import { db } from '@/lib/firebase';
import { onSnapshot, collection } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

/**
 * @fileOverview Institutional Price Monitor
 * Performance Fix: Removed redundant client-side Firestore writes.
 * This page now only monitors live data synced by server background tasks.
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
          className="drop-shadow-[0_0_5px_rgba(17,179,245,0.5)] transition-all duration-300"
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
  const [isSyncing, setIsSyncing] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const isVerified = localStorage.getItem('adminVerified') === 'true';
    setIsAuthenticated(isVerified);
  }, []);

  const fetchStatus = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      // Use API to fetch latest state periodically if listeners are throttled
      const res = await fetch('/api/terminal/live-prices', { cache: 'no-store' });
      if (!res.ok) throw new Error('API Offline');
      const data = await res.json();
      setPrices(prev => ({ ...prev, ...data }));
    } catch (err) {
      console.warn('[Monitor] API sync cycle skipped');
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing]);

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [isAuthenticated, fetchStatus]);

  useEffect(() => {
    if (!isAuthenticated) return;

    // Real-time listener for the dashboard
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
              if (lastPoint !== data.price) {
                next[docId] = [...currentHist, data.price].slice(-60); 
              }
            }
          }
        });
        return next;
      });

      setPrices(prev => ({ ...prev, ...newPrices }));
    }, (err) => {
      console.warn('[Monitor] Firestore listener throttled. Falling back to polling.');
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
              Institutional Liquidity Monitor
            </Badge>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden md:block">
              <p className="text-[10px] font-black uppercase text-emerald-500 flex items-center gap-2">
                <ShieldCheck className="w-3 h-3" /> System Status: HEALTHY
              </p>
              <p className="text-[8px] text-zinc-500 uppercase font-bold tracking-widest">Background Sync Nodes: ACTIVE</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => window.location.reload()} className="h-9 px-4 rounded-xl font-bold">
              <RefreshCw className={cn("w-4 h-4 mr-2", isSyncing && "animate-spin")} /> Refresh UI
            </Button>
          </div>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4 mb-20">
          {SYMBOLS.map(sym => {
            const data = prices[sym];
            const history = priceHistory[sym] || [];
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
                  <MiniChart history={history} />
                </div>
              </Card>
            );
          })}
        </div>
      </main>
    </div>
  );
}
