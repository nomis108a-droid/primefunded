'use client';

import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { Navigation } from '@/components/Navigation';
import { ADMIN_EMAILS } from '@/lib/admin';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Users, 
  Activity, 
  Skull, 
  Trophy, 
  DollarSign, 
  Search, 
  Loader2, 
  Filter,
  Calendar,
  Clock,
  ExternalLink,
  ShieldCheck
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

export default function AdminDemoPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'blown' | 'passed'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // 1. Authorization Guard
  useEffect(() => {
    if (!authLoading) {
      if (!user || !ADMIN_EMAILS.includes(user.email || "")) {
        router.replace('/dashboard');
      }
    }
  }, [user, authLoading, router]);

  // 2. Fetch Data
  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/demo-accounts', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error('Failed to fetch admin data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && ADMIN_EMAILS.includes(user.email || "")) {
      fetchData();
    }
  }, [user]);

  // 3. Filtering Logic
  const filteredAccounts = useMemo(() => {
    if (!data?.accounts) return [];
    return data.accounts.filter((acc: any) => {
      const matchesStatus = filter === 'all' || acc.status === filter;
      const matchesSearch = !searchTerm || 
        acc.userId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        acc.id.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesStatus && matchesSearch;
    });
  }, [data, filter, searchTerm]);

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
            <ShieldCheck className="w-6 h-6 text-primary" />
            <h1 className="text-3xl font-headline font-bold text-white">Demo Account Monitor</h1>
          </div>
          <p className="text-muted-foreground">Global administrative oversight of virtual trading environments.</p>
        </header>

        {loading ? (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {[1, 2, 3, 4].map(i => <Card key={i} className="h-32 bg-secondary/20 animate-pulse" />)}
            </div>
            <Card className="h-96 bg-secondary/10 animate-pulse" />
          </div>
        ) : (
          <div className="space-y-8">
            {/* Stats Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <StatCard title="Total Accounts" value={data?.stats.total} icon={<Users />} color="blue" />
              <StatCard title="Active" value={data?.stats.active} icon={<Activity />} color="emerald" />
              <StatCard title="Blown" value={data?.stats.blown} icon={<Skull />} color="red" />
              <StatCard title="Passed" value={data?.stats.passed} icon={<Trophy />} color="amber" />
              <StatCard title="Total Volume" value={`$${(data?.stats.volume / 1000000).toFixed(1)}M`} icon={<DollarSign />} color="purple" />
            </div>

            {/* Controls */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div className="flex items-center gap-2 bg-secondary/50 p-1 rounded-xl border border-border">
                <FilterButton active={filter === 'all'} onClick={() => setFilter('all')}>All</FilterButton>
                <FilterButton active={filter === 'active'} onClick={() => setFilter('active')}>Active</FilterButton>
                <FilterButton active={filter === 'blown'} onClick={() => setFilter('blown')}>Blown</FilterButton>
                <FilterButton active={filter === 'passed'} onClick={() => setFilter('passed')}>Passed</FilterButton>
              </div>
              <div className="relative w-full md:w-80">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input 
                  placeholder="Search User ID..." 
                  className="pl-10 bg-secondary/30 border-border" 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            {/* Main Table */}
            <Card className="border-border/50 bg-card/40 overflow-hidden">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-black tracking-widest">
                      <tr>
                        <th className="py-4 px-6">User / Account</th>
                        <th className="py-4 px-4">Plan</th>
                        <th className="py-4 px-4 text-right">Balance</th>
                        <th className="py-4 px-4 text-right">Equity</th>
                        <th className="py-4 px-4 text-right">P&L</th>
                        <th className="py-4 px-4">Created</th>
                        <th className="py-4 px-6 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {filteredAccounts.map((acc: any) => {
                        const pnl = acc.equity - acc.startBalance;
                        const pnlPercent = (pnl / acc.startBalance) * 100;
                        return (
                          <tr key={acc.id} className="hover:bg-primary/5 transition-colors group">
                            <td className="py-4 px-6">
                              <p className="font-mono text-xs text-primary font-bold">{acc.userId.slice(0, 8)}...</p>
                              <p className="text-[10px] text-muted-foreground font-mono">{acc.id}</p>
                            </td>
                            <td className="py-4 px-4">
                              <Badge variant="outline" className="text-[9px] font-black uppercase border-white/10">{acc.plan}</Badge>
                            </td>
                            <td className="py-4 px-4 text-right font-mono font-bold text-white">
                              ${acc.balance.toLocaleString()}
                            </td>
                            <td className="py-4 px-4 text-right font-mono font-bold text-white">
                              ${acc.equity.toLocaleString()}
                            </td>
                            <td className={cn(
                              "py-4 px-4 text-right font-mono font-bold",
                              pnl >= 0 ? "text-emerald-500" : "text-destructive"
                            )}>
                              {pnl >= 0 ? '+' : ''}{pnl.toLocaleString()}
                              <span className="text-[8px] ml-1 opacity-70">({pnlPercent.toFixed(1)}%)</span>
                            </td>
                            <td className="py-4 px-4 text-muted-foreground text-xs">
                              {acc.createdAt ? format(new Date(acc.createdAt), 'MMM d, HH:mm') : '—'}
                            </td>
                            <td className="py-4 px-6 text-right">
                              <Badge className={cn(
                                "uppercase text-[9px] font-black px-2",
                                acc.status === 'active' ? "bg-emerald-500/20 text-emerald-500" :
                                acc.status === 'blown' ? "bg-destructive/20 text-destructive" :
                                "bg-amber-500/20 text-amber-500"
                              )}>
                                {acc.status}
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                      {filteredAccounts.length === 0 && (
                        <tr>
                          <td colSpan={7} className="py-20 text-center text-muted-foreground italic">
                            No accounts match the current filter.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}

function StatCard({ title, value, icon, color }: { title: string, value: any, icon: any, color: string }) {
  const colorMap: any = {
    blue: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    emerald: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    red: 'bg-destructive/10 text-destructive border-destructive/20',
    amber: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    purple: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  };
  return (
    <Card className="bg-secondary/20 border-border/50">
      <CardContent className="p-5">
        <div className="flex justify-between items-center mb-3">
          <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">{title}</span>
          <div className={cn("p-1.5 rounded-lg border", colorMap[color])}>{icon}</div>
        </div>
        <p className="text-2xl font-headline font-bold text-white">{value}</p>
      </CardContent>
    </Card>
  );
}

function FilterButton({ active, onClick, children }: { active: boolean, onClick: () => void, children: React.ReactNode }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "px-4 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all",
        active ? "bg-primary text-black" : "text-muted-foreground hover:text-white"
      )}
    >
      {children}
    </button>
  );
}
