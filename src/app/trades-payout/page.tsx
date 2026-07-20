"use client";

import { useMemo, memo } from 'react';
import { Navigation } from '@/components/Navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Wallet, Trophy, Info, ExternalLink } from 'lucide-react';
import { useCollection } from '@/firebase';
import { orderBy, where } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

const StatBox = memo(function StatBox({ title, value, icon, color = 'primary' }: { title: string, value: string, icon: any, color?: string }) {
  return (
    <Card className={cn(color === 'accent' ? "bg-accent/5 border-accent/20" : "")}>
      <CardContent className="pt-6">
        <div className="flex justify-between items-start mb-4">
          <p className={cn("text-xs font-bold uppercase tracking-widest", color === 'accent' ? "text-accent" : "text-muted-foreground")}>{title}</p>
          <div className={color === 'accent' ? "text-accent" : "text-primary"}>{icon}</div>
        </div>
        <h3 className="text-4xl font-headline font-bold mb-2">{value}</h3>
      </CardContent>
    </Card>
  );
});

export default function TradesPayoutPage() {
  const { data: featuredPayouts, loading } = useCollection<any>(
    'payouts',
    useMemo(() => [
      where('isFeatured', '==', true),
      orderBy('createdAt', 'desc')
    ], [])
  );

  const totalPaidOut = useMemo(() => {
    return featuredPayouts.reduce((acc, curr) => acc + (parseFloat(curr.paidOut) || 0), 0);
  }, [featuredPayouts]);

  return (
    <div className="flex min-h-screen bg-background">
      <Navigation />
      <main className="flex-1 p-8 overflow-y-auto custom-scrollbar">
        <header className="mb-10">
          <h1 className="text-3xl font-headline font-bold mb-1 text-white uppercase tracking-tighter">Funded Trader Payouts</h1>
          <p className="text-muted-foreground">Verified institutional distributions and performance leaderboard.</p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <StatBox 
            title="Total Paid Out" 
            value={`$${totalPaidOut.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} 
            icon={<Wallet className="w-5 h-5" />} 
          />
          <StatBox 
            title="Verified Traders" 
            value={(featuredPayouts?.length || 0).toString()} 
            icon={<Trophy className="w-5 h-5" />} 
            color="accent"
          />
        </div>

        <Card className="border-border/50 bg-card/40 backdrop-blur-sm shadow-2xl">
          <CardHeader className="border-b border-white/5 pb-4">
            <CardTitle className="text-lg flex items-center gap-2 text-white">
              <Trophy className="w-5 h-5 text-accent" /> Institutional Leaderboard
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-black tracking-widest border-b border-white/5">
                  <tr>
                    <th className="py-4 px-6">Rank</th>
                    <th className="py-4 px-6">Name</th>
                    <th className="py-4 px-6">Country</th>
                    <th className="py-4 px-6 text-right">Paid Out</th>
                    <th className="py-4 px-6 text-center">No. of Payouts</th>
                    <th className="py-4 px-6 text-right">Proof</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {loading ? (
                    [1, 2, 3, 4, 5].map(i => (
                      <tr key={i} className="animate-pulse">
                        <td colSpan={6} className="py-6 px-6"><Skeleton className="h-4 w-full bg-secondary/50 rounded" /></td>
                      </tr>
                    ))
                  ) : featuredPayouts.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-20 text-center text-muted-foreground italic flex flex-col items-center gap-4">
                        <Info className="w-12 h-12 opacity-20" />
                        <span>No featured payouts recorded yet.</span>
                      </td>
                    </tr>
                  ) : (
                    featuredPayouts.map((p, index) => {
                      const rank = index + 1;
                      return (
                        <tr key={p.id} className="hover:bg-primary/5 transition-colors group">
                          <td className="py-4 px-6">
                            <Badge variant="outline" className={cn(
                              "w-8 h-8 rounded-full flex items-center justify-center p-0 font-black text-xs",
                              rank === 1 ? "bg-amber-500/20 text-amber-500 border-amber-500/50" :
                              rank === 2 ? "bg-zinc-400/20 text-zinc-400 border-zinc-400/50" :
                              rank === 3 ? "bg-orange-600/20 text-orange-600 border-orange-600/50" :
                              "border-border"
                            )}>
                              {rank}
                            </Badge>
                          </td>
                          <td className="py-4 px-6 font-bold text-white uppercase tracking-tight">{p.traderName}</td>
                          <td className="py-4 px-6 text-zinc-400 text-xs">
                             <div className="flex items-center gap-2">
                                <span className="text-base">{p.countryFlag}</span>
                                <span>{p.country}</span>
                             </div>
                          </td>
                          <td className="py-4 px-6 text-right font-mono font-bold text-emerald-500">
                            ${(parseFloat(p.paidOut) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-4 px-6 text-center">
                            <Badge variant="outline" className="bg-secondary/50 text-[10px] h-6 px-3">{p.totalPayouts}</Badge>
                          </td>
                          <td className="py-4 px-6 text-right">
                            {p.proofUrl ? (
                              <a 
                                href={p.proofUrl} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase text-primary hover:text-white transition-colors"
                              >
                                View Proof <ExternalLink className="w-3 h-3" />
                              </a>
                            ) : (
                              <span className="text-[10px] text-zinc-600 font-bold uppercase">Pending</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}