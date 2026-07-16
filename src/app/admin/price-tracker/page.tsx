
'use client';

import { useEffect, useState, memo } from 'react';
import { Navigation } from '@/components/Navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Zap,
  RefreshCw,
  ShieldCheck,
  Fingerprint
} from 'lucide-react';
import { rtdb } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';
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
    if (!isAuthenticated || !rtdb) return;
    setIsSyncing(true);
    
    const pricesRef = ref(rtdb, 'livePrices');
    // RTDB uses onValue, not onSnapshot
    const unsub = onValue(pricesRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) return;

      const newPrices: Record<string, any> = {};
      setHistory(prev => {
        const next = { ...prev };
        Object.entries(data).forEach(([key, tick]: [string, any]) => {
          const sym = key.toUpperCase();
          if (SYMBOLS.includes(sym)) {
            newPrices[sym] = tick;
            if (tick.price) {
              const current = next[sym] || [];
              if (current[current.length - 1] !== tick.price) {
                next[sym] = [...current, tick.price].slice(-30);
              }
            }
          }
        });
        return next;
      });
      setPrices(prev => ({ ...prev, ...newPrices }));
      setIsSyncing(false);
    }, (err: any) => {
      toast({ variant: "destructive", title: "RTDB Heartbeat Failure", description: err.message });
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
    <div className="flex min-h-screen bg-[#0a0a0a]">
      <Navigation />
      <main className="flex-1 p-8 overflow-y-auto custom-scrollbar">
        <header className="mb-12 flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-[0_0_20px_rgba(17,179,245,0.2)]">
                <Zap size={22} className="fill-current" />
              </div>
              <h1 className="text-4xl font-headline font-bold text-white tracking-tight uppercase italic">SYSTEM HEARTBEAT</h1>
            </div>
            <div className="relative inline-block pb-2">
              <p className="text-[11px] font-black uppercase tracking-[0.3em] text-primary/80">Institutional Liquidity Monitor</p>
              <div className="absolute bottom-0 left-0 w-full h-0.5 bg-primary/40" />
            </div>
          </div>
          
          <div className="flex flex-col items-end gap-3">
            <div className="flex items-center gap-6">
              <div className="text-right">
                <p className="text-[10px] font-black uppercase text-zinc-500 tracking-widest mb-1">DATA FLOW</p>
                <p className="text-xs font-bold text-white flex items-center gap-2">
                  BACKGROUND SYNC NODES: <span className="text-emerald-500">ACTIVE</span>
                </p>
              </div>
              <Badge variant="outline" className="h-10 px-6 bg-emerald-500/10 border-emerald-500/30 text-emerald-500 flex items-center gap-2 rounded-xl shadow-[0_0_15px_rgba(16,185,129,0.1)]">
                <ShieldCheck className="w-4 h-4" />
                <span className="text-[10px] font-black uppercase tracking-widest">SYSTEM STATUS: HEALTHY</span>
              </Badge>
            </div>
            <Button variant="outline" size="sm" onClick={() => window.location.reload()} className="h-10 px-6 rounded-xl font-black text-[10px] uppercase tracking-widest border-white/10 hover:bg-white/5">
              <RefreshCw className={cn("w-4 h-4 mr-2", isSyncing && "animate-spin")} /> Refresh UI
            </Button>
          </div>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 mb-20">
          {SYMBOLS.map(sym => {
            const data = prices[sym];
            const hist = history[sym] || [];
            const isForex = !['XAUUSD', 'XAGUSD', 'XPTUSD', 'BTCUSD', 'ETHUSD', 'SOLUSD', 'BNBUSD'].includes(sym);
            const formatValue = (v: number) => v ? v.toLocaleString(undefined, { minimumFractionDigits: isForex ? 5 : 2 }) : '---';

            return (
              <Card key={sym} className="bg-zinc-900/40 border-zinc-800/60 p-6 hover:border-primary/40 transition-all group relative overflow-hidden shadow-xl">
                <div className="absolute top-0 right-0 w-16 h-16 bg-primary/5 blur-2xl -mr-8 -mt-8 rounded-full group-hover:bg-primary/10 transition-colors" />
                
                <div className="flex flex-col gap-4">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <span className="font-headline font-black text-lg text-white group-hover:text-primary transition-colors tracking-tight">{sym}</span>
                      <p className="text-[8px] font-bold text-zinc-500 uppercase tracking-widest">Live Execution</p>
                    </div>
                    <div className="text-right">
                      <span className="font-mono text-base font-black text-primary tabular-nums drop-shadow-[0_0_8px_rgba(17,179,245,0.3)]">{formatValue(data?.price)}</span>
                      {data?.updatedAt && (
                        <p className="text-[7px] text-zinc-600 font-bold uppercase mt-1">Tick: {new Date(data.updatedAt).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}</p>
                      )}
                    </div>
                  </div>

                  <div className="relative">
                    <MiniChart history={hist} />
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
                     <div className="space-y-1">
                        <span className="text-[8px] text-zinc-600 font-black uppercase tracking-widest">Bid Price</span>
                        <p className="text-[11px] font-mono font-bold text-zinc-400 tabular-nums">{formatValue(data?.bid)}</p>
                     </div>
                     <div className="space-y-1 text-right">
                        <span className="text-[8px] text-zinc-600 font-black uppercase tracking-widest">Ask Price</span>
                        <p className="text-[11px] font-mono font-bold text-zinc-400 tabular-nums">{formatValue(data?.ask)}</p>
                     </div>
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
