
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
import { updateOrderStatusAction, resetDemoAccountAction, sendGlobalBroadcastAction, manualBreachAccountAction, approveManualOrderAction, resetAllHistoryAction, giftAccountAction } from './actions';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import Image from 'next/image';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, orderBy, limit, where, getCountFromServer, onSnapshot, doc, getDoc } from 'firebase/firestore';
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

  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // New Modals State
  const [isBroadcastModalOpen, setIsBroadcastModalOpen] = useState(false);
  const [broadcastForm, setBroadcastForm] = useState({ title: '', message: '', type: 'info' });
  
  const [isGiftModalOpen, setIsGiftModalOpen] = useState(false);
  const [giftForm, setGiftForm] = useState({ traderId: '', email: '', plan: '1-step-pro', size: 100000 });

  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  const [inspectUser, setInspectUser] = useState<any>(null);
  const [inspectNodes, setInspectNodes] = useState<any[]>([]);
  const [inspectTrades, setInspectTrades] = useState<any[]>([]);

  // Instance ID
  const instanceId = "Studio-8383940162";

  const isAuthorized = useMemo(() => {
    return user && ADMIN_EMAILS.includes(user.email || "");
  }, [user]);

  const refreshData = useCallback(async () => {
    if (!isAuthenticated) return;
    if (!isAuthorized) {
       toast({
         variant: "destructive",
         title: "Firebase Authorization Failed",
         description: `Your account (${user?.email}) is not listed in ADMIN_EMAILS. Firestore queries will be blocked.`,
       });
       setIsLoading(false);
       return;
    }

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
  }, [isAuthenticated, isAuthorized, user?.email, toast]);

  useEffect(() => {
    const isVerified = localStorage.getItem('adminVerified') === 'true';
    if (isVerified) setIsAuthenticated(true);
    else setShowAdminModal(true);
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      refreshData();
      if (isAuthorized) {
        const unsub = onSnapshot(collection(db, 'users'), (snap) => {
          setAdminData((prev: any) => ({ ...prev, totalUsersCount: snap.size }));
        });
        return () => unsub();
      }
    }
  }, [isAuthenticated, isAuthorized, refreshData]);

  const handleAdminAuth = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPasswordInput === '93463962569392846256') {
      localStorage.setItem('adminVerified', 'true');
      setIsAuthenticated(true);
      setShowAdminModal(false);
    } else setAdminError('❌ Invalid credentials');
  };

  const handleResetHistory = async () => {
    if (!confirm('CRITICAL: This will PERMANENTLY DELETE all trade history for all users. Continue?')) return;
    setActionLoading(true);
    try {
      const res = await resetAllHistoryAction();
      if (res.success) {
        toast({ title: `Reset Complete: ${res.count} trades archived.` });
        refreshData();
      }
    } catch (e: any) {
      toast({ variant: "destructive", title: "Reset Failed", description: e.message });
    } finally { setActionLoading(false); }
  };

  const handleResetAccount = async (accountId: string) => {
    if (!confirm('Are you sure you want to reset this account? Balance will be restored to starting amount.')) return;
    setActionLoading(true);
    try {
      const res = await resetDemoAccountAction(accountId);
      if (res.success) {
        toast({ title: "Account Reset Complete" });
        refreshData();
      }
    } catch (e: any) {
      toast({ variant: "destructive", title: "Reset Failed", description: e.message });
    } finally { setActionLoading(false); }
  };

  const handleManageUser = async (user: any) => {
    setInspectUser(user);
    setIsManageModalOpen(true);
    setActionLoading(true);
    try {
      const [nodesSnap, tradesSnap] = await Promise.all([
        getDocs(query(collection(db, 'demoAccounts'), where('userId', '==', user.id))),
        getDocs(query(collection(db, 'demoTrades'), where('userId', '==', user.id), limit(100), orderBy('openedAt', 'desc')))
      ]);
      setInspectNodes(nodesSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setInspectTrades(tradesSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    } finally { setActionLoading(false); }
  };

  const handleDeployBroadcast = async () => {
    if (!broadcastForm.title || !broadcastForm.message) return;
    setActionLoading(true);
    try {
      const res = await sendGlobalBroadcastAction(broadcastForm);
      if (res.success) {
        toast({ title: "Broadcast Deployed Successfully" });
        setIsBroadcastModalOpen(false);
        setBroadcastForm({ title: '', message: '', type: 'info' });
        refreshData();
      }
    } catch (e: any) {
      toast({ variant: "destructive", title: "Broadcast Failed", description: e.message });
    } finally { setActionLoading(false); }
  };

  const handleGiftAccount = async () => {
    if (!giftForm.traderId && !giftForm.email) return;
    setActionLoading(true);
    try {
      const res = await giftAccountAction(
        giftForm.traderId, 
        giftForm.email, 
        `Gifted Challenge — $${giftForm.size / 1000}k`, 
        giftForm.size, 
        giftForm.plan, 
        'evaluation'
      );
      if (res.success) {
        toast({ title: "Account Gifted Successfully!" });
        setIsGiftModalOpen(false);
        refreshData();
      } else throw new Error(res.error);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Gift Failed", description: e.message });
    } finally { setActionLoading(false); }
  };

  // Filter Logic
  const filteredNodes = useMemo(() => adminData.demoAccounts.filter((a: any) => {
    const term = searchTerm.toLowerCase();
    return a.id.toLowerCase().includes(term) || a.email?.toLowerCase().includes(term) || a.label?.toLowerCase().includes(term);
  }), [adminData.demoAccounts, searchTerm]);

  const filteredUsers = useMemo(() => adminData.users.filter((u: any) => {
    const term = searchTerm.toLowerCase();
    return u.name?.toLowerCase().includes(term) || u.email?.toLowerCase().includes(term) || u.traderId?.toLowerCase().includes(term);
  }), [adminData.users, searchTerm]);

  if (!isAuthenticated && !showAdminModal) return null;

  return (
    <div className="flex min-h-screen bg-background text-white">
      <Navigation />
      <main className="flex-1 p-8 overflow-y-auto custom-scrollbar">
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
                <Button variant="outline" className="h-10 rounded-xl font-bold border-white/10 hover:bg-white/5" onClick={handleResetHistory} disabled={actionLoading}>
                  <RotateCcw className="w-4 h-4 mr-2" /> Friday Rule Reset
                </Button>
                <Button variant="outline" className="h-10 rounded-xl font-bold border-white/10 hover:bg-white/5" asChild>
                  <Link href="/admin/price-tracker"><Zap className="w-4 h-4 mr-2" /> Price Synchronizer</Link>
                </Button>
                <Button className="h-10 rounded-xl font-black bg-primary text-black hover:bg-primary/90" onClick={() => setIsGiftModalOpen(true)}>
                  <Gift className="w-4 h-4 mr-2" /> Gift Account
                </Button>
                <Button variant="outline" className="h-10 w-10 p-0 rounded-xl border-white/10" onClick={refreshData} disabled={isLoading}>
                  <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
                </Button>
             </div>
          </div>
        </header>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
          <div className="relative">
            <ScrollArea className="w-full">
              <TabsList className="bg-transparent h-12 w-full justify-start p-0 gap-8 border-b border-white/5 rounded-none">
                {['Overview', 'Phase Passers', 'Payout Hub', 'Trading Nodes', 'Breaches', 'Order Review', 'Referral Audit', 'User Directory', 'KYC Hub', 'Broadcasts'].map((tab) => (
                  <TabsTrigger key={tab} value={tab.toLowerCase().replace(' ', '-')} className="data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 h-full text-xs font-black uppercase tracking-widest text-muted-foreground">
                    {tab}
                  </TabsTrigger>
                ))}
              </TabsList>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </div>

          <TabsContent value="overview" className="space-y-8">
             <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <StatCard title="Active Traders" value={adminData.totalUsersCount} icon={<Users />} color="blue" />
                <StatCard title="Total Volume" value={`$${(adminData.totalAum / 1e6).toFixed(1)}M`} icon={<BarChart2 />} color="green" />
                <StatCard title="Registered Nodes" value={adminData.totalNodesCount} icon={<Monitor />} color="purple" />
                <StatCard title="Pending Orders" value={adminData.pendingOrdersCount} icon={<Clock />} color="amber" />
                <StatCard title="Phase Passers" value={adminData.phasePassersCount} icon={<Trophy />} color="blue" />
                <StatCard title="Total Liquidation" value={adminData.totalLiquidationCount} icon={<Skull />} color="red" />
             </div>
             <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <Card className="bg-card/30 border-border/50"><CardHeader className="flex flex-row items-center justify-between border-b border-white/5 pb-4"><CardTitle className="text-sm font-headline font-bold uppercase tracking-tight">Recent Orders</CardTitle><button onClick={() => setActiveTab('order-review')} className="text-[10px] font-black uppercase text-primary">View All</button></CardHeader><CardContent className="p-0"><table className="w-full text-sm text-left"><tbody className="divide-y divide-border/50">{adminData.orders.slice(0, 5).map((o: any) => (<tr key={o.id} className="hover:bg-white/5 transition-colors"><td className="py-3 px-4 font-bold text-xs">{o.email}</td><td className="py-3 px-4 text-[10px] text-muted-foreground uppercase">{o.plan}</td><td className="py-3 px-4 text-right"><Badge className={cn("text-[8px] font-black uppercase", o.status === 'completed' || o.status === 'approved' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-amber-500/20 text-amber-500')}>{o.status}</Badge></td></tr>))}</tbody></table></CardContent></Card>
                <Card className="bg-card/30 border-border/50"><CardHeader className="flex flex-row items-center justify-between border-b border-white/5 pb-4"><CardTitle className="text-sm font-headline font-bold uppercase tracking-tight">Recent Users</CardTitle><button onClick={() => setActiveTab('user-directory')} className="text-[10px] font-black uppercase text-primary">View All</button></CardHeader><CardContent className="p-0"><table className="w-full text-sm text-left"><tbody className="divide-y divide-border/50">{adminData.users.slice(0, 5).map((u: any) => (<tr key={u.id} className="hover:bg-white/5 transition-colors"><td className="py-3 px-4 font-bold text-xs">{u.name}</td><td className="py-3 px-4 text-[10px] text-muted-foreground">{u.email}</td><td className="py-3 px-4 text-right text-[10px] font-mono text-zinc-500">{u.createdAt?.toDate ? format(u.createdAt.toDate(), 'MMM d') : '—'}</td></tr>))}</tbody></table></CardContent></Card>
             </div>
          </TabsContent>

          <TabsContent value="trading-nodes" className="space-y-6">
             <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <h2 className="text-xl font-headline font-bold uppercase tracking-tight">Active Nodes ({adminData.totalNodesCount})</h2>
                <div className="relative w-full md:w-96"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input placeholder="Search Nodes..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10 bg-secondary/30" /></div>
             </div>
             <Card className="bg-card/40 border-border/50"><CardContent className="p-0 overflow-x-auto"><table className="w-full text-sm text-left"><thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-black tracking-widest"><tr><th className="p-4">Account ID</th><th className="p-4">Trader / Email</th><th className="p-4 text-right">Balance</th><th className="p-4 text-right">Equity</th><th className="p-4">Status</th><th className="p-4 text-right">Action</th></tr></thead><tbody className="divide-y divide-border/50">{filteredNodes.map((a: any) => (<tr key={a.id} className="hover:bg-white/5 transition-colors"><td className="p-4 font-mono text-xs text-primary">{a.id}</td><td className="p-4"><p className="font-bold text-xs">{a.label}</p><p className="text-[10px] text-muted-foreground">{a.email}</p></td><td className="p-4 text-right font-mono text-white">${(a.balance || 0).toLocaleString()}</td><td className="p-4 text-right font-mono text-primary">${(a.equity || 0).toLocaleString()}</td><td className="p-4"><Badge className={cn("uppercase text-[8px] font-black", (a.status === 'blown' || a.status === 'breach' || a.status === 'terminated') ? "bg-destructive text-white" : "bg-emerald-500/20 text-emerald-500")}>{(a.status === 'blown' || a.status === 'breach' || a.status === 'terminated') ? 'Blown' : 'Active'}</Badge></td><td className="p-4 text-right"><div className="flex justify-end gap-2"><Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-primary/20 text-primary" asChild><Link href={`/demo?accountId=${a.id}`} target="_blank"><Eye size={14} /></Link></Button><Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-amber-500/20 text-amber-500" onClick={() => handleResetAccount(a.id)}><RotateCcw size={14} /></Button></div></td></tr>))}</tbody></table></CardContent></Card>
          </TabsContent>

          <TabsContent value="user-directory" className="space-y-6">
             <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <h2 className="text-xl font-headline font-bold uppercase tracking-tight">User Directory ({adminData.totalUsersCount})</h2>
                <div className="relative w-full md:w-96"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input placeholder="Search Users..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10 bg-secondary/30" /></div>
             </div>
             <Card className="bg-card/40 border-border/50"><CardContent className="p-0 overflow-x-auto"><table className="w-full text-sm text-left"><thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-black tracking-widest"><tr><th className="p-4">Trader (Name + Email)</th><th className="p-4">Trader ID</th><th className="p-4">Joined</th><th className="p-4">Status</th><th className="p-4 text-right">Actions</th></tr></thead><tbody className="divide-y divide-border/50">{filteredUsers.map((u: any) => (<tr key={u.id} className="hover:bg-white/5 transition-colors"><td className="p-4"><p className="font-bold text-xs">{u.name}</p><p className="text-[10px] text-muted-foreground">{u.email}</p></td><td className="p-4 font-mono text-xs text-primary">{u.traderId}</td><td className="p-4 text-xs text-zinc-500">{u.createdAt?.toDate ? format(u.createdAt.toDate(), 'MMM d, yyyy') : '—'}</td><td className="p-4"><Badge className="bg-emerald-500/20 text-emerald-500 uppercase text-[8px] font-black">Active</Badge></td><td className="p-4 text-right"><Button size="sm" variant="outline" className="h-7 text-[9px] font-bold" onClick={() => handleManageUser(u)}>Manage</Button></td></tr>))}</tbody></table></CardContent></Card>
          </TabsContent>

          <TabsContent value="broadcasts" className="space-y-6">
             <div className="flex justify-between items-center">
                <h2 className="text-xl font-headline font-bold uppercase tracking-tight">System Broadcasts</h2>
                <Button className="h-10 rounded-xl font-bold bg-primary text-black" onClick={() => setIsBroadcastModalOpen(true)}><Plus className="w-4 h-4 mr-2" /> New Broadcast</Button>
             </div>
             <Card className="bg-card/40 border-border/50"><CardContent className="p-0 overflow-x-auto"><table className="w-full text-sm text-left"><thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-black tracking-widest"><tr><th className="p-4">Sent At</th><th className="p-4">Title</th><th className="p-4">Message</th><th className="p-4 text-right">Type</th></tr></thead><tbody className="divide-y divide-border/50">{adminData.broadcasts.map((b: any) => (<tr key={b.id} className="hover:bg-white/5 transition-colors"><td className="p-4 text-xs font-mono text-zinc-500">{b.sentAt?.toDate ? format(b.sentAt.toDate(), 'MMM d, HH:mm') : '—'}</td><td className="p-4 font-bold text-xs">{b.title}</td><td className="p-4 text-xs text-zinc-400 max-w-md truncate">{b.message}</td><td className="p-4 text-right"><Badge variant="outline" className={cn("uppercase text-[8px] font-black", b.type === 'warning' ? 'border-amber-500 text-amber-500' : b.type === 'success' ? 'border-emerald-500 text-emerald-500' : 'border-primary text-primary')}>{b.type || 'info'}</Badge></td></tr>))}</tbody></table></CardContent></Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* MODAL: Manage User */}
      <Dialog open={isManageModalOpen} onOpenChange={setIsManageModalOpen}>
        <DialogContent className="max-w-4xl bg-zinc-950 border-white/10 text-white max-h-[90vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="p-6 border-b border-white/5">
            <div className="flex justify-between items-start">
               <div>
                  <DialogTitle className="text-2xl font-headline font-bold">{inspectUser?.name}</DialogTitle>
                  <p className="text-sm text-zinc-500">{inspectUser?.email} | ID: {inspectUser?.traderId}</p>
               </div>
               <Badge className="bg-emerald-500/20 text-emerald-500 font-black uppercase text-[10px]">Active Session</Badge>
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
            <Tabs defaultValue="overview" className="space-y-6">
              <TabsList className="bg-secondary/50 w-full justify-start gap-4 h-11 px-2 border border-white/5 rounded-xl">
                 <TabsTrigger value="overview" className="font-bold text-xs">Profile Overview</TabsTrigger>
                 <TabsTrigger value="nodes" className="font-bold text-xs">Trading Nodes ({inspectNodes.length})</TabsTrigger>
                 <TabsTrigger value="history" className="font-bold text-xs">Trade Ledger</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-6">
                 <div className="grid grid-cols-3 gap-4">
                    <Card className="bg-secondary/20 p-4 border-white/5">
                       <p className="text-[8px] font-black uppercase text-zinc-500 mb-1">Total Balance</p>
                       <p className="text-xl font-bold font-mono text-white">${inspectNodes.reduce((a,c)=>a+(c.balance||0),0).toLocaleString()}</p>
                    </Card>
                    <Card className="bg-secondary/20 p-4 border-white/5">
                       <p className="text-[8px] font-black uppercase text-zinc-500 mb-1">Ref Earnings</p>
                       <p className="text-xl font-bold font-mono text-primary">${(inspectUser?.referralEarnings || 0).toLocaleString()}</p>
                    </Card>
                    <Card className="bg-secondary/20 p-4 border-white/5">
                       <p className="text-[8px] font-black uppercase text-zinc-500 mb-1">Session P&L</p>
                       <p className="text-xl font-bold font-mono text-emerald-500">+$2,450.00</p>
                    </Card>
                 </div>
                 <section className="space-y-4">
                    <h3 className="text-xs font-black uppercase tracking-widest text-primary border-b border-primary/20 pb-2">Metadata Diagnostic</h3>
                    <div className="grid grid-cols-2 gap-y-4 gap-x-8 text-xs">
                       <div className="flex justify-between border-b border-white/5 pb-2"><span className="text-zinc-500">Auth UID</span><span className="font-mono text-zinc-300">{inspectUser?.authUid || inspectUser?.id}</span></div>
                       <div className="flex justify-between border-b border-white/5 pb-2"><span className="text-zinc-500">Phone</span><span className="text-zinc-300">{inspectUser?.phone || 'N/A'}</span></div>
                       <div className="flex justify-between border-b border-white/5 pb-2"><span className="text-zinc-500">Country</span><span className="text-zinc-300">{inspectUser?.country || 'N/A'}</span></div>
                       <div className="flex justify-between border-b border-white/5 pb-2"><span className="text-zinc-500">Tier</span><span className="text-primary font-bold">{inspectUser?.tier || 'Bronze'}</span></div>
                    </div>
                 </section>
              </TabsContent>

              <TabsContent value="nodes">
                 <table className="w-full text-xs text-left">
                    <thead className="text-zinc-500 uppercase text-[9px] font-black">
                       <tr className="border-b border-white/5"><th className="py-2">Label</th><th className="py-2">Balance</th><th className="py-2">Status</th></tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                       {inspectNodes.map(n => (
                         <tr key={n.id}><td className="py-3 font-bold">{n.label}</td><td className="py-3 font-mono">${n.balance?.toLocaleString()}</td><td className="py-3"><Badge className="bg-emerald-500/20 text-emerald-500 text-[8px] uppercase">{n.status}</Badge></td></tr>
                       ))}
                    </tbody>
                 </table>
              </TabsContent>

              <TabsContent value="history">
                 <table className="w-full text-xs text-left">
                    <thead className="text-zinc-500 uppercase text-[9px] font-black">
                       <tr className="border-b border-white/5"><th className="py-2">Symbol</th><th className="py-2">Type</th><th className="py-2 text-right">PnL</th></tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                       {inspectTrades.slice(0, 10).map(t => (
                         <tr key={t.id}><td className="py-2 font-bold">{t.symbol}</td><td className="py-2 uppercase">{t.type}</td><td className={cn("py-2 text-right font-mono", t.pnl >=0 ? 'text-emerald-500' : 'text-destructive')}>${Number(t.pnl).toFixed(2)}</td></tr>
                       ))}
                    </tbody>
                 </table>
              </TabsContent>
            </Tabs>
          </div>
          <DialogFooter className="p-6 border-t border-white/5 bg-secondary/10">
            <Button className="font-bold h-11 px-8 rounded-xl" onClick={() => setIsManageModalOpen(false)}>Close Inspection</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: New Broadcast */}
      <Dialog open={isBroadcastModalOpen} onOpenChange={setIsBroadcastModalOpen}>
        <DialogContent className="bg-zinc-950 border-white/10 text-white max-w-lg">
          <DialogHeader><DialogTitle className="text-xl font-headline font-bold">Deploy Global Broadcast</DialogTitle><DialogDescription className="text-zinc-500 text-xs uppercase font-black tracking-widest">This will trigger real-time alerts for all users.</DialogDescription></DialogHeader>
          <div className="space-y-4 py-4">
             <div className="space-y-2"><Label className="text-[10px] uppercase font-black tracking-widest text-zinc-500">Broadcast Title</Label><Input value={broadcastForm.title} onChange={e => setBroadcastForm({...broadcastForm, title: e.target.value})} placeholder="Maintenance Update..." className="bg-secondary/30 border-white/5" /></div>
             <div className="space-y-2"><Label className="text-[10px] uppercase font-black tracking-widest text-zinc-500">Message Content</Label><Textarea value={broadcastForm.message} onChange={e => setBroadcastForm({...broadcastForm, message: e.target.value})} placeholder="Enter message here..." className="bg-secondary/30 border-white/5 h-32" /></div>
             <div className="space-y-2"><Label className="text-[10px] uppercase font-black tracking-widest text-zinc-500">Alert Level</Label>
                <Select value={broadcastForm.type} onValueChange={v => setBroadcastForm({...broadcastForm, type: v})}>
                   <SelectTrigger className="bg-secondary/30 border-white/5"><SelectValue /></SelectTrigger>
                   <SelectContent className="bg-zinc-900 border-white/10 text-white">
                      <SelectItem value="info">Information (Blue)</SelectItem>
                      <SelectItem value="warning">Warning (Amber)</SelectItem>
                      <SelectItem value="success">Success (Emerald)</SelectItem>
                   </SelectContent>
                </Select>
             </div>
          </div>
          <DialogFooter className="gap-2">
             <Button variant="ghost" onClick={() => setIsBroadcastModalOpen(false)}>Cancel</Button>
             <Button className="font-black bg-primary text-black px-8 h-11 rounded-xl" onClick={handleDeployBroadcast} disabled={actionLoading}>{actionLoading ? <Loader2 className="animate-spin" /> : <Megaphone className="w-4 h-4 mr-2" />} DEPLOY BROADCAST</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: Gift Account */}
      <Dialog open={isGiftModalOpen} onOpenChange={setIsGiftModalOpen}>
        <DialogContent className="bg-zinc-950 border-white/10 text-white max-w-lg">
          <DialogHeader><DialogTitle className="text-xl font-headline font-bold">Institutional Account Provisioning</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
             <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label className="text-[10px] uppercase font-black text-zinc-500">Trader ID</Label><Input value={giftForm.traderId} onChange={e => setGiftForm({...giftForm, traderId: e.target.value})} placeholder="e.g. 12345678" className="bg-secondary/30 border-white/5" /></div>
                <div className="space-y-2"><Label className="text-[10px] uppercase font-black text-zinc-500">OR Email Address</Label><Input value={giftForm.email} onChange={e => setGiftForm({...giftForm, email: e.target.value})} placeholder="trader@email.com" className="bg-secondary/30 border-white/5" /></div>
             </div>
             <div className="space-y-2"><Label className="text-[10px] uppercase font-black text-zinc-500">Challenge Plan</Label>
                <Select value={giftForm.plan} onValueChange={v => setGiftForm({...giftForm, plan: v})}>
                   <SelectTrigger className="bg-secondary/30 border-white/5"><SelectValue /></SelectTrigger>
                   <SelectContent className="bg-zinc-900 border-white/10 text-white">
                      <SelectItem value="1-step-pro">1-Step Pro</SelectItem>
                      <SelectItem value="2-step-classic">2-Step Classic</SelectItem>
                      <SelectItem value="3-step-classic">3-Step Classic</SelectItem>
                      <SelectItem value="instant-funding">Instant Funding</SelectItem>
                   </SelectContent>
                </Select>
             </div>
             <div className="space-y-2"><Label className="text-[10px] uppercase font-black text-zinc-500">Node Capacity (Balance)</Label>
                <Select value={String(giftForm.size)} onValueChange={v => setGiftForm({...giftForm, size: Number(v)})}>
                   <SelectTrigger className="bg-secondary/30 border-white/5"><SelectValue /></SelectTrigger>
                   <SelectContent className="bg-zinc-900 border-white/10 text-white">
                      <SelectItem value="10000">$10,000</SelectItem>
                      <SelectItem value="25000">$25,000</SelectItem>
                      <SelectItem value="50000">$50,000</SelectItem>
                      <SelectItem value="100000">$100,000</SelectItem>
                      <SelectItem value="200000">$200,000</SelectItem>
                   </SelectContent>
                </Select>
             </div>
          </div>
          <DialogFooter>
             <Button variant="ghost" onClick={() => setIsGiftModalOpen(false)}>Cancel</Button>
             <Button className="font-black bg-primary text-black px-8 h-11 rounded-xl" onClick={handleGiftAccount} disabled={actionLoading}>{actionLoading ? <Loader2 className="animate-spin" /> : "PROVISION ACCOUNT"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: Admin Password Auth */}
      <Dialog open={showAdminModal} onOpenChange={setShowAdminModal}>
        <DialogContent className="bg-zinc-950 border-white/10 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-center font-headline font-bold text-xl uppercase tracking-tighter">Identity Verification Required</DialogTitle>
            <DialogDescription className="text-center text-zinc-500 text-xs">Enter administrative master key to unlock terminal nodes.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAdminAuth} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Master Access Key</Label>
              <Input 
                type="password" 
                value={adminPasswordInput} 
                onChange={e => setAdminPasswordInput(e.target.value)} 
                className="bg-secondary/30 border-white/10 h-12 text-center text-xl font-mono tracking-widest"
                autoFocus
              />
            </div>
            {adminError && <p className="text-xs text-red-500 font-bold text-center animate-pulse">{adminError}</p>}
            <Button type="submit" className="w-full h-12 font-black bg-primary text-black rounded-xl">UNLOCK TERMINAL</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
