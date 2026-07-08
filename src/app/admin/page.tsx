
"use client";

import { useState, useMemo, useEffect, memo, useCallback } from 'react';
import { Navigation } from '@/components/Navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
  Users, Activity, Search, Loader2, DollarSign, ChevronLeft, Terminal, Database, ShieldCheck, RefreshCw, BarChart2, Monitor, Clock, AlertOctagon, Trophy, CreditCard, Send, Fingerprint, Skull, Filter, ExternalLink, CheckCircle2, XCircle, Eye, LogOut, Gift, Image as ImageIcon, ChevronRight, History, Megaphone, AlertTriangle, RotateCcw, Zap, Link as LinkIcon, ScrollText, Plus
} from 'lucide-react';
import { updateOrderStatusAction, resetDemoAccountAction, sendGlobalBroadcastAction, manualBreachAccountAction, approveManualOrderAction } from './actions';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import Image from 'next/image';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, orderBy, limit, where, getCountFromServer, onSnapshot } from 'firebase/firestore';
import { useAuth } from '@/context/AuthContext';
import { ADMIN_EMAILS } from '@/lib/admin';
import { isValidTxHash, EXPLORERS } from '@/lib/onChainVerification';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import Link from 'next/link';

const StatCard = memo(function StatCard({ title, value, icon, color }: { title: string, value: string | number, icon: any, color: string }) {
  const colors: any = {
    blue: 'text-primary bg-primary/10 border-primary/20',
    green: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
    amber: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
    red: 'text-destructive bg-destructive/10 border-destructive/20',
    purple: 'text-purple-500 bg-purple-500/10 border-purple-500/20',
    zinc: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20'
  };
  return (
    <Card className="border-border/50 bg-card/30 hover:border-primary/20 transition-all duration-300 group">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className={cn("p-2 rounded-lg border", colors[color])}>{icon}</div>
          <Badge variant="outline" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground border-white/10 animate-pulse">LIVE</Badge>
        </div>
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">{title}</p>
        <h3 className="text-2xl font-headline font-bold text-white group-hover:text-primary transition-colors">{value}</h3>
      </CardContent>
    </Card>
  );
});

