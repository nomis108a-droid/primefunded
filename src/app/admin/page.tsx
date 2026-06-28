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
import { Textarea } from '@/components/ui/textarea';
import { 
  Eye, Users, ShoppingCart, Wallet, Activity, Search, Loader2, DollarSign, ChevronLeft, Skull, CheckCircle2, ShieldEllipsis, Trophy, Terminal, Database, ShieldCheck, Megaphone, Trash2, Send, Clock, AlertOctagon, BarChart2, Monitor, RefreshCw, ArrowRight, Wand2
} from 'lucide-react';
import { fetchAdminTerminalData, advanceTraderPhaseAction, updateOrderStatusAction, updatePayoutStatusAction, processKycAction, sendGlobalBroadcastAction, resetDemoAccountAction, fetchDemoTradesByAccount } from './actions';
import DashboardPage from '@/app/dashboard/page';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow, isValid } from 'date-fns';
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
          <Badge variant="outline" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground border-white/10">DEMO</Badge>
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
  const [previewUserId, setPreviewUserId] = useState<string | null>(null);
  const [adminData, setAdminData] = useState<any>({ users: [], orders: [], payouts: [], referrals: [], broadcasts: [], breaches: [], demoAccounts: [], demoTrades: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const { toast } = useToast();

  // Demo Node Trades state
  const [selectedDemoAccount, setSelectedDemoAccount] = useState<any>(null);
  const [demoTrades, setDemoTrades] = useState<any[]>([]);
  const [tradesLoading, setTradesLoading] = useState(false);
  const [isTradesModalOpen, setIsTradesModalOpen] = useState(false);
  const [demoFilter, setDemoFilter] = useState<'all' | 'active' | 'blown' | 'passed'>('all');

  // Broadcast Form State
  const [broadcastForm, setBroadcastForm] = useState({ title: '', message: '', type: 'info' });

  useEffect(() => {
    const isVerified = localStorage.getItem('adminVerified') === 'true';
    if (isVerified) setIsAuthenticated(true);
    else setShowAdminModal(true);
    const savedTab = localStorage.getItem('admin_active_tab');
    if (savedTab) setActiveTab(savedTab);
  }, []);

  const refreshData = async () => {
    setIsLoading(true);
    const res = await fetchAdminTerminalData();
    if (res.success) {
      setAdminData(res);
    } else {
      toast({ variant: "destructive", title: "Sync Error", description: "Failed to fetch terminal data." });
    }
    setIsLoading(false);
  };

  useEffect(() => { if (isAuthenticated) refreshData(); }, [isAuthenticated]);

  const handleAdminAuth = (e: React.FormEvent) => {
    e.preventDefault();
    const masterKey = "93463962569392846256";
    if (adminPasswordInput === masterKey) {
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
    if (!confirm("Run institutional data migration? This will backfill telemetry for legacy accounts.")) return;
    setActionLoading(true);
    try {
      const res = await fetch('/api/admin/migrate-accounts?key=93463962569392846256');
      const data = await res.json();
      if (data.success) {
        toast({ title: "Migration Successful", description: `Updated ${data.updated} accounts.` });
        refreshData();
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Migration Failed", description: err.message });
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

  const handleResetDemoAccount = async (accountId: string) => {
    if (!confirm("Confirm administrative reset for this demo node? All progress will be restored to starting balance.")) return;
    setActionLoading(true);
    try {
      const res = await resetDemoAccountAction(accountId);
      if (res.success) {
        toast({ title: "Node Reset Complete" });
        refreshData();
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Reset Failed", description: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleAdvancePhase = async (userId: string) => {
    if (!confirm("Confirm administrative advancement to the next phase?")) return;
    setActionLoading(true);
    const res = await advanceTraderPhaseAction(userId);
    if (res.success) {
      toast({ title: "Phase Advanced Successfully", description: `Trader moved to: ${res.nextPhase?.toUpperCase()}` });
      refreshData();
    } else {
      toast({ variant: "destructive", title: "Advancement Failed" });
    }
    setActionLoading(false);
  };

  const handleUpdateOrderStatus = async (orderId: string, status: string) => {
    setActionLoading(true);
    const res = await updateOrderStatusAction(orderId, status);
    if (res.success) { 
      toast({ title: `Order ${status.toUpperCase()}` }); 
      refreshData(); 
    }
    else { toast({ variant: "destructive", title: "Action Failed" }); }
    setActionLoading(false);
  };

  const handleUpdatePayoutStatus = async (payoutId: string, status: 'approved' | 'rejected' | 'done') => {
    setActionLoading(true);
    const res = await updatePayoutStatusAction(payoutId, status);
    if (res.success) { toast({ title: `Payout ${status.toUpperCase()}` }); refreshData(); }
    else { toast({ variant: "destructive", title: "Action Failed" }); }
    setActionLoading(false);
  };

  const handleUpdateKycStatus = async (userId: string, status: 'verified' | 'rejected') => {
    let reason = "";
    if (status === 'rejected') reason = window.prompt("Enter rejection reason:") || "Documents do not meet institutional requirements.";
    setActionLoading(true);
    const res = await processKycAction(userId, status, reason);
    if (res.success) { toast({ title: `KYC ${status === 'verified' ? 'Approved' : 'Rejected'}` }); refreshData(); }
    else { toast({ variant: "destructive", title: "KYC Update Failed" }); }
    setActionLoading(false);
  };

  const stats = useMemo(() => {
    const verifiedOrders = adminData.orders.filter((o: any) => o.status === 'verified' || o.status === 'approved');
    const totalRevenue = verifiedOrders.reduce((acc: number, o: any) => acc + (parseFloat(o.amountPaid) || 0), 0);
    const accounts = adminData.demoAccounts || [];
    return { 
      totalRevenue, 
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

  const recentActivity = useMemo(() => {
    const activities: any[] = [];
    adminData.users.forEach((u: any) => activities.push({ id: `signup-${u.id}`, type: 'signup', description: `New trader: ${u.name || u.email}`, timestamp: u.createdAt || u.joinDate, icon: <Users className="w-4 h-4 text-purple-500" />, color: 'purple' }));
    adminData.orders.forEach((o: any) => activities.push({ id: `order-${o.id}`, type: 'order', description: `Order submitted: ${o.accountSize} ${o.plan} by ${o.userName || o.email}`, timestamp: o.submittedAt || o.date, icon: <ShoppingCart className="w-4 h-4 text-primary" />, color: 'blue' }));
    adminData.payouts.forEach((p: any) => activities.push({ id: `payout-${p.id}`, type: 'payout', description: `Payout requested: $${p.amount} by ${p.email}`, timestamp: p.createdAt || p.date, icon: <Wallet className="w-4 h-4 text-emerald-500" />, color: 'green' }));
    adminData.breaches.forEach((b: any) => activities.push({ id: `breach-${b.id}`, type: 'breach', description: `Breach detected: ${b.breachReason} on account ${b.login || b.userId}`, timestamp: b.breachedAt, icon: <AlertOctagon className="w-4 h-4 text-destructive" />, color: 'destructive' }));
    return activities.filter(a => a.timestamp).sort((a, b) => {
      const dateA = getTradeDate(a.timestamp);
      const dateB = getTradeDate(b.timestamp);
      return (dateB?.getTime() || 0) - (dateA?.getTime() || 0);
    }).slice(0, 20);
  }, [adminData]);

  if (previewUserId) {
    return (
      <div className="min-h-screen bg-background relative">
        <div className="fixed top-0 left-0 w-full z-[100] bg-primary h-14 flex items-center justify-between px-6 shadow-xl">
          <span className="text-xs font-black uppercase text-primary-foreground">Previewing Trader Dashboard</span>
          <Button variant="secondary" size="sm" onClick={() => setPreviewUserId(null)}><ChevronLeft className="w-3 h-3 mr-1" /> Exit Preview</Button>
        </div>
        <div className="pt-14"><DashboardPage /></div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background overflow-hidden relative">
      <Navigation />
      <main className="flex-1 flex flex-col min-h-0">
        <div className="p-8 pb-4 shrink-0">
          <div className="flex flex-col md:flex-row justify-between items-start mb-6 gap-4">
            <div><h1 className="text-4xl font-headline font-bold mb-1 text-white">Administrative Terminal</h1><p className="text-muted-foreground text-sm">Managing institutional demo challenges and trader payouts.</p></div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleRunMigration} disabled={actionLoading}>
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Wand2 className="w-4 h-4 mr-2" />}
                Run Migration
              </Button>
              <Button variant="outline" size="sm" onClick={refreshData} disabled={isLoading}>{isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Database className="w-4 h-4 mr-2" />}Sync Network</Button>
            </div>
          </div>
          <Tabs value={activeTab} onValueChange={val => { setActiveTab(val); localStorage.setItem('admin_active_tab', val); }}>
            <TabsList className="bg-secondary/50 h-12 w-full justify-start overflow-x-auto no-scrollbar">
              <TabsTrigger value="overview" className="font-bold">Overview</TabsTrigger>
              <TabsTrigger value="demo_nodes" className="font-bold">Demo Nodes</TabsTrigger>
              <TabsTrigger value="phase_passers" className="font-bold">Phase Passers</TabsTrigger>
              <TabsTrigger value="orders" className="font-bold">Order Review</TabsTrigger>
              <TabsTrigger value="payouts" className="font-bold">Payout Hub</TabsTrigger>
              <TabsTrigger value="user_directory" className="font-bold">User Directory</TabsTrigger>
              <TabsTrigger value="referral_audit" className="font-bold">Referral Audit</TabsTrigger>
              <TabsTrigger value="broadcasts" className="font-bold">Broadcasts</TabsTrigger>
              <TabsTrigger value="kyc" className="font-bold">KYC Hub</TabsTrigger>
              <TabsTrigger value="breaches" className="font-bold">Breaches</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex-1 overflow-y-auto p-8 pt-0 custom-scrollbar">
          {activeTab === 'overview' && (
            <div className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard title="Total Demo Nodes" value={stats.totalAccounts} icon={<Terminal />} color="blue" />
                <StatCard title="Open Positions" value={stats.openPositions} icon={<Activity />} color="purple" />
                <StatCard title="Active Traders" value={stats.totalTraders} icon={<Users />} color="amber" />
                <StatCard title="Total Volume" value={`$${(stats.totalVolume / 1000000).toFixed(1)}M`} icon={<DollarSign />} color="green" />
              </div>
              
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <Card className="lg:col-span-2 bg-card/30 border-border/50 overflow-hidden">
                  <CardHeader className="flex flex-row items-center justify-between border-b border-white/5 pb-4">
                    <div><CardTitle className="text-xl font-headline text-white flex items-center gap-2"><Activity className="w-5 h-5 text-primary" /> Network Pulse</CardTitle></div>
                    <Badge variant="outline" className="animate-pulse bg-emerald-500/5 text-emerald-500 border-emerald-500/20 uppercase text-[9px] font-black tracking-widest"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-2" /> Live</Badge>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="divide-y divide-white/5">
                      {recentActivity.length === 0 ? <div className="p-20 text-center text-muted-foreground italic text-sm">Waiting for incoming node data...</div> : recentActivity.map((act) => (
                        <div key={act.id} className="p-5 flex items-start gap-4 hover:bg-white/5 transition-colors group">
                          <div className={cn("p-2.5 rounded-xl border shrink-0 transition-transform group-hover:scale-110", act.color === 'purple' && "bg-purple-500/10 border-purple-500/20", act.color === 'blue' && "bg-primary/10 border-primary/20", act.color === 'green' && "bg-emerald-500/10 border-emerald-500/20", act.color === 'destructive' && "bg-destructive/10 border-destructive/20")}>{act.icon}</div>
                          <div className="flex-1 min-w-0"><p className="text-sm font-bold text-white line-clamp-1 mb-1">{act.description}</p><div className="flex items-center gap-3"><span className="text-[10px] uppercase font-black tracking-widest text-muted-foreground flex items-center gap-1.5"><Clock className="w-3 h-3" /> {(() => { const d = getTradeDate(act.timestamp); return d ? formatDistanceToNow(d, { addSuffix: true }) : 'Recently'; })()}</span><span className="text-[10px] uppercase font-bold text-muted-foreground/40">{act.type}</span></div></div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <div className="space-y-6">
                  <Card className="bg-secondary/20 border-border/50 p-6">
                     <h4 className="text-xs font-black uppercase text-muted-foreground tracking-widest mb-6">Demo Node Distribution</h4>
                     <div className="space-y-4">
                        <DistributionRow label="Active Nodes" count={stats.activeAccounts} total={stats.totalAccounts} color="bg-primary" />
                        <DistributionRow label="Liquidated (Blown)" count={stats.blownAccounts} total={stats.totalAccounts} color="bg-destructive" />
                        <DistributionRow label="Passed Stages" count={stats.passedAccounts} total={stats.totalAccounts} color="bg-amber-500" />
                     </div>
                  </Card>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'demo_nodes' && (
            <div className="space-y-8">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex bg-secondary/50 p-1 rounded-xl border border-border">
                   {['all', 'active', 'blown', 'passed'].map(f => (
                     <button 
                       key={f} 
                       onClick={() => setDemoFilter(f as any)}
                       className={cn("px-4 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all", demoFilter === f ? "bg-primary text-black" : "text-muted-foreground hover:text-white")}
                     >
                       {f}
                     </button>
                   ))}
                </div>
                <div className="relative w-full md:w-80">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="Search user ID or email..." className="pl-10 h-11 bg-secondary/30 border-border/50 text-white rounded-xl" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                </div>
              </div>

              <Card className="bg-card/30 border-border/50">
                <CardContent className="p-0">
                   <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-black tracking-widest">
                        <tr>
                          <th className="py-4 px-6">Trader ID</th>
                          <th className="py-4 px-4">Plan</th>
                          <th className="py-4 px-4 text-right">Balance</th>
                          <th className="py-4 px-4 text-right">Equity</th>
                          <th className="py-4 px-4 text-right">P&L</th>
                          <th className="py-4 px-4 text-center">Status</th>
                          <th className="py-4 px-6 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {filteredDemoAccounts.map((acc: any) => {
                          const pnl = (acc.balance || 0) - (acc.startBalance || 0);
                          return (
                            <tr key={acc.id} className="hover:bg-primary/5 group transition-colors">
                              <td className="py-4 px-6 font-mono text-xs text-primary font-bold">{acc.userId?.slice(0, 10)}...</td>
                              <td className="py-4 px-4 text-white text-xs">{acc.label}</td>
                              <td className="py-4 px-4 text-right font-mono font-bold">${(acc.balance || 0).toLocaleString()}</td>
                              <td className="py-4 px-4 text-right font-mono text-muted-foreground">${(acc.equity || 0).toLocaleString()}</td>
                              <td className={cn("py-4 px-4 text-right font-mono font-bold", pnl >= 0 ? "text-emerald-500" : "text-destructive")}>
                                {pnl >= 0 ? '+' : ''}{pnl.toLocaleString()}
                              </td>
                              <td className="py-4 px-4 text-center">
                                <div className="flex flex-col items-center">
                                  <Badge className={cn(
                                    "uppercase text-[9px] font-black",
                                    acc.status === 'active' ? "bg-emerald-500/20 text-emerald-500" :
                                    acc.status === 'blown' ? "bg-destructive/20 text-destructive" :
                                    "bg-amber-500/20 text-amber-500"
                                  )}>
                                    {acc.status}
                                  </Badge>
                                  {acc.breachReason && <span className="text-[8px] text-destructive mt-1 font-bold">{acc.breachReason}</span>}
                                </div>
                              </td>
                              <td className="py-4 px-6 text-right flex justify-end gap-2">
                                <Button variant="outline" size="sm" className="h-8 text-[9px] font-black uppercase cursor-pointer" onClick={() => handleViewDemoTrades(acc)}>
                                   <BarChart2 className="w-3 h-3 mr-1" /> View Trades
                                </Button>
                                <Button variant="outline" size="sm" className="h-8 text-[9px] font-black uppercase border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10" onClick={() => handleResetDemoAccount(acc.id)}>
                                   <RefreshCw className="w-3 h-3 mr-1" /> Reset Node
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
          )}

          {activeTab === 'phase_passers' && (
            <Card className="bg-card/30 border-border/50">
              <CardHeader><CardTitle className="text-white">Evaluation Success Ledger</CardTitle><CardDescription>Traders who have successfully completed their phase targets.</CardDescription></CardHeader>
              <CardContent className="p-0">
                  <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-black tracking-widest">
                      <tr>
                        <th className="py-4 px-6">Trader ID</th>
                        <th className="py-4 px-4">Plan</th>
                        <th className="py-4 px-4 text-right">Final Balance</th>
                        <th className="py-4 px-4 text-right">P&L</th>
                        <th className="py-4 px-6 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {adminData.demoAccounts.filter((a: any) => a.status === 'passed').map((acc: any) => (
                        <tr key={acc.id} className="hover:bg-primary/5">
                          <td className="py-4 px-6 font-mono text-xs text-primary font-bold">{acc.userId}</td>
                          <td className="py-4 px-4 text-white font-bold">{acc.label}</td>
                          <td className="py-4 px-4 text-right font-mono text-white">${acc.balance?.toLocaleString()}</td>
                          <td className="py-4 px-4 text-right font-mono text-emerald-500 font-bold">+${(acc.balance - acc.startBalance).toLocaleString()}</td>
                          <td className="py-4 px-6 text-right">
                             <Button size="sm" className="font-bold h-8 text-[10px] uppercase" onClick={() => handleAdvancePhase(acc.userId)}>Provision Next Phase</Button>
                          </td>
                        </tr>
                      ))}
                      {adminData.demoAccounts.filter((a: any) => a.status === 'passed').length === 0 && (
                        <tr><td colSpan={5} className="py-20 text-center text-muted-foreground italic text-sm">No successful evaluations awaiting review.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'orders' && (
            <Card className="bg-card/30 border-border/50">
              <CardHeader><CardTitle className="text-white">Purchase Review Desk</CardTitle></CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-black tracking-widest"><tr><th className="py-4 px-6">Trader</th><th className="py-4 px-4">Plan & Size</th><th className="py-4 px-4">Amount</th><th className="py-4 px-4">Network</th><th className="py-4 px-6 text-right">Actions</th></tr></thead>
                    <tbody className="divide-y divide-border/50">
                      {adminData.orders.map((order: any) => (
                        <tr key={order.id} className="hover:bg-primary/5">
                          <td className="py-4 px-6"><p className="font-bold text-white">{order.userName || 'Unknown'}</p><p className="text-[10px] text-muted-foreground">{order.email}</p></td>
                          <td className="py-4 px-4"><Badge className="bg-primary/10 text-primary border-primary/20">{order.plan} {order.accountSize}</Badge></td>
                          <td className="py-4 px-4 font-bold text-white">${order.amountPaid}</td>
                          <td className="py-4 px-4 text-xs">{order.network}</td>
                          <td className="py-4 px-6 text-right flex justify-end gap-2">
                            {order.status === 'pending' && (
                              <>
                                <Button className="bg-emerald-500 text-black font-bold h-8 text-[10px] uppercase" onClick={() => handleUpdateOrderStatus(order.id, 'approved')}>Approve</Button>
                                <Button variant="destructive" className="h-8 text-[10px] font-bold uppercase" onClick={() => handleUpdateOrderStatus(order.id, 'rejected')}>Reject</Button>
                              </>
                            )}
                            {order.status !== 'pending' && <Badge variant="outline" className="uppercase text-[9px]">{order.status}</Badge>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'payouts' && (
            <Card className="bg-card/30 border-border/50">
              <CardHeader><CardTitle className="text-white">Withdrawal Desk</CardTitle></CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-black tracking-widest">
                      <tr><th className="py-4 px-6">Trader</th><th className="py-4 px-4">Amount</th><th className="py-4 px-4">Method</th><th className="py-4 px-4">Status</th><th className="py-4 px-6 text-right">Actions</th></tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {adminData.payouts.map((p: any) => (
                        <tr key={p.id} className="hover:bg-primary/5">
                          <td className="py-4 px-6"><p className="font-bold text-white">{p.email}</p></td>
                          <td className="py-4 px-4 font-bold text-emerald-500">${p.amount}</td>
                          <td className="py-4 px-4 text-xs">{p.method}</td>
                          <td className="py-4 px-4"><Badge className="uppercase text-[9px]">{p.status}</Badge></td>
                          <td className="py-4 px-6 text-right flex justify-end gap-2">
                            {p.status === 'pending' && (
                              <>
                                <Button size="sm" className="bg-emerald-500 text-black h-8 font-bold text-[10px] uppercase" onClick={() => handleUpdatePayoutStatus(p.id, 'done')}>Mark Paid</Button>
                                <Button size="sm" variant="destructive" className="h-8 font-bold text-[10px] uppercase" onClick={() => handleUpdatePayoutStatus(p.id, 'rejected')}>Reject</Button>
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      {/* Trades Review Modal */}
      <Dialog open={isTradesModalOpen} onOpenChange={setIsTradesModalOpen}>
        <DialogContent className="max-w-4xl bg-card border-border overflow-hidden p-0">
          <DialogHeader className="p-6 border-b border-white/5">
            <DialogTitle className="text-xl font-headline text-white flex items-center gap-2">
              <Monitor className="w-5 h-5 text-primary" /> Node Execution Audit: {selectedDemoAccount?.label}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[500px] overflow-y-auto custom-scrollbar">
            {tradesLoading ? (
              <div className="p-20 text-center"><Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" /><p className="text-[10px] font-black uppercase text-muted-foreground">Syncing Trade Log...</p></div>
            ) : demoTrades.length === 0 ? (
              <div className="p-20 text-center text-muted-foreground italic">No historical executions found for this node.</div>
            ) : (
              <table className="w-full text-sm text-left">
                <thead className="bg-secondary/30 text-muted-foreground uppercase text-[9px] font-black tracking-widest sticky top-0">
                  <tr><th className="py-3 px-6">Symbol</th><th className="py-3 px-4">Type</th><th className="py-3 px-4">Lots</th><th className="py-3 px-4 text-right">Entry</th><th className="py-3 px-4 text-right">Exit</th><th className="py-3 px-6 text-right">Final P&L</th></tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {demoTrades.map((t: any) => (
                    <tr key={t.id} className="hover:bg-white/5 transition-colors">
                      <td className="py-3 px-6 font-bold text-white">{t.symbol}</td>
                      <td className="py-3 px-4"><Badge className={cn("text-[8px] font-black", t.type === 'buy' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-destructive/20 text-destructive')}>{t.type?.toUpperCase()}</Badge></td>
                      <td className="py-3 px-4 font-mono text-zinc-400">{t.lots}</td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-muted-foreground">${t.openPrice?.toLocaleString()}</td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-white">${t.closePrice ? t.closePrice.toLocaleString() : 'OPEN'}</td>
                      <td className={cn("py-3 px-6 text-right font-bold font-mono", (t.pnl || 0) >= 0 ? 'text-emerald-500' : 'text-destructive')}>
                         {(t.pnl || 0) >= 0 ? '+' : ''}${(t.pnl || 0).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <DialogFooter className="p-4 bg-secondary/10"><Button variant="ghost" onClick={() => setIsTradesModalOpen(false)}>Close Audit</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAdminModal} onOpenChange={setShowAdminModal}>
        <DialogContent className="bg-black/95 backdrop-blur-2xl border-primary/30 text-white shadow-2xl">
          <DialogHeader className="space-y-4 pt-4">
             <div className="flex justify-center"><div className="p-4 bg-primary/10 rounded-[2rem] border border-primary/20"><Terminal className="w-12 h-12 text-primary" /></div></div>
             <DialogTitle className="text-3xl font-headline font-bold text-center">Protocol Authorization</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAdminAuth} className="space-y-6 pt-6">
            <Input type="password" value={adminPasswordInput} onChange={(e) => setAdminPasswordInput(e.target.value)} placeholder="••••••••••••••••••••" className="h-14 bg-white/5 border-white/10 text-center text-xl tracking-[0.5em] font-mono" autoFocus />
            <Button type="submit" className="w-full h-14 font-black text-lg cyan-box-glow">AUTHENTICATE SESSION</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DistributionRow({ label, count, total, color }: { label: string, count: number, total: number, color: string }) {
  const percent = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-[10px] font-black uppercase tracking-tight">
        <span className="text-white">{label}</span>
        <span className="text-muted-foreground">{count} / {total}</span>
      </div>
      <div className="h-1 bg-white/5 rounded-full overflow-hidden">
        <div className={cn("h-full transition-all", color)} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
