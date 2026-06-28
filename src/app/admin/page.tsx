
"use client";

import { useState, useMemo, useEffect, memo, useCallback } from 'react';
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
  Users, Activity, Search, Loader2, DollarSign, ChevronLeft, Terminal, Database, ShieldCheck, Wand2, RefreshCw, BarChart2, Monitor, Clock, AlertOctagon, Trophy, CreditCard, Send, Fingerprint, Skull, Filter, ExternalLink, CheckCircle2, XCircle, Eye, Phone, Globe, Mail, User
} from 'lucide-react';
import { fetchAdminTerminalData, advanceTraderPhaseAction, updateOrderStatusAction, updatePayoutStatusAction, processKycAction, resetDemoAccountAction, fetchDemoTradesByAccount, sendGlobalBroadcastAction, fetchUserDetailAction } from './actions';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow } from 'date-fns';
import { getTradeDate } from '@/lib/tradeUtils';

const StatCard = memo(function StatCard({ title, value, icon, color }: { title: string, value: string | number, icon: any, color: string }) {
  const colors: any = {
    blue: 'text-primary bg-primary/10 border-primary/20',
    purple: 'text-purple-500 bg-purple-500/10 border-purple-500/20',
    green: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
    amber: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
    red: 'text-destructive bg-destructive/10 border-destructive/20',
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
  const [adminData, setAdminData] = useState<any>({ 
    users: [], orders: [], payouts: [], referrals: [], broadcasts: [], breaches: [], demoAccounts: [], demoTrades: [] 
  });
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const { toast } = useToast();

  const [selectedDemoAccount, setSelectedDemoAccount] = useState<any>(null);
  const [demoTrades, setDemoTrades] = useState<any[]>([]);
  const [tradesLoading, setTradesLoading] = useState(false);
  const [isTradesModalOpen, setIsTradesModalOpen] = useState(false);
  const [demoFilter, setDemoFilter] = useState<'all' | 'active' | 'blown' | 'passed'>('all');

  // User Detail state
  const [userDetail, setUserDetail] = useState<any>(null);
  const [isUserDetailModalOpen, setIsUserDetailModalOpen] = useState(false);
  const [userDetailLoading, setUserDetailLoading] = useState(false);

  // Broadcast state
  const [broadcastForm, setBroadcastForm] = useState({ title: '', message: '', type: 'announcement' });

  const refreshData = useCallback(async () => {
    setIsLoading(true);
    const res = await fetchAdminTerminalData();
    if (res.success) {
      setAdminData(res);
      setIsAuthenticated(true);
      setShowAdminModal(false);
    } else {
      if (res.error === "Unauthorized") {
        setIsAuthenticated(false);
        setShowAdminModal(true);
      } else {
        toast({ variant: "destructive", title: "Sync Error", description: res.error || "Failed to fetch terminal data." });
      }
    }
    setIsLoading(false);
  }, [toast]);

  useEffect(() => {
    const isVerified = localStorage.getItem('adminVerified') === 'true';
    if (isVerified) {
      refreshData();
    } else {
      setShowAdminModal(true);
      setIsLoading(false);
    }
  }, [refreshData]);

  const handleAdminAuth = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPasswordInput === "93463962569392846256") {
      localStorage.setItem('adminVerified', 'true');
      document.cookie = 'admin_master=93463962569392846256; path=/; max-age=86400';
      setAdminError("");
      refreshData();
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

  const stats = useMemo(() => {
    const accounts = adminData.demoAccounts || [];
    const vol = accounts.reduce((sum: number, a: any) => sum + (parseFloat(a.equity || a.balance || 0)), 0);
    return { 
      totalTraders: adminData.users.length, 
      totalAccounts: accounts.length,
      activeAccounts: accounts.filter((a: any) => a.status === 'active').length,
      blownAccounts: accounts.filter((a: any) => a.status === 'blown').length,
      passedAccounts: accounts.filter((a: any) => a.status === 'passed').length,
      openPositions: adminData.demoTrades?.filter((t: any) => t.status === 'open').length || 0,
      totalVolume: vol
    };
  }, [adminData]);

  const filteredDemoAccounts = useMemo(() => {
    if (!adminData.demoAccounts) return [];
    return adminData.demoAccounts.filter((acc: any) => {
      const matchesStatus = demoFilter === 'all' || acc.status === demoFilter;
      const matchesSearch = !searchTerm || 
        acc.userId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (acc.id && acc.id.toLowerCase().includes(searchTerm.toLowerCase()));
      return matchesStatus && matchesSearch;
    });
  }, [adminData.demoAccounts, demoFilter, searchTerm]);

  const filteredUsers = useMemo(() => {
    if (!adminData.users) return [];
    return adminData.users.filter((u: any) => 
      !searchTerm || u.name?.toLowerCase().includes(searchTerm.toLowerCase()) || u.email?.toLowerCase().includes(searchTerm.toLowerCase()) || u.uid?.includes(searchTerm)
    );
  }, [adminData.users, searchTerm]);

  const handleAction = async (action: () => Promise<any>, successMsg: string) => {
    setActionLoading(true);
    try {
      const res = await action();
      if (res.success) {
        toast({ title: successMsg });
        refreshData();
      } else throw new Error(res.error);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Action Failed", description: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleViewUserDetail = async (userId: string) => {
    setUserDetailLoading(true);
    setIsUserDetailModalOpen(true);
    try {
      const res = await fetchUserDetailAction(userId);
      if (res.success) {
        setUserDetail(res);
      } else {
        throw new Error(res.error);
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fetch Failed", description: err.message });
      setIsUserDetailModalOpen(false);
    } finally {
      setUserDetailLoading(false);
    }
  };

  if (!isAuthenticated && !showAdminModal) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
        <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Verifying Authorization...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Navigation />
      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="p-8 shrink-0 border-b border-white/5">
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
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                Sync Network
              </Button>
            </div>
          </div>
          
          <div className="overflow-x-auto no-scrollbar">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="bg-secondary/50 h-11 p-1 rounded-xl w-max">
                <TabsTrigger value="overview" className="px-6 font-bold">Overview</TabsTrigger>
                <TabsTrigger value="demo_nodes" className="px-6 font-bold">Trading Nodes</TabsTrigger>
                <TabsTrigger value="passers" className="px-6 font-bold">Phase Passers</TabsTrigger>
                <TabsTrigger value="orders" className="px-6 font-bold">Order Review</TabsTrigger>
                <TabsTrigger value="payouts" className="px-6 font-bold">Payout Hub</TabsTrigger>
                <TabsTrigger value="users" className="px-6 font-bold">User Directory</TabsTrigger>
                <TabsTrigger value="referrals" className="px-6 font-bold">Referral Audit</TabsTrigger>
                <TabsTrigger value="broadcasts" className="px-6 font-bold">Broadcasts</TabsTrigger>
                <TabsTrigger value="kyc" className="px-6 font-bold">KYC Hub</TabsTrigger>
                <TabsTrigger value="breaches" className="px-6 font-bold">Breaches</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          {activeTab === 'overview' && (
            <div className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                <StatCard title="Active Nodes" value={stats.activeAccounts} icon={<Terminal />} color="blue" />
                <StatCard title="Open Positions" value={stats.openPositions} icon={<Activity />} color="purple" />
                <StatCard title="Total Volume" value={`$${(stats.totalVolume / 1000000).toFixed(2)}M`} icon={<DollarSign />} color="green" />
                <StatCard title="Network Size" value={stats.totalAccounts} icon={<Monitor />} color="amber" />
                <StatCard title="Total Liquidation" value={stats.blownAccounts} icon={<Skull />} color="red" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <Card className="bg-card/40 border-border/50">
                  <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Clock className="w-5 h-5 text-primary" /> Recent Activity</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    {adminData.orders.slice(0, 5).map((o: any) => (
                      <div key={o.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/20 border border-white/5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary"><CreditCard className="w-4 h-4" /></div>
                          <div>
                            <p className="text-xs font-bold text-white">Order submitted: {o.accountSize || o.plan || 'Plan'} {o.plan || ''}</p>
                            <p className="text-[10px] text-muted-foreground">{o.email}</p>
                          </div>
                        </div>
                        <Badge variant="outline" className="text-[9px] uppercase">{o.status}</Badge>
                      </div>
                    ))}
                    {adminData.orders.length === 0 && <p className="text-center text-xs text-muted-foreground py-10">No recent orders.</p>}
                  </CardContent>
                </Card>
                <Card className="bg-card/40 border-border/50">
                  <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Users className="w-5 h-5 text-primary" /> New Traders</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    {adminData.users.slice(0, 5).map((u: any) => (
                      <div key={u.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/20 border border-white/5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500"><Users className="w-4 h-4" /></div>
                          <div>
                            <p className="text-xs font-bold text-white">{u.name}</p>
                            <p className="text-[10px] text-muted-foreground">{u.email}</p>
                          </div>
                        </div>
                        <p className="text-[10px] text-muted-foreground">{u.joinDate ? format(new Date(u.joinDate), 'MMM d') : 'New'}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {activeTab === 'demo_nodes' && (
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex bg-secondary p-1 rounded-lg">
                  {['all', 'active', 'blown', 'passed'].map(f => (
                    <button key={f} onClick={() => setDemoFilter(f as any)} className={cn("px-4 py-1.5 rounded text-[10px] font-black uppercase transition-all", demoFilter === f ? "bg-primary text-black" : "text-muted-foreground")}>{f}</button>
                  ))}
                </div>
                <div className="relative w-full max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="Search trader UID or login..." className="pl-10 h-10 bg-secondary/50 border-white/5" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                </div>
              </div>
              <Card className="bg-card/40 border-border/50">
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-bold tracking-widest">
                        <tr><th className="p-4">Trader / Node ID</th><th className="p-4">Balance</th><th className="p-4">Equity</th><th className="p-4">Daily Start</th><th className="p-4">Plan</th><th className="p-4">Status</th><th className="p-4 text-right">Actions</th></tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {filteredDemoAccounts.map((acc: any) => (
                          <tr key={acc.id} className="hover:bg-primary/5 transition-colors group">
                            <td className="p-4">
                               <p className="font-mono text-xs text-primary font-bold">{acc.userId?.slice(0, 10)}...</p>
                               <p className="text-[10px] text-muted-foreground font-mono">{acc.id}</p>
                            </td>
                            <td className="p-4 font-bold text-white">${(acc.balance || 0).toLocaleString()}</td>
                            <td className="p-4 text-zinc-400 font-mono text-xs">${(acc.equity || acc.balance || 0).toLocaleString()}</td>
                            <td className="p-4 font-mono text-xs text-muted-foreground">${(acc.dailyStartBalance || acc.startBalance || 0).toLocaleString()}</td>
                            <td className="p-4 text-[10px] uppercase font-black text-primary/70">{acc.planType || acc.plan || 'LEGACY'}</td>
                            <td className="p-4">
                              <Badge className={cn("uppercase text-[9px]", acc.status === 'active' ? "bg-emerald-500/20 text-emerald-500" : acc.status === 'blown' ? "bg-destructive/20 text-destructive" : "bg-amber-500/20 text-amber-500")}>
                                {acc.status}
                              </Badge>
                            </td>
                            <td className="p-4 text-right">
                              <div className="flex justify-end gap-2">
                                <Button variant="ghost" size="sm" onClick={() => handleAction(() => resetDemoAccountAction(acc.id), "Node Reprovisioned")}><RefreshCw className="w-3.5 h-3.5" /></Button>
                                <Button variant="ghost" size="sm" onClick={() => handleViewUserDetail(acc.userId)}><ExternalLink className="w-3.5 h-3.5" /></Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === 'orders' && (
            <Card className="bg-card/40 border-border/50">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-bold">
                      <tr><th className="p-4">Trader</th><th className="p-4">Plan / Size</th><th className="p-4">Network</th><th className="p-4">Amount Paid</th><th className="p-4">TX Hash</th><th className="p-4">Status</th><th className="p-4 text-right">Action</th></tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {adminData.orders.map((o: any) => (
                        <tr key={o.id} className="hover:bg-white/5">
                          <td className="p-4">
                            <p className="font-bold text-white">{o.userName}</p>
                            <p className="text-[10px] text-muted-foreground">{o.email}</p>
                          </td>
                          <td className="p-4">
                            <Badge variant="outline" className="text-[10px] font-bold">{o.plan} {o.accountSize}</Badge>
                          </td>
                          <td className="p-4 text-xs">{o.network}</td>
                          <td className="p-4 font-bold text-emerald-500">${o.amountPaid}</td>
                          <td className="p-4 font-mono text-[10px] text-muted-foreground truncate max-w-[100px]">{o.txHash}</td>
                          <td className="p-4">
                             <Badge className={cn("uppercase text-[9px]", o.status === 'approved' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-amber-500/20 text-amber-500')}>{o.status}</Badge>
                          </td>
                          <td className="p-4 text-right">
                             {o.status === 'pending' && (
                               <div className="flex justify-end gap-2">
                                 <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 h-8" onClick={() => handleAction(() => updateOrderStatusAction(o.id, 'approved'), "Order Approved")}><CheckCircle2 className="w-3.5 h-3.5" /></Button>
                                 <Button size="sm" variant="destructive" className="h-8" onClick={() => handleAction(() => updateOrderStatusAction(o.id, 'rejected'), "Order Rejected")}><XCircle className="w-3.5 h-3.5" /></Button>
                               </div>
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

          {activeTab === 'payouts' && (
            <Card className="bg-card/40 border-border/50">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-bold">
                      <tr><th className="p-4">Date</th><th className="p-4">Trader</th><th className="p-4 text-right">Amount</th><th className="p-4">Method</th><th className="p-4">Status</th><th className="p-4 text-right">Action</th></tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {adminData.payouts.map((p: any) => (
                        <tr key={p.id} className="hover:bg-white/5">
                          <td className="p-4 text-xs text-muted-foreground">{p.date ? format(new Date(p.date), 'MMM d, HH:mm') : '—'}</td>
                          <td className="p-4 font-bold text-white">{p.email}</td>
                          <td className="p-4 text-right font-mono font-bold text-emerald-500">${parseFloat(p.amount).toLocaleString()}</td>
                          <td className="p-4 text-xs">{p.method}</td>
                          <td className="p-4"><Badge className="uppercase text-[9px]">{p.status}</Badge></td>
                          <td className="p-4 text-right">
                             {p.status === 'pending' && (
                               <Button size="sm" className="bg-primary text-black h-8 font-bold" onClick={() => handleAction(() => updatePayoutStatusAction(p.id, 'done'), "Payout Processed")}>Process</Button>
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

          {activeTab === 'users' && (
            <Card className="bg-card/40 border-border/50">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-bold">
                      <tr><th className="p-4">Name</th><th className="p-4">Email</th><th className="p-4">Phone</th><th className="p-4">UID</th><th className="p-4 text-right">Actions</th></tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {filteredUsers.map((u: any) => (
                        <tr key={u.id} className="hover:bg-white/5">
                          <td className="p-4 font-bold text-white">{u.name}</td>
                          <td className="p-4 text-xs">{u.email}</td>
                          <td className="p-4 text-xs text-muted-foreground">{u.phone || '—'}</td>
                          <td className="p-4 font-mono text-[10px]">{u.uid}</td>
                          <td className="p-4 text-right">
                             <Button size="sm" variant="ghost" onClick={() => handleViewUserDetail(u.authUid || u.id)} className="h-8 text-primary font-bold"><Eye className="w-4 h-4 mr-2" /> View Account</Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'passers' && (
            <Card className="bg-card/40 border-border/50">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-bold">
                      <tr><th className="p-4">Trader</th><th className="p-4">Current Phase</th><th className="p-4">Plan</th><th className="p-4 text-right">Balance</th><th className="p-4 text-right">Action</th></tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {adminData.users.filter((u: any) => u.readyForNextPhase).map((u: any) => (
                        <tr key={u.id} className="bg-emerald-500/5 hover:bg-emerald-500/10 transition-colors">
                          <td className="p-4">
                            <p className="font-bold text-white">{u.name}</p>
                            <p className="text-[10px] text-muted-foreground">{u.email}</p>
                          </td>
                          <td className="p-4 font-bold uppercase text-xs text-primary">{u.currentPhase || 'evaluation'}</td>
                          <td className="p-4 text-xs">{u.accountPlan || 'Standard'}</td>
                          <td className="p-4 text-right font-mono font-bold">${u.liveBalance?.toLocaleString()}</td>
                          <td className="p-4 text-right">
                            <Button size="sm" className="bg-primary text-black font-bold h-8" onClick={() => handleAction(() => advanceTraderPhaseAction(u.id), "Trader Advanced to Next Phase")}>Advance Phase</Button>
                          </td>
                        </tr>
                      ))}
                      {adminData.users.filter((u: any) => u.readyForNextPhase).length === 0 && (
                        <tr><td colSpan={5} className="py-20 text-center text-muted-foreground italic">No traders currently awaiting phase advancement.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'kyc' && (
            <Card className="bg-card/40 border-border/50">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-bold">
                      <tr><th className="p-4">Trader</th><th className="p-4">Status</th><th className="p-4">Documents</th><th className="p-4 text-right">Action</th></tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {adminData.users.filter((u: any) => u.kycStatus === 'pending').map((u: any) => (
                        <tr key={u.id} className="hover:bg-white/5">
                          <td className="p-4">
                            <p className="font-bold text-white">{u.name}</p>
                            <p className="text-[10px] text-muted-foreground">{u.email}</p>
                          </td>
                          <td className="p-4"><Badge className="bg-amber-500/20 text-amber-500 text-[9px]">PENDING</Badge></td>
                          <td className="p-4">
                             <div className="flex gap-2">
                               <Button variant="outline" size="sm" className="h-7 text-[9px] font-bold" asChild><a href={u.idProofUrl} target="_blank">ID Proof</a></Button>
                               <Button variant="outline" size="sm" className="h-7 text-[9px] font-bold" asChild><a href={u.addressProofUrl} target="_blank">Address</a></Button>
                             </div>
                          </td>
                          <td className="p-4 text-right">
                             <div className="flex justify-end gap-2">
                               <Button size="sm" className="bg-emerald-600 h-8" onClick={() => handleAction(() => processKycAction(u.id, 'verified'), "KYC Verified")}><CheckCircle2 className="w-4 h-4" /></Button>
                               <Button size="sm" variant="destructive" className="h-8" onClick={() => handleAction(() => processKycAction(u.id, 'rejected', 'Invalid documents'), "KYC Rejected")}><XCircle className="w-4 h-4" /></Button>
                             </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'broadcasts' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <Card className="lg:col-span-1 bg-card/40 border-border/50">
                <CardHeader><CardTitle>Create Broadcast</CardTitle><CardDescription>Send a global alert to all traders.</CardDescription></CardHeader>
                <CardContent className="space-y-4">
                   <div className="space-y-2">
                     <Label>Title</Label>
                     <Input placeholder="System Maintenance..." value={broadcastForm.title} onChange={e => setBroadcastForm({...broadcastForm, title: e.target.value})} />
                   </div>
                   <div className="space-y-2">
                     <Label>Message</Label>
                     <textarea className="w-full h-32 bg-secondary/50 border-white/5 rounded-lg p-3 text-sm" placeholder="Type message..." value={broadcastForm.message} onChange={e => setBroadcastForm({...broadcastForm, message: e.target.value})}></textarea>
                   </div>
                   <Button className="w-full font-bold cyan-box-glow" onClick={() => handleAction(() => sendGlobalBroadcastAction(broadcastForm), "Global Broadcast Sent")} disabled={actionLoading}>
                      {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />} Send Alert
                   </Button>
                </CardContent>
              </Card>
              <Card className="lg:col-span-2 bg-card/40 border-border/50">
                <CardHeader><CardTitle>Recent Broadcasts</CardTitle></CardHeader>
                <CardContent className="p-0">
                   <div className="overflow-x-auto">
                     <table className="w-full text-sm text-left">
                       <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-bold">
                         <tr><th className="p-4">Date</th><th className="p-4">Title</th><th className="p-4">Author</th></tr>
                       </thead>
                       <tbody className="divide-y divide-border/50">
                         {adminData.broadcasts.map((b: any) => (
                           <tr key={b.id} className="hover:bg-white/5">
                             <td className="p-4 text-xs text-muted-foreground">{b.sentAt ? format(getTradeDate(b.sentAt)!, 'MMM d, HH:mm') : '—'}</td>
                             <td className="p-4 font-bold text-white">{b.title}</td>
                             <td className="p-4 text-xs">{b.sentBy}</td>
                           </tr>
                         ))}
                       </tbody>
                     </table>
                   </div>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === 'breaches' && (
            <Card className="bg-card/40 border-border/50">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-bold">
                      <tr><th className="p-4">Date</th><th className="p-4">Trader</th><th className="p-4">Plan / Phase</th><th className="p-4">Type</th><th className="p-4">Reason</th></tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {adminData.breaches.map((b: any) => (
                        <tr key={b.id} className="hover:bg-destructive/5 transition-colors">
                          <td className="p-4 text-xs text-muted-foreground">{b.breachedAt ? format(getTradeDate(b.breachedAt)!, 'MMM d, HH:mm') : '—'}</td>
                          <td className="p-4">
                             <p className="font-bold text-white">{b.userName || 'N/A'}</p>
                             <p className="text-[10px] text-muted-foreground">{b.userEmail}</p>
                          </td>
                          <td className="p-4 text-xs uppercase font-bold">{b.plan} / {b.phase}</td>
                          <td className="p-4"><Badge variant="destructive" className="text-[9px] uppercase font-black">{b.breachType}</Badge></td>
                          <td className="p-4 text-xs text-destructive font-medium">{b.breachReason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'referrals' && (
            <Card className="bg-card/40 border-border/50">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-bold">
                      <tr><th className="p-4">Referrer</th><th className="p-4">New User</th><th className="p-4">Earned</th><th className="p-4">Status</th><th className="p-4 text-right">Date</th></tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {adminData.referrals.map((r: any) => (
                        <tr key={r.id} className="hover:bg-white/5">
                          <td className="p-4 font-mono text-xs">{r.referrerId}</td>
                          <td className="p-4 text-xs">{r.referredUserEmail}</td>
                          <td className="p-4 font-bold text-emerald-500">${r.amount}</td>
                          <td className="p-4"><Badge className="uppercase text-[9px]">{r.status}</Badge></td>
                          <td className="p-4 text-right text-xs text-muted-foreground">{r.createdAt ? format(getTradeDate(r.createdAt)!, 'MMM d') : '—'}</td>
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

      {/* Admin Auth Modal */}
      <Dialog open={showAdminModal} onOpenChange={(open) => {
        if (!isAuthenticated && !open) return;
        setShowAdminModal(open);
      }}>
        <DialogContent className="bg-black/95 border-primary/30 text-white outline-none">
          <DialogHeader>
            <DialogTitle className="text-center font-headline text-2xl">System Authorization</DialogTitle>
            <DialogDescription className="text-center text-muted-foreground">Enter master access key to proceed to the administrative terminal.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAdminAuth} className="space-y-6 pt-4">
            <div className="space-y-2">
              <Input 
                type="password" 
                value={adminPasswordInput} 
                onChange={(e) => setAdminPasswordInput(e.target.value)} 
                placeholder="••••••••" 
                className={cn(
                  "h-14 text-center text-2xl font-mono bg-secondary/20 border-white/10",
                  adminError && "border-destructive text-destructive"
                )} 
                autoFocus 
              />
              {adminError && <p className="text-center text-xs font-bold text-destructive animate-pulse">{adminError}</p>}
            </div>
            <Button type="submit" className="w-full h-14 font-black cyan-box-glow text-lg">AUTHENTICATE</Button>
          </form>
          <p className="text-[9px] text-center uppercase tracking-widest text-muted-foreground/30 mt-4">Unauthorized access is monitored and logged.</p>
        </DialogContent>
      </Dialog>

      {/* User Detail Modal */}
      <Dialog open={isUserDetailModalOpen} onOpenChange={setIsUserDetailModalOpen}>
        <DialogContent className="max-w-5xl bg-zinc-950 border-white/5 text-white h-[90vh] flex flex-col p-0 overflow-hidden">
          {userDetailLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center p-20">
              <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
              <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Compiling Trader Dossier...</p>
            </div>
          ) : userDetail && (
            <>
              <div className="p-8 border-b border-white/5 bg-secondary/10 shrink-0">
                <div className="flex justify-between items-start">
                  <div className="flex gap-6 items-center">
                    <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center border-2 border-primary/20">
                      <User className="w-10 h-10 text-primary" />
                    </div>
                    <div>
                      <h2 className="text-3xl font-headline font-bold mb-1">{userDetail.user.name}</h2>
                      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> {userDetail.user.email}</span>
                        <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> {userDetail.user.phone || 'No Phone'}</span>
                        <span className="flex items-center gap-1.5"><Globe className="w-3.5 h-3.5" /> {userDetail.user.country || 'N/A'}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right space-y-2">
                    <Badge className="bg-primary/20 text-primary uppercase text-[10px] font-black">{userDetail.user.tier || 'Bronze'} Tier</Badge>
                    <div className="text-[10px] font-mono text-muted-foreground">UID: {userDetail.user.uid}</div>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-background">
                <Tabs defaultValue="nodes" className="w-full">
                  <TabsList className="bg-secondary/40 border border-white/5 mb-8">
                    <TabsTrigger value="nodes" className="font-bold">Nodes ({userDetail.accounts.length})</TabsTrigger>
                    <TabsTrigger value="ledger" className="font-bold">Execution Ledger ({userDetail.trades.length})</TabsTrigger>
                    <TabsTrigger value="financials" className="font-bold">Financial History</TabsTrigger>
                    <TabsTrigger value="compliance" className="font-bold">Compliance Status</TabsTrigger>
                  </TabsList>

                  <TabsContent value="nodes" className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {userDetail.accounts.map((acc: any) => (
                        <Card key={acc.id} className="bg-card/40 border-border/50">
                          <CardHeader className="pb-4 border-b border-white/5">
                            <div className="flex justify-between items-center">
                              <CardTitle className="text-lg">{acc.label}</CardTitle>
                              <Badge className={cn("uppercase text-[9px]", acc.status === 'active' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-red-500/20 text-red-500')}>{acc.status}</Badge>
                            </div>
                          </CardHeader>
                          <CardContent className="pt-4 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                              <div><p className="text-[9px] uppercase font-bold text-muted-foreground">Balance</p><p className="font-bold font-mono">${acc.balance.toLocaleString()}</p></div>
                              <div><p className="text-[9px] uppercase font-bold text-muted-foreground">Equity</p><p className="font-bold font-mono">${acc.equity.toLocaleString()}</p></div>
                              <div><p className="text-[9px] uppercase font-bold text-muted-foreground">Start</p><p className="text-zinc-500 font-mono text-sm">${acc.startBalance.toLocaleString()}</p></div>
                              <div><p className="text-[9px] uppercase font-bold text-muted-foreground">Target</p><p className="text-zinc-500 font-mono text-sm">${acc.profitTarget?.toLocaleString() || 'N/A'}</p></div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </TabsContent>

                  <TabsContent value="ledger">
                    <div className="rounded-xl border border-white/5 overflow-hidden">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-secondary/30 text-muted-foreground uppercase text-[9px] font-bold">
                          <tr><th className="p-3">Symbol</th><th className="p-3">Type</th><th className="p-3">Lots</th><th className="p-3 text-right">P&L</th><th className="p-3 text-right">Status</th></tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {userDetail.trades.map((t: any) => (
                            <tr key={t.id} className="hover:bg-white/5">
                              <td className="p-3 font-bold">{t.symbol}</td>
                              <td className="p-3 uppercase">{t.type}</td>
                              <td className="p-3 font-mono">{t.lots}</td>
                              <td className={cn("p-3 text-right font-bold", t.pnl >= 0 ? "text-emerald-500" : "text-destructive")}>${t.pnl.toLocaleString()}</td>
                              <td className="p-3 text-right"><Badge variant="outline" className="text-[9px] uppercase">{t.status}</Badge></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </TabsContent>

                  <TabsContent value="financials">
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                       <Card className="bg-card/40 border-border/50">
                         <CardHeader><CardTitle className="text-sm">Payout Requests</CardTitle></CardHeader>
                         <CardContent>
                           {userDetail.payouts.length === 0 ? <p className="text-xs text-muted-foreground italic">No payout history.</p> : (
                             <div className="space-y-3">
                               {userDetail.payouts.map((p: any) => (
                                 <div key={p.id} className="flex justify-between items-center p-3 rounded-lg bg-secondary/20">
                                   <div><p className="text-xs font-bold">${parseFloat(p.amount).toLocaleString()}</p><p className="text-[10px] text-muted-foreground">{format(new Date(p.date), 'MMM d, yyyy')}</p></div>
                                   <Badge className="text-[9px] uppercase">{p.status}</Badge>
                                 </div>
                               ))}
                             </div>
                           )}
                         </CardContent>
                       </Card>
                       <Card className="bg-card/40 border-border/50">
                         <CardHeader><CardTitle className="text-sm">Affiliate Referrals</CardTitle></CardHeader>
                         <CardContent>
                            <div className="text-2xl font-bold text-emerald-500 mb-4">${(userDetail.referrals.length * 30).toFixed(2)} Total Earned</div>
                            <p className="text-xs text-muted-foreground">Joined referrals: {userDetail.referrals.length}</p>
                         </CardContent>
                       </Card>
                     </div>
                  </TabsContent>

                  <TabsContent value="compliance">
                     <Card className="bg-card/40 border-border/50">
                       <CardHeader><CardTitle className="text-sm">KYC & Risk Audit</CardTitle></CardHeader>
                       <CardContent className="space-y-6">
                          <div className="flex justify-between items-center p-4 rounded-xl bg-secondary/20 border border-white/5">
                             <div><p className="font-bold">Identity Verification</p><p className="text-xs text-muted-foreground">Status: {userDetail.user.kycStatus}</p></div>
                             {userDetail.user.kycVerified ? <CheckCircle2 className="text-emerald-500" /> : <Clock className="text-amber-500" />}
                          </div>
                          <div className="flex justify-between items-center p-4 rounded-xl bg-secondary/20 border border-white/5">
                             <div><p className="font-bold">Account Standing</p><p className="text-xs text-muted-foreground">Risk Level: Normal</p></div>
                             <ShieldCheck className="text-primary" />
                          </div>
                       </CardContent>
                     </Card>
                  </TabsContent>
                </Tabs>
              </div>

              <div className="p-6 border-t border-white/5 shrink-0 bg-secondary/5 flex justify-end">
                 <Button onClick={() => setIsUserDetailModalOpen(false)} className="font-bold px-8">Close Dossier</Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
