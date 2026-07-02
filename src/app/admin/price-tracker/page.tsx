'use client';

import { useEffect, useState, memo } from 'react';
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
  Fingerprint
} from 'lucide-react';
import { db } from '@/lib/firebase';
import { onSnapshot, collection } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

/**
 * @fileOverview Institutional Price Monitor (Heartbeat Dashboard)
 * Monitors server-side automated price sync jobs with real-time SVG charts.
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
  const range = max - min || 1;
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

  useEffect(() => {
    const isVerified = localStorage.getItem('adminVerified') === 'true';
    setIsAuthenticated(isVerified);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;

    // Listen to all symbols in real-time from Firestore
    const unsub = onSnapshot(collection(db, 'livePrices'), (snapshot) => {
      const newPrices: Record<string, any> = {};
      let latestDate = null;

      setPriceHistory(prev => {
        const next = { ...prev };
        snapshot.docs.forEach(d => {
          const docId = d.id.toUpperCase();
          if (SYMBOLS.includes(docId)) {
            const data = d.data();
            newPrices[docId] = data;
            
            if (data.price) {
              const currentHist = next[docId] || [];
              const lastVal = currentHist[currentHist.length - 1];
              
              // Add point if price changed
              if (lastVal !== data.price) {
                next[docId] = [...currentHist, data.price].slice(-60);
              }
            }

            if (data.updatedAt) {
              const date = data.updatedAt.toDate();
              if (!latestDate || date > latestDate) latestDate = date;
            }
          }
        });
        return next;
      });

      setPrices(prev => ({ ...prev, ...newPrices }));
      if (latestDate) setLastSync(latestDate);
    }, (err) => {
      console.error("[PriceTracker] Sync Error:", err);
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
              Institutional Monitoring Node
            </Badge>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden md:block">
              <p className="text-[10px] font-black uppercase text-emerald-500 flex items-center gap-2">
                <Server className="w-3 h-3" /> Server-Side Sync Active
              </p>
              <p className="text-[8px] text-zinc-500 uppercase font-bold tracking-widest">Autonomous operation enabled</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => window.location.reload()} className="h-9 px-4 rounded-xl font-bold">
              <RefreshCw className="w-4 h-4 mr-2" /> Refresh State
            </Button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-12">
          <Card className="lg:col-span-2 relative overflow-hidden bg-emerald-500/5 border-emerald-500/20">
             <div className="p-6 flex items-start gap-4">
                <ShieldCheck className="w-8 h-8 shrink-0 text-emerald-500" />
                <div>
                   <h3 className="font-black text-sm uppercase tracking-tight mb-1 text-emerald-500">
                     Autonomous Liquidity Engine
                   </h3>
                   <p className="text-zinc-300 text-xs leading-relaxed font-medium">
                     Market data is automatically synchronized by the server-side cron engine every minute. You do not need to keep this tab open to maintain trading operations.
                   </p>
                </div>
             </div>
          </Card>

          <Card className="bg-card/40 border-border/50">
            <div className="p-6 flex flex-col justify-center items-center h-full">
               <p className="text-[10px] font-black text-zinc-500 uppercase mb-1">Network Status</p>
               <div className="flex items-center gap-2">
                 <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse" />
                 <h4 className="text-lg font-bold text-white uppercase">Operational</h4>
               </div>
            </div>
          </Card>

          <Card className="bg-card/40 border-border/50">
            <div className="p-6 text-center flex flex-col justify-center items-center h-full">
               <p className="text-[10px] font-black text-zinc-500 uppercase mb-1">Last Server Tick</p>
               <h4 className="text-2xl font-headline font-bold text-white tabular-nums flex items-center gap-2">
                 <Clock className="w-4 h-4 text-primary" />
                 {lastSync ? format(lastSync, 'HH:mm:ss') : '--:--:--'}
               </h4>
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          {SYMBOLS.map(sym => {
            const data = prices[sym];
            const priceFormatted = data?.price ? data.price.toLocaleString(undefined, { 
              minimumFractionDigits: sym.includes('JPY') ? 3 : (sym.includes('USD') && !['BTCUSD', 'ETHUSD', 'BNBUSD'].includes(sym) ? 5 : 2) 
            }) : '---';

            return (
              <Card key={sym} className="bg-card/30 border-border/50 p-4 hover:border-primary/30 transition-colors">
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between items-end mb-1">
                    <span className="font-bold text-white text-xs">{sym}</span>
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
      </main>
    </div>
  );
}
