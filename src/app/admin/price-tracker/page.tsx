
'use client';

import { useEffect, useState, memo, useCallback, useRef } from 'react';
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
import Link from 'next/link';

const SYMBOLS = [
  "XAUUSD", "XAGUSD", "XPTUSD", "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCHF", "USDCAD", "NZDUSD",
  "BTCUSD", "ETHUSD", "SOLUSD", "XRPUSD", "BNBUSD", "DOGEUSD", "ADAUSD"
];

const MiniChart = memo(({ history }: { history: number[] }) => {
  if (!history || history.length < 2) return <div className="h-[40px] w-full border-b border-zinc-800" />;
  const min = Math.min(...history);
  const max = Math.max(...history);
  const range = (max - min) || (min * 0.0001);
  const h = 40;
  const w = 200;
  const pts = history.map((val, i) => `${(i / (history.length - 1)) * w},${h - ((val - min) / range) * h}`).join(' ');
  return (
    <div className="h-[40px] w-full mt-2">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-full overflow-visible" preserveAspectRatio="none">
        <polyline fill="none" stroke="#11b3f5" strokeWidth="1.5" points={pts} className="drop-shadow-[0_0_5px_rgba(17,179,245,0.4)]" />
      </svg>
    </div>
  );
});

MiniChart.displayName = 'MiniChart';

export default function AdminPriceTracker() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [prices, setPrices] = useState<Record<string, any>>({});
  const [history, setHistory] = useState<Record<string, number[]>>({}); 
  const [isSyncing, setIsSyncing] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const isVerified = localStorage.getItem('adminVerified') === 'true';
    setIsAuthenticated(isVerified);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    setIsSyncing(true);
    const unsub = onSnapshot(collection(db, 'livePrices'), (snapshot) => {
      const newPrices: Record<string, any> = {};
      setHistory(prev => {
        const next = { ...prev };
        snapshot.docs.forEach(d => {
          const sym = d.id.toUpperCase();
          if (SYMBOLS.includes(sym)) {
            const data = d.data();
            newPrices[sym] = data;
            if (data.price) {
              const current = next[sym] || [];
              if (current[current.length - 1] !== data.price) {
                next[sym] = [...current, data.price].slice(-30);
              }
            }
          }
        });
        return next;
      });
      setPrices(prev => ({ ...prev, ...newPrices }));
      setIsSyncing(false);
    }, (err) => {
      toast({ variant: "destructive", title: "Stream Failure", description: err.message });
    });
    return () => unsub();
  }, [isAuthenticated, toast]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <Fingerprint className="w-12 h-12 text-primary/40 mb-4" />
        <h2 className="text-xl font-headline font-bold text-white mb-2">Restricted Access</h2>
        <Button className="mt-8 px-10 rounded-xl font-bold" asChild><Link href="/admin">Go to Terminal</Link></Button>
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
            <Badge variant="outline" className="text-[10px] font-black uppercase tracking-widest border-primary/30 text-primary">Institutional Liquidity Monitor</Badge>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-[10px] font-black uppercase text-emerald-500 flex items-center gap-2 justify-end"><ShieldCheck className="w-3 h-3" /> System Status: HEALTHY</p>
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
            const hist = history[sym] || [];
            const isForex = !['XAUUSD', 'XAGUSD', 'XPTUSD', 'BTCUSD', 'ETHUSD', 'SOLUSD', 'BNBUSD'].includes(sym);
            const format = (v: number) => v ? v.toLocaleString(undefined, { minimumFractionDigits: isForex ? 5 : 2 }) : '---';

            return (
              <Card key={sym} className="bg-card/30 border-border/50 p-4 hover:border-primary/30 transition-all group">
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between items-end mb-1">
                    <span className="font-bold text-white text-xs group-hover:text-primary transition-colors">{sym}</span>
                    <span className="font-mono text-[10px] text-primary tabular-nums">{format(data?.price)}</span>
                  </div>
                  <MiniChart history={hist} />
                  <div className="flex justify-between mt-2 pt-2 border-t border-white/5">
                     <div className="flex flex-col"><span className="text-[7px] text-zinc-600 font-black uppercase">Bid</span><span className="text-[9px] font-mono text-zinc-400">{format(data?.bid)}</span></div>
                     <div className="flex flex-col items-end"><span className="text-[7px] text-zinc-600 font-black uppercase">Ask</span><span className="text-[9px] font-mono text-zinc-400">{format(data?.ask)}</span></div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </main>
    </div>
  );
}
