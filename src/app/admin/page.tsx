"use client";

import { useState, useMemo, useEffect, memo } from 'react';
import { Navigation } from '@/components/Navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Users, Activity, Search, Loader2, DollarSign, ChevronLeft, Terminal, Database, ShieldCheck, Wand2, RefreshCw, BarChart2, Monitor, Clock, AlertOctagon
} from 'lucide-react';
import { fetchAdminTerminalData, advanceTraderPhaseAction, updateOrderStatusAction, updatePayoutStatusAction, processKycAction, resetDemoAccountAction, fetchDemoTradesByAccount } from './actions';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { getTradeDate } from '@/lib/tradeUtils';

const StatCard = memo(function StatCard({ title, value, icon, color }: { title: string, value: string | number, icon: any, color: string }) {
  const colors: any = {
    blue: 'text-primary bg-primary/10 border-primary/20',
    purple: 'text-purple-500 bg-purple-500/10 border-purple-500/20',
    green: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
    amber: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
  };
  return (
    <Card className="border-border/50 bg-card/30 hover:border-primary/20 transition-all duration-300 group">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className={cn("p-2 rounded-lg border", colors[color])}>{icon}</div>
          <Badge variant="outline" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground border-white/10">LIVE</Badge>
        </div>
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">{title}</p>
        <h3 className="text-3xl font-headline font-bold text-white group-hover:text-primary transition-colors">{value}</h3>
      </CardContent>
    </Card>
  );
});

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [adminError, setAdminError] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [adminData, setAdminData] = useState<any>({ users: [], orders: [], payouts: [], referrals: [], broadcasts: [], breaches: [], demoAccounts: [], demoTrades: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const { toast } = useToast();

  const [selectedDemoAccount, setSelectedDemoAccount] = useState<any>(null);
  const [demoTrades, setDemoTrades] = useState<any[]>([]);
  const [tradesLoading, setTradesLoading] = useState(false);
  const [isTradesModalOpen, setIsTradesModalOpen] = useState(false);
  const [demoFilter, setDemoFilter] = useState<'all' | 'active' | 'blown' | 'passed'>('all');

  useEffect(() => {
    const isVerified = localStorage.getItem('adminVerified') === 'true';
    if (isVerified) setIsAuthenticated(true);
    else setShowAdminModal(true);
  }, []);

  const refreshData = async () => {
    setIsLoading(true);
    const res = await fetchAdminTerminalData();
    if (res.success) setAdminData(res);
    else toast({ variant: "destructive", title: "Sync Error", description: "Failed to fetch terminal data." });
    setIsLoading(false);
  };

  useEffect(() => { if (isAuthenticated) refreshData(); }, [isAuthenticated]);

  const handleAdminAuth = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPasswordInput === "93463962569392846256") {
      setIsAuthenticated(true);
      setShowAdminModal(false);
      localStorage.setItem('adminVerified', 'true');
      document.cookie = 'admin_master=93463962569392846256; path=/; max-age=86400';
      toast({ title: "Admin Access Granted" });
    } else {
      setAdminError("❌ Access Denied");
      setAdminPasswordInput('');
    }
  };

  const handleRunMigration = async () => {
    if (!confirm("Run Institutional Data Migration? This will backfill missing fields for the risk engine.")) return;
    setActionLoading(true);
    try {
      const res = await fetch('/api/admin/migrate-accounts?key=93463962569392846256');
      const data = await res.json();
      if (data.success) {
        toast({ title: "Migration Successful", description: `Updated ${data.updated} accounts.` });
        refreshData();
      } else {
        throw new Error(data.error || "Migration failed");
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleViewDemoTrades = async (acc: any) => {
    setSelectedDemoAccount(acc);
    setIsTradesModalOpen(true);
    setTradesLoading(true);
    try {
      const trades = await fetchDemoTradesByAccount(acc.id);
      setDemoTrades(trades);
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: "Failed to fetch trades." });
    } finally {
      setTradesLoading(false);
    }
  };

  const stats = useMemo(() => {
    const accounts = adminData.demoAccounts || [];
    return { 
      totalTraders: adminData.users.length, 
      totalAccounts: accounts.length,
      activeAccounts: accounts.filter((a: any) => a.status === 'active').length,
      blownAccounts: accounts.filter((a: any) => a.status === 'blown').length,
      passedAccounts: accounts.filter((a: any) => a.status === 'passed').length,
      openPositions: adminData.demoTrades?.filter((t: any) => t.status === 'open').length || 0,
      totalVolume: accounts.reduce((acc: number, a: any) => acc + (a.equity || 0), 0)
    };
  }, [adminData]);

  const filteredDemoAccounts = useMemo(() => {
    if (!adminData.demoAccounts) return [];
    return adminData.demoAccounts.filter((acc: any) => {
      const matchesStatus = demoFilter === 'all' || acc.status === demoFilter;
      const matchesSearch = !searchTerm || 
        acc.userId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        acc.id.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesStatus && matchesSearch;
    });
  }, [adminData.demoAccounts, demoFilter, searchTerm]);

  return (
    <div className="flex min-h-screen bg-background">
      <Navigation />
      <main className="flex-1 flex flex-col">
        <div className="p-8 shrink-0">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h1 className="text-4xl font-headline font-bold mb-1 text-white">Administrative Terminal</h1>
              <p className="text-muted-foreground text-sm">Managing institutional trading nodes and risk compliance.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleRunMigration} disabled={actionLoading}>
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Wand2 className="w-4 h-4 mr-2" />}
                Run Migration
              </Button>
              <Button variant="outline" size="sm" onClick={refreshData} disabled={isLoading}>
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Database className="w-4 h-4 mr-2" />}Sync Network
              </Button>
            </div>
          </div>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="bg-secondary/50 h-12">
              <TabsTrigger value="overview" className="font-bold">Overview</TabsTrigger>
              <TabsTrigger value="demo_nodes" className="font-bold">Trading Nodes</TabsTrigger>
              <TabsTrigger value="orders" className="font-bold">Orders</TabsTrigger>
              <TabsTrigger value="payouts" className="font-bold">Payouts</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex-1 overflow-y-auto p-8 pt-0">
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <StatCard title="Active Nodes" value={stats.activeAccounts} icon={<Terminal />} color="blue" />
              <StatCard title="Open Positions" value={stats.openPositions} icon={<Activity />} color="purple" />
              <StatCard title="Total Volume" value={`$${(stats.totalVolume / 1000000).toFixed(1)}M`} icon={<DollarSign />} color="green" />
              <StatCard title="Network Size" value={stats.totalAccounts} icon={<Monitor />} color="amber" />
            </div>
          )}

          {activeTab === 'demo_nodes' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <div className="flex bg-secondary p-1 rounded-lg">
                  {['all', 'active', 'blown', 'passed'].map(f => (
                    <button key={f} onClick={() => setDemoFilter(f as any)} className={cn("px-4 py-1.5 rounded text-[10px] font-black uppercase", demoFilter === f ? "bg-primary text-black" : "text-muted-foreground")}>{f}</button>
                  ))}
                </div>
                <Input placeholder="Search user ID..." className="max-w-xs h-10 bg-secondary/50" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
              </div>
              <Card className="bg-card/40 border-border/50">
                <CardContent className="p-0">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-bold">
                      <tr><th className="p-4">Trader</th><th className="p-4">Balance</th><th className="p-4">Daily Start</th><th className="p-4">Plan</th><th className="p-4">Status</th><th className="p-4 text-right">Action</th></tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {filteredDemoAccounts.map((acc: any) => (
                        <tr key={acc.id} className="hover:bg-primary/5 transition-colors">
                          <td className="p-4 font-mono text-xs">{acc.userId.slice(0, 12)}...</td>
                          <td className="p-4 font-bold text-white">${acc.balance.toLocaleString()}</td>
                          <td className="p-4 font-mono text-xs text-muted-foreground">${acc.dailyStartBalance?.toLocaleString() || '—'}</td>
                          <td className="p-4 text-[10px] uppercase font-bold">{acc.planType || 'LEGACY'}</td>
                          <td className="p-4">
                            <Badge className={cn("uppercase text-[9px]", acc.status === 'active' ? "bg-emerald-500/20 text-emerald-500" : "bg-destructive/20 text-destructive")}>
                              {acc.status}
                            </Badge>
                          </td>
                          <td className="p-4 text-right">
                            <Button variant="ghost" size="sm" onClick={() => handleViewDemoTrades(acc)}><BarChart2 className="w-4 h-4" /></Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </main>

      <Dialog open={showAdminModal} onOpenChange={setShowAdminModal}>
        <DialogContent className="bg-black/95 border-primary/30 text-white">
          <DialogHeader><DialogTitle className="text-center">System Authorization</DialogTitle></DialogHeader>
          <form onSubmit={handleAdminAuth} className="space-y-6 pt-4">
            <Input type="password" value={adminPasswordInput} onChange={(e) => setAdminPasswordInput(e.target.value)} placeholder="••••••••" className="h-14 text-center text-2xl font-mono" autoFocus />
            <Button type="submit" className="w-full h-14 font-black cyan-box-glow">AUTHENTICATE</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