export default function AdminPage() {
  const { user } = useAuth();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [adminError, setAdminError] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [searchTerm, setSearchTerm] = useState('');
  
  const [adminData, setAdminData] = useState<any>({ 
    users: [], orders: [], payouts: [], referrals: [], broadcasts: [], demoAccounts: [],
    totalUsersCount: 0, totalNodesCount: 0, totalAum: 0, pendingOrdersCount: 0, phasePassersCount: 0, totalLiquidationCount: 0
  });

  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const { toast } = useToast();

  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);

  // Instance ID Placeholder
  const instanceId = "Studio-8383940162";

  const refreshData = useCallback(async () => {
    if (!isAuthenticated) return;
    setIsLoading(true);
    try {
      const [usersSnap, accountsSnap, ordersSnap, payoutsSnap, referralsSnap, broadcastsSnap] = await Promise.all([
        getDocs(query(collection(db, 'users'), limit(500), orderBy('createdAt', 'desc'))),
        getDocs(query(collection(db, 'demoAccounts'), limit(1000), orderBy('createdAt', 'desc'))),
        getDocs(query(collection(db, 'orders'), limit(500), orderBy('createdAt', 'desc'))),
        getDocs(query(collection(db, 'payouts'), limit(200), orderBy('createdAt', 'desc'))),
        getDocs(query(collection(db, 'referrals'), limit(500), orderBy('createdAt', 'desc'))),
        getDocs(query(collection(db, 'broadcasts'), limit(100), orderBy('sentAt', 'desc'))),
      ]);
      
      const accounts = accountsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const orders = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      setAdminData({
        users: usersSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })),
        demoAccounts: accounts,
        orders: orders,
        payouts: payoutsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })),
        referrals: referralsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })),
        broadcasts: broadcastsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })),
        totalUsersCount: usersSnap.size,
        totalNodesCount: accounts.length,
        totalAum: accounts.reduce((a, c: any) => a + (c.startBalance || 0), 0),
        pendingOrdersCount: orders.filter((o: any) => o.status === 'pending' || o.status === 'manual_review').length,
        phasePassersCount: accounts.filter((a: any) => a.status === 'passed').length,
        totalLiquidationCount: accounts.filter((a: any) => a.status === 'blown' || a.status === 'breach' || a.status === 'terminated').length
      });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Sync Error", description: err.message });
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, toast]);

  useEffect(() => {
    const isVerified = localStorage.getItem('adminVerified') === 'true';
    if (isVerified) {
      setIsAuthenticated(true);
    } else {
      setShowAdminModal(true);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) refreshData();
  }, [isAuthenticated, refreshData]);

  const handleAdminAuth = (e: React.FormEvent) => {
    e.preventDefault();
    const MASTER_PASSWORD = '93463962569392846256';
    if (adminPasswordInput === MASTER_PASSWORD) {
      localStorage.setItem('adminVerified', 'true');
      setIsAuthenticated(true);
      setShowAdminModal(false);
    } else {
      setAdminError('❌ Invalid credentials');
    }
  };

  const handleResetAccount = async (id: string) => {
    if (!confirm('Are you sure you want to reset this account to initial balance?')) return;
    setActionLoading(true);
    try {
      const res = await resetDemoAccountAction(id);
      if (res.success) {
        toast({ title: "Account Balance Reset" });
        refreshData();
      }
    } catch (e: any) {
      toast({ variant: "destructive", title: "Reset Failed", description: e.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('adminVerified');
    setIsAuthenticated(false);
    setShowAdminModal(true);
  };

  // Tab Filtering Logic
  const filteredNodes = useMemo(() => 
    adminData.demoAccounts.filter((a: any) => {
      const term = searchTerm.toLowerCase();
      return a.id.toLowerCase().includes(term) || a.email?.toLowerCase().includes(term) || a.label?.toLowerCase().includes(term);
    })
  , [adminData.demoAccounts, searchTerm]);

  const filteredOrders = useMemo(() => 
    adminData.orders.filter((o: any) => {
      const term = searchTerm.toLowerCase();
      return o.email?.toLowerCase().includes(term) || o.id?.toLowerCase().includes(term) || o.txHash?.toLowerCase().includes(term);
    })
  , [adminData.orders, searchTerm]);

  const filteredUsers = useMemo(() => 
    adminData.users.filter((u: any) => {
      const term = searchTerm.toLowerCase();
      return u.name?.toLowerCase().includes(term) || u.email?.toLowerCase().includes(term) || u.traderId?.toLowerCase().includes(term);
    })
  , [adminData.users, searchTerm]);

  if (!isAuthenticated && !showAdminModal) return null;

  return (
    <div className="flex min-h-screen bg-background text-white">
      <Navigation />
      <main className="flex-1 p-8 overflow-y-auto custom-scrollbar">
        {/* SPEC HEADER */}
        <header className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-10 pb-6 border-b border-white/5">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-headline font-bold uppercase tracking-tighter">Administrative Terminal</h1>
              {user && <Badge variant="secondary" className="bg-primary/20 text-primary border-primary/30 h-6">{user.email}</Badge>}
            </div>
            <p className="text-muted-foreground text-sm font-medium">Institutional Node Control & Compliance Hub.</p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
             <div className="px-4 py-2 rounded-xl bg-secondary/50 border border-border flex items-center gap-3">
                <div className="p-1.5 rounded-lg bg-primary/10 text-primary"><Database size={16} /></div>
                <div>
                   <p className="text-[8px] font-black uppercase text-zinc-500 tracking-widest">Instance</p>
                   <p className="text-xs font-mono font-bold text-white">{instanceId}</p>
                </div>
             </div>

             <div className="flex gap-2">
                <Button variant="outline" className="h-10 rounded-xl font-bold border-white/10 hover:bg-white/5" onClick={() => toast({ title: "Friday Rule Reset Triggered" })}>
                  <RotateCcw className="w-4 h-4 mr-2" /> Friday Rule Reset
                </Button>
                <Button variant="outline" className="h-10 rounded-xl font-bold border-white/10 hover:bg-white/5" onClick={() => toast({ title: "Syncing Prices..." })}>
                  <Zap className="w-4 h-4 mr-2" /> Price Synchronizer
                </Button>
                <Button className="h-10 rounded-xl font-black bg-primary text-black hover:bg-primary/90 shadow-[0_0_20px_rgba(17,179,245,0.3)]">
                  <Gift className="w-4 h-4 mr-2" /> Gift Account
                </Button>
                <Button variant="outline" className="h-10 w-10 p-0 rounded-xl border-white/10" onClick={refreshData} disabled={isLoading}>
                  <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
                </Button>
                <Button variant="ghost" className="h-10 w-10 p-0 rounded-xl text-destructive hover:bg-destructive/10" onClick={handleLogout}>
                  <LogOut className="w-4 h-4" />
                </Button>
             </div>
          </div>
        </header>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
          <div className="relative">
            <ScrollArea className="w-full">
              <TabsList className="bg-transparent h-12 w-full justify-start p-0 gap-8 border-b border-white/5 rounded-none overflow-visible">
                {['Overview', 'Phase Passers', 'Payout Hub', 'Trading Nodes', 'Breaches', 'Order Review', 'Referral Audit', 'User Directory', 'KYC Hub', 'Broadcasts'].map((tab) => (
                  <TabsTrigger 
                    key={tab} 
                    value={tab.toLowerCase().replace(' ', '-')} 
                    className="data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none shadow-none px-0 h-full text-xs font-black uppercase tracking-widest text-muted-foreground transition-all"
                  >
                    {tab}
                  </TabsTrigger>
                ))}
              </TabsList>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </div>

          <TabsContent value="overview" className="space-y-8">
             {/* 6 STAT CARDS */}
             <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <StatCard title="Active Traders" value={adminData.totalUsersCount} icon={<Users />} color="blue" />
                <StatCard title="Total Volume" value={`$${(adminData.totalAum / 1e6).toFixed(1)}M`} icon={<BarChart2 />} color="green" />
                <StatCard title="Registered Nodes" value={adminData.totalNodesCount} icon={<Monitor />} color="purple" />
                <StatCard title="Pending Orders" value={adminData.pendingOrdersCount} icon={<Clock />} color="amber" />
                <StatCard title="Phase Passers" value={adminData.phasePassersCount} icon={<Trophy />} color="blue" />
                <StatCard title="Total Liquidation" value={adminData.totalLiquidationCount} icon={<Skull />} color="red" />
             </div>

             {/* SIDE BY SIDE PANELS */}
             <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <Card className="bg-card/30 border-border/50">
                  <CardHeader className="flex flex-row items-center justify-between border-b border-white/5 pb-4">
                    <CardTitle className="text-sm font-headline font-bold uppercase tracking-tight">Recent Orders</CardTitle>
                    <button onClick={() => setActiveTab('order-review')} className="text-[10px] font-black uppercase text-primary hover:underline">View All</button>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <tbody className="divide-y divide-border/50">
                          {adminData.orders.slice(0, 5).map((o: any) => (
                            <tr key={o.id} className="hover:bg-white/5 transition-colors">
                              <td className="py-3 px-4 font-bold text-xs">{o.email}</td>
                              <td className="py-3 px-4 text-[10px] text-muted-foreground uppercase">{o.plan}</td>
                              <td className="py-3 px-4 text-right">
                                <Badge className={cn("text-[8px] font-black uppercase", o.status === 'completed' || o.status === 'approved' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-amber-500/20 text-amber-500')}>{o.status}</Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-card/30 border-border/50">
                  <CardHeader className="flex flex-row items-center justify-between border-b border-white/5 pb-4">
                    <CardTitle className="text-sm font-headline font-bold uppercase tracking-tight">Recent Users</CardTitle>
                    <button onClick={() => setActiveTab('user-directory')} className="text-[10px] font-black uppercase text-primary hover:underline">View All</button>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <tbody className="divide-y divide-border/50">
                          {adminData.users.slice(0, 5).map((u: any) => (
                            <tr key={u.id} className="hover:bg-white/5 transition-colors">
                              <td className="py-3 px-4 font-bold text-xs">{u.name}</td>
                              <td className="py-3 px-4 text-[10px] text-muted-foreground">{u.email}</td>
                              <td className="py-3 px-4 text-right text-[10px] font-mono text-zinc-500">{u.createdAt?.toDate ? format(u.createdAt.toDate(), 'MMM d, HH:mm') : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
             </div>
          </TabsContent>

          <TabsContent value="phase-passers">
             <Card className="bg-card/40 border-border/50">
               <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-black tracking-widest">
                        <tr>
                          <th className="p-4">Trader Email</th>
                          <th className="p-4">Account ID</th>
                          <th className="p-4">Plan / Phase</th>
                          <th className="p-4 text-right">Final Balance</th>
                          <th className="p-4 text-right">Passed At</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {adminData.demoAccounts.filter((a:any)=>a.status === 'passed').length === 0 ? (
                          <tr><td colSpan={5} className="p-20 text-center text-muted-foreground italic">No phase passers detected.</td></tr>
                        ) : adminData.demoAccounts.filter((a:any)=>a.status === 'passed').map((a: any) => (
                          <tr key={a.id} className="hover:bg-white/5 transition-colors">
                            <td className="p-4 font-bold">{a.email}</td>
                            <td className="p-4 font-mono text-xs text-primary">{a.id}</td>
                            <td className="p-4 uppercase text-[10px] font-black text-zinc-400">{a.planType || a.plan} / {a.phase}</td>
                            <td className="p-4 text-right font-mono font-bold text-emerald-500">${(a.balance || 0).toLocaleString()}</td>
                            <td className="p-4 text-right text-xs text-muted-foreground">{a.passedAt?.toDate ? format(a.passedAt.toDate(), 'PPP p') : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
               </CardContent>
             </Card>
          </TabsContent>

          <TabsContent value="payout-hub">
             <Card className="bg-card/40 border-border/50">
               <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-black tracking-widest">
                        <tr>
                          <th className="p-4">Requested</th>
                          <th className="p-4">Trader Email</th>
                          <th className="p-4">Method / Address</th>
                          <th className="p-4 text-right">Amount</th>
                          <th className="p-4 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {adminData.payouts.map((p: any) => (
                          <tr key={p.id} className="hover:bg-white/5 transition-colors">
                            <td className="p-4 text-xs font-mono text-zinc-500">{p.createdAt?.toDate ? format(p.createdAt.toDate(), 'MMM d, HH:mm') : '—'}</td>
                            <td className="p-4 font-bold">{p.email}</td>
                            <td className="p-4">
                              <p className="text-[10px] font-black uppercase text-primary">{p.method}</p>
                              <p className="text-[9px] font-mono text-muted-foreground break-all max-w-[200px]">{p.address}</p>
                            </td>
                            <td className="p-4 text-right font-headline font-bold text-emerald-500">${p.amount}</td>
                            <td className="p-4 text-right">
                              <Badge className={cn("uppercase text-[8px] font-black", p.status === 'done' ? 'bg-emerald-500' : p.status === 'rejected' ? 'bg-destructive' : 'bg-amber-500')}>
                                {p.status}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
               </CardContent>
             </Card>
          </TabsContent>

          <TabsContent value="trading-nodes" className="space-y-6">
             <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <h2 className="text-xl font-headline font-bold uppercase tracking-tight">Active Nodes ({adminData.totalNodesCount})</h2>
                <div className="relative w-full md:w-96">
                   <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                   <Input 
                    placeholder="Search by ID, email, or label..." 
                    value={searchTerm} 
                    onChange={e => setSearchTerm(e.target.value)} 
                    className="pl-10 bg-secondary/30"
                   />
                </div>
             </div>
             <Card className="bg-card/40 border-border/50">
               <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-black tracking-widest">
                        <tr>
                          <th className="p-4">Account ID</th>
                          <th className="p-4">Trader / Email</th>
                          <th className="p-4 text-right">Balance</th>
                          <th className="p-4 text-right">Equity</th>
                          <th className="p-4">Status</th>
                          <th className="p-4 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {filteredNodes.map((a: any) => (
                          <tr key={a.id} className="hover:bg-white/5 transition-colors">
                            <td className="p-4 font-mono text-xs text-primary">{a.id}</td>
                            <td className="p-4">
                              <p className="font-bold text-xs">{a.label || 'Challenge Node'}</p>
                              <p className="text-[10px] text-muted-foreground">{a.email}</p>
                            </td>
                            <td className="p-4 text-right font-mono font-bold text-white">${(a.balance || 0).toLocaleString()}</td>
                            <td className="p-4 text-right font-mono font-bold text-primary">${(a.equity || 0).toLocaleString()}</td>
                            <td className="p-4">
                              <Badge className="bg-emerald-500/20 text-emerald-500 uppercase text-[8px] font-black">Active</Badge>
                            </td>
                            <td className="p-4 text-right">
                               <div className="flex justify-end gap-2">
                                  <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-primary/20 text-primary" asChild>
                                    <Link href={`/demo?accountId=${a.id}`} target="_blank"><Eye size={14} /></Link>
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-amber-500/20 text-amber-500" onClick={() => handleResetAccount(a.id)}>
                                    <RotateCcw size={14} />
                                  </Button>
                               </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
               </CardContent>
             </Card>
          </TabsContent>

          <TabsContent value="breaches" className="space-y-6">
             <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input 
                  placeholder="Search by email, account, or reason..." 
                  className="pl-10 bg-secondary/30"
                />
             </div>
             <Card className="bg-card/40 border-border/50">
               <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-black tracking-widest">
                        <tr>
                          <th className="p-4">Date</th>
                          <th className="p-4">Trader Email</th>
                          <th className="p-4">Account ID</th>
                          <th className="p-4">Plan / Phase</th>
                          <th className="p-4">Reason</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {adminData.demoAccounts.filter((a:any)=>a.status === 'blown' || a.status === 'breach').map((a: any) => (
                          <tr key={a.id} className="hover:bg-white/5 transition-colors">
                            <td className="p-4 text-xs font-mono text-zinc-500">{a.blownAt?.toDate ? format(a.blownAt.toDate(), 'MMM d, HH:mm') : '—'}</td>
                            <td className="p-4 font-bold text-xs">{a.email}</td>
                            <td className="p-4 font-mono text-xs text-primary">{a.id}</td>
                            <td className="p-4 uppercase text-[9px] font-black text-zinc-400">{a.planType || a.plan} / {a.phase}</td>
                            <td className="p-4">
                               <p className="text-[10px] font-bold text-destructive leading-tight italic max-w-xs">{a.breachReason || 'Risk breach protocol triggered.'}</p>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
               </CardContent>
             </Card>
          </TabsContent>

          <TabsContent value="order-review" className="space-y-6">
             <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input 
                  placeholder="Search by ID, email, hash, or plan..." 
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="pl-10 bg-secondary/30"
                />
             </div>
             <Card className="bg-card/40 border-border/50">
               <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-black tracking-widest">
                        <tr>
                          <th className="p-4">Order ID</th>
                          <th className="p-4">Trader / Plan</th>
                          <th className="p-4">Amount</th>
                          <th className="p-4">TX Hash</th>
                          <th className="p-4">Status</th>
                          <th className="p-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {filteredOrders.map((o: any) => {
                          const isValid = isValidTxHash(o.txHash, o.network || "Polygon");
                          const explorerBase = EXPLORERS[o.network || "Polygon"] || EXPLORERS["Polygon"];
                          return (
                            <tr key={o.id} className="hover:bg-white/5 transition-colors">
                              <td className="p-4 font-mono text-xs text-zinc-500">{o.id}</td>
                              <td className="p-4">
                                <p className="font-bold text-xs">{o.email}</p>
                                <p className="text-[9px] text-primary uppercase font-black">{o.accountSize} {o.plan}</p>
                              </td>
                              <td className="p-4 font-mono font-bold text-white">${o.amountPaid || o.amount}</td>
                              <td className="p-4">
                                 {o.txHash ? (
                                   <div className="flex flex-col gap-1">
                                      <a href={`${explorerBase}${o.txHash}`} target="_blank" className="text-primary hover:underline flex items-center gap-1 text-[10px] font-mono">
                                        {o.txHash.slice(0, 12)}... <ExternalLink size={10} />
                                      </a>
                                      {!isValid && <Badge variant="destructive" className="w-fit text-[7px] h-3 px-1">INVALID FORMAT</Badge>}
                                   </div>
                                 ) : <span className="text-[9px] text-zinc-600">NO HASH</span>}
                              </td>
                              <td className="p-4">
                                <Badge className={cn("uppercase text-[8px] font-black", o.status === 'completed' || o.status === 'approved' ? 'bg-emerald-500' : 'bg-amber-500')}>
                                  {o.status}
                                </Badge>
                              </td>
                              <td className="p-4 text-right">
                                 {o.paymentScreenshot && (
                                   <Button size="sm" variant="outline" className="h-7 text-[9px] font-bold" onClick={() => { setPreviewImage(o.paymentScreenshot); setIsImageModalOpen(true); }}>
                                     View Proof
                                   </Button>
                                 )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
               </CardContent>
             </Card>
          </TabsContent>

          <TabsContent value="referral-audit">
             <Card className="bg-card/40 border-border/50">
               <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-black tracking-widest">
                        <tr>
                          <th className="p-4">Date</th>
                          <th className="p-4">Referrer (ID)</th>
                          <th className="p-4">New Join (email)</th>
                          <th className="p-4 text-right">Commission</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {adminData.referrals.map((r: any) => (
                          <tr key={r.id} className="hover:bg-white/5 transition-colors">
                            <td className="p-4 text-xs font-mono text-zinc-500">{r.createdAt?.toDate ? format(r.createdAt.toDate(), 'MMM d, yyyy') : '—'}</td>
                            <td className="p-4 font-mono text-xs text-primary">{r.referrerId}</td>
                            <td className="p-4 font-bold text-xs">{r.referredUserEmail}</td>
                            <td className="p-4 text-right font-headline font-bold text-emerald-500">${(r.amount || 0).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
               </CardContent>
             </Card>
          </TabsContent>

          <TabsContent value="user-directory" className="space-y-6">
             <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <h2 className="text-xl font-headline font-bold uppercase tracking-tight">User Directory ({adminData.totalUsersCount})</h2>
                <div className="relative w-full md:w-96">
                   <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                   <Input 
                    placeholder="Search by name, email, or trader ID..." 
                    value={searchTerm} 
                    onChange={e => setSearchTerm(e.target.value)} 
                    className="pl-10 bg-secondary/30"
                   />
                </div>
             </div>
             <Card className="bg-card/40 border-border/50">
               <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-black tracking-widest">
                        <tr>
                          <th className="p-4">Trader (Name + Email)</th>
                          <th className="p-4">Trader ID</th>
                          <th className="p-4">Joined</th>
                          <th className="p-4">Status</th>
                          <th className="p-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {filteredUsers.map((u: any) => (
                          <tr key={u.id} className="hover:bg-white/5 transition-colors">
                            <td className="p-4">
                              <p className="font-bold text-xs">{u.name}</p>
                              <p className="text-[10px] text-muted-foreground">{u.email}</p>
                            </td>
                            <td className="p-4 font-mono text-xs text-primary">{u.traderId}</td>
                            <td className="p-4 text-xs text-zinc-500">{u.createdAt?.toDate ? format(u.createdAt.toDate(), 'MMM d, yyyy') : '—'}</td>
                            <td className="p-4">
                              <Badge className="bg-emerald-500/20 text-emerald-500 uppercase text-[8px] font-black">Active</Badge>
                            </td>
                            <td className="p-4 text-right">
                               <Button size="sm" variant="outline" className="h-7 text-[9px] font-bold">Manage</Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
               </CardContent>
             </Card>
          </TabsContent>

          <TabsContent value="kyc-hub">
             <Card className="bg-card/40 border-border/50">
               <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-black tracking-widest">
                        <tr>
                          <th className="p-4">Trader (Name + Email)</th>
                          <th className="p-4">Submitted</th>
                          <th className="p-4">Status</th>
                          <th className="p-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {adminData.users.filter((u:any)=>u.kycStatus === 'pending' || u.kycVerified).map((u: any) => (
                          <tr key={u.id} className="hover:bg-white/5 transition-colors">
                            <td className="p-4">
                              <p className="font-bold text-xs">{u.name}</p>
                              <p className="text-[10px] text-muted-foreground">{u.email}</p>
                            </td>
                            <td className="p-4 text-xs font-mono text-zinc-500">{u.kycSubmittedAt ? format(new Date(u.kycSubmittedAt), 'MMM d, yyyy') : '—'}</td>
                            <td className="p-4">
                              <Badge className={cn("uppercase text-[8px] font-black", u.kycVerified ? 'bg-emerald-500' : 'bg-amber-500')}>
                                {u.kycVerified ? 'Verified' : 'Pending'}
                              </Badge>
                            </td>
                            <td className="p-4 text-right">
                               <Button size="sm" variant="outline" className="h-7 text-[9px] font-bold" onClick={() => { setPreviewImage(u.idProofUrl); setIsImageModalOpen(true); }}>View Docs</Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
               </CardContent>
             </Card>
          </TabsContent>

          <TabsContent value="broadcasts" className="space-y-6">
             <div className="flex justify-between items-center">
                <h2 className="text-xl font-headline font-bold uppercase tracking-tight">System Broadcasts</h2>
                <Button className="h-10 rounded-xl font-bold bg-primary text-black">
                  <Plus className="w-4 h-4 mr-2" /> New Broadcast
                </Button>
             </div>
             <Card className="bg-card/40 border-border/50">
               <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-black tracking-widest">
                        <tr>
                          <th className="p-4">Sent At</th>
                          <th className="p-4">Title</th>
                          <th className="p-4">Message</th>
                          <th className="p-4 text-right">Type</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {adminData.broadcasts.map((b: any) => (
                          <tr key={b.id} className="hover:bg-white/5 transition-colors">
                            <td className="p-4 text-xs font-mono text-zinc-500">{b.sentAt?.toDate ? format(b.sentAt.toDate(), 'MMM d, HH:mm') : '—'}</td>
                            <td className="p-4 font-bold text-xs">{b.title}</td>
                            <td className="p-4 text-xs text-zinc-400 max-w-md truncate">{b.message}</td>
                            <td className="p-4 text-right">
                              <Badge variant="outline" className={cn("uppercase text-[8px] font-black", b.type === 'warning' ? 'border-amber-500 text-amber-500' : 'border-primary text-primary')}>
                                {b.type || 'info'}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
               </CardContent>
             </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Image Preview Modal */}
      <Dialog open={isImageModalOpen} onOpenChange={setIsImageModalOpen}>
        <DialogContent className="max-w-4xl p-2 bg-zinc-950 border-white/10">
           <DialogHeader className="sr-only">
             <DialogTitle>Verification Document Preview</DialogTitle>
           </DialogHeader>
           <div className="relative aspect-video w-full">
              {previewImage && <Image src={previewImage} alt="Verification" fill className="object-contain" unoptimized />}
           </div>
        </DialogContent>
      </Dialog>

      {/* Admin Auth Modal */}
      <Dialog open={showAdminModal} onOpenChange={setShowAdminModal}>
        <DialogContent className="bg-black/95 border-primary/30 text-white">
          <DialogHeader><DialogTitle className="text-center">Admin Access Restricted</DialogTitle></DialogHeader>
          <form onSubmit={handleAdminAuth} className="space-y-6 pt-4">
            <div className="space-y-2">
              <Label className="uppercase text-[10px] font-black tracking-widest text-zinc-500">Master Secret Key</Label>
              <Input type="password" value={adminPasswordInput} onChange={(e) => setAdminPasswordInput(e.target.value)} placeholder="••••••••" required />
            </div>
            {adminError && <p className="text-center text-xs text-destructive">{adminError}</p>}
            <Button type="submit" className="w-full h-12 font-black cyan-box-glow">AUTHENTICATE SESSION</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
