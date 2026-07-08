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
  Users, Activity, Search, Loader2, Database, ShieldCheck, RefreshCw, BarChart2, Monitor, Clock, Trophy, Skull, Megaphone, RotateCcw, Zap, Link as LinkIcon, Plus, Eye, Check, XCircle, Gift, History, ShieldAlert
} from 'lucide-react';
import { updateOrderStatusAction, resetDemoAccountAction, sendGlobalBroadcastAction, approveManualOrderAction, resetAllHistoryAction, giftAccountAction, updateKycStatusAction, updatePayoutStatusAction } from './actions';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import Image from 'next/image';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, orderBy, limit, where, getCountFromServer, doc } from 'firebase/firestore';
import { useAuth } from '@/context/AuthContext';
import { ADMIN_EMAILS } from '@/lib/admin';
import { EXPLORERS } from '@/lib/onChainVerification';
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
          <Badge variant="outline" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground border-white/10">LIVE</Badge>
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
  
  // STATS STATE
  const [stats, setStats] = useState({ 
    totalUsersCount: 0, totalNodesCount: 0, totalAum: 0, pendingOrdersCount: 0, phasePassersCount: 0, totalLiquidationCount: 0 
  });

  // TAB DATA STATE (Lazy Loading)
  const [tabData, setTabData] = useState<any>({
    users: [], orders: [], payouts: [], referrals: [], broadcasts: [], demoAccounts: [], breaches: []
  });

  const [isLoading, setIsLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const { toast } = useToast();

  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const [isBroadcastModalOpen, setIsBroadcastModalOpen] = useState(false);
  const [broadcastForm, setBroadcastForm] = useState({ title: '', message: '', type: 'info' });
  
  const [isGiftModalOpen, setIsGiftModalOpen] = useState(false);
  const [giftForm, setGiftForm] = useState({ traderId: '', email: '', plan: '1-step-pro', size: 100000 });

  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  const [inspectUser, setInspectUser] = useState<any>(null);
  const [inspectNodes, setInspectNodes] = useState<any[]>([]);
  const [inspectTrades, setInspectTrades] = useState<any[]>([]);

  const instanceId = "Studio-8383940162";

  const isAuthorized = useMemo(() => {
    return user && ADMIN_EMAILS.includes(user.email || "");
  }, [user]);

  // OPTIMIZED STATS REFRESH (Decoupled from Tab Switch to save Quota)
  const refreshStats = useCallback(async () => {
    if (!isAuthenticated || !isAuthorized) return;
    
    try {
      const [userCountSnap, accountsCountSnap, liquidSnap, passedSnap, ordersSnap] = await Promise.all([
        getCountFromServer(collection(db, 'users')),
        getCountFromServer(collection(db, 'demoAccounts')),
        getCountFromServer(query(collection(db, 'demoAccounts'), where('status', 'in', ['blown', 'breach', 'terminated']))),
        getCountFromServer(query(collection(db, 'demoAccounts'), where('status', '==', 'passed'))),
        getDocs(query(collection(db, 'orders'), limit(100), orderBy('createdAt', 'desc')))
      ]);

      const orders = ordersSnap.docs.map(d => d.data());
      const pendingOrders = orders.filter((o: any) => o.status === 'pending' || o.status === 'manual_review').length;

      setStats({
        totalUsersCount: userCountSnap.data().count,
        totalNodesCount: accountsCountSnap.data().count,
        totalLiquidationCount: liquidSnap.data().count,
        phasePassersCount: passedSnap.data().count,
        pendingOrdersCount: pendingOrders,
        totalAum: accountsCountSnap.data().count * 50000 
      });
    } catch (err: any) {
      console.error('[Admin-Stats] Quota or Auth fault:', err.message);
    }
  }, [isAuthenticated, isAuthorized]);

  // LAZY DATA FETCHING BY TAB (With strict limits)
  const fetchTabData = useCallback(async (tab: string) => {
    if (!isAuthenticated || !isAuthorized) return;
    setIsLoading(true);

    try {
      let snap: any;
      switch(tab) {
        case 'overview':
          const [oSnap, uSnap] = await Promise.all([
            getDocs(query(collection(db, 'orders'), limit(10), orderBy('createdAt', 'desc'))),
            getDocs(query(collection(db, 'users'), limit(10), orderBy('createdAt', 'desc')))
          ]);
          setTabData((prev: any) => ({ 
            ...prev, 
            orders: oSnap.docs.map(d => ({ id: d.id, ...d.data() })),
            users: uSnap.docs.map(d => ({ id: d.id, ...d.data() }))
          }));
          break;
        case 'user-directory':
          snap = await getDocs(query(collection(db, 'users'), limit(100), orderBy('createdAt', 'desc')));
          setTabData((prev: any) => ({ ...prev, users: snap.docs.map((d: any) => ({ id: d.id, ...d.data() })) }));
          break;
        case 'trading-nodes':
        case 'phase-passers':
          snap = await getDocs(query(collection(db, 'demoAccounts'), limit(100), orderBy('createdAt', 'desc')));
          setTabData((prev: any) => ({ ...prev, demoAccounts: snap.docs.map((d: any) => ({ id: d.id, ...d.data() })) }));
          break;
        case 'payout-hub':
          snap = await getDocs(query(collection(db, 'payouts'), limit(50), orderBy('createdAt', 'desc')));
          setTabData((prev: any) => ({ ...prev, payouts: snap.docs.map((d: any) => ({ id: d.id, ...d.data() })) }));
          break;
        case 'order-review':
          snap = await getDocs(query(collection(db, 'orders'), limit(100), orderBy('createdAt', 'desc')));
          setTabData((prev: any) => ({ ...prev, orders: snap.docs.map((d: any) => ({ id: d.id, ...d.data() })) }));
          break;
        case 'referral-audit':
          snap = await getDocs(query(collection(db, 'referrals'), limit(100), orderBy('createdAt', 'desc')));
          setTabData((prev: any) => ({ ...prev, referrals: snap.docs.map((d: any) => ({ id: d.id, ...d.data() })) }));
          break;
        case 'broadcasts':
          snap = await getDocs(query(collection(db, 'broadcasts'), limit(50), orderBy('sentAt', 'desc')));
          setTabData((prev: any) => ({ ...prev, broadcasts: snap.docs.map((d: any) => ({ id: d.id, ...d.data() })) }));
          break;
        case 'breaches':
          snap = await getDocs(query(collection(db, 'demoAccounts'), where('status', 'in', ['blown', 'breach', 'terminated']), limit(100), orderBy('updatedAt', 'desc')));
          setTabData((prev: any) => ({ ...prev, breaches: snap.docs.map((d: any) => ({ id: d.id, ...d.data() })) }));
          break;
      }
    } catch (e: any) {
      toast({ variant: "destructive", title: "Fetch Error", description: e.message });
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, isAuthorized, toast]);

  useEffect(() => {
    const isVerified = localStorage.getItem('adminVerified') === 'true';
    if (isVerified) setIsAuthenticated(true);
    else setShowAdminModal(true);
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      // Refresh stats on first mount only
      if (stats.totalUsersCount === 0) refreshStats();
      fetchTabData(activeTab);
    }
  }, [isAuthenticated, activeTab, fetchTabData, refreshStats, stats.totalUsersCount]);

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
        refreshStats();
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
        fetchTabData(activeTab);
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
        getDocs(query(collection(db, 'demoTrades'), where('userId', '==', user.id), limit(50), orderBy('openedAt', 'desc')))
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
        fetchTabData('broadcasts');
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
        refreshStats();
      } else throw new Error(res.error);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Gift Failed", description: e.message });
    } finally { setActionLoading(false); }
  };

  const handleUpdateKycStatus = async (userId: string, status: string) => {
    setActionLoading(true);
    try {
      const res = await updateKycStatusAction(userId, status);
      if (res.success) {
        toast({ title: `KYC ${status}` });
        fetchTabData(activeTab);
      }
    } finally { setActionLoading(false); }
  };

  const handleUpdatePayoutStatus = async (payoutId: string, status: string) => {
    setActionLoading(true);
    try {
      const res = await updatePayoutStatusAction(payoutId, status);
      if (res.success) {
        toast({ title: `Payout ${status}` });
        fetchTabData(activeTab);
      }
    } finally { setActionLoading(false); }
  };

  // Filter Logic
  const filteredNodes = useMemo(() => (tabData.demoAccounts || []).filter((a: any) => {
    const term = searchTerm.toLowerCase();
    return a.id.toLowerCase().includes(term) || a.email?.toLowerCase().includes(term) || a.label?.toLowerCase().includes(term);
  }), [tabData.demoAccounts, searchTerm]);

  const filteredUsers = useMemo(() => (tabData.users || []).filter((u: any) => {
    const term = searchTerm.toLowerCase();
    return u.name?.toLowerCase().includes(term) || u.email?.toLowerCase().includes(term) || u.traderId?.toLowerCase().includes(term);
  }), [tabData.users, searchTerm]);

  const phasePassers = useMemo(() => (tabData.demoAccounts || []).filter((a: any) => a.status === 'passed'), [tabData.demoAccounts]);
  const kycUsers = useMemo(() => (tabData.users || []).filter((u: any) => u.kycStatus && u.kycStatus !== 'none'), [tabData.users]);
  const breachedAccounts = tabData.breaches || [];

  if (!isAuthenticated && !showAdminModal) return null;

  if (isAuthenticated && !isAuthorized && !isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <ShieldAlert className="w-16 h-16 text-destructive mb-6 animate-pulse" />
        <h2 className="text-3xl font-headline font-bold text-white mb-2 uppercase tracking-tight">Firebase Authorization Failed</h2>
        <p className="text-muted-foreground max-w-md mx-auto mb-8">Your account ({user?.email}) is not registered in the institutional master list. Administrative access denied by security rules.</p>
        <Button className="font-black px-10 h-12 rounded-xl" onClick={() => window.location.href = '/'}>Return to Terminal</Button>
      </div>
    );
  }

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
                <Button variant="outline" className="h-10 w-10 p-0 rounded-xl border-white/10" onClick={() => { refreshStats(); fetchTabData(activeTab); }} disabled={isLoading}>
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
                <StatCard title="Active Traders" value={stats.totalUsersCount} icon={<Users />} color="blue" />
                <StatCard title="Total Volume" value={`$${(stats.totalAum / 1e6).toFixed(1)}M`} icon={<BarChart2 />} color="green" />
                <StatCard title="Registered Nodes" value={stats.totalNodesCount} icon={<Monitor />} color="purple" />
                <StatCard title="Pending Orders" value={stats.pendingOrdersCount} icon={<Clock />} color="amber" />
                <StatCard title="Phase Passers" value={stats.phasePassersCount} icon={<Trophy />} color="blue" />
                <StatCard title="Total Liquidation" value={stats.totalLiquidationCount} icon={<Skull />} color="red" />
             </div>
             <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <Card className="bg-card/30 border-border/50"><CardHeader className="flex flex-row items-center justify-between border-b border-white/5 pb-4"><CardTitle className="text-sm font-headline font-bold uppercase tracking-tight">Recent Orders</CardTitle><button onClick={() => setActiveTab('order-review')} className="text-[10px] font-black uppercase text-primary">View All</button></CardHeader><CardContent className="p-0"><table className="w-full text-sm text-left"><tbody className="divide-y divide-border/50">{tabData.orders?.slice(0, 5).map((o: any) => (<tr key={o.id} className="hover:bg-white/5 transition-colors"><td className="py-3 px-4 font-bold text-xs">{o.email}</td><td className="py-3 px-4 text-[10px] text-muted-foreground uppercase">{o.plan}</td><td className="py-3 px-4 text-right"><Badge className={cn("text-[8px] font-black uppercase", o.status === 'completed' || o.status === 'approved' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-amber-500/20 text-amber-500')}>{o.status}</Badge></td></tr>))}</tbody></table></CardContent></Card>
                <Card className="bg-card/30 border-border/50"><CardHeader className="flex flex-row items-center justify-between border-b border-white/5 pb-4"><CardTitle className="text-sm font-headline font-bold uppercase tracking-tight">Recent Users</CardTitle><button onClick={() => setActiveTab('user-directory')} className="text-[10px] font-black uppercase text-primary">View All</button></CardHeader><CardContent className="p-0"><table className="w-full text-sm text-left"><tbody className="divide-y divide-border/50">{tabData.users?.slice(0, 5).map((u: any) => (<tr key={u.id} className="hover:bg-white/5 transition-colors"><td className="py-3 px-4 font-bold text-xs">{u.name}</td><td className="py-3 px-4 text-[10px] text-muted-foreground">{u.email}</td><td className="py-3 px-4 text-right text-[10px] font-mono text-zinc-500">{u.createdAt?.toDate ? format(u.createdAt.toDate(), 'MMM d') : '—'}</td></tr>))}</tbody></table></CardContent></Card>
             </div>
          </TabsContent>

          <TabsContent value="phase-passers" className="space-y-6">
             <h2 className="text-xl font-headline font-bold uppercase tracking-tight">Phase Passers ({phasePassers.length})</h2>
             <Card className="bg-card/40 border-border/50"><CardContent className="p-0 overflow-x-auto"><table className="w-full text-sm text-left"><thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-black tracking-widest"><tr><th className="p-4">Trader Email</th><th className="p-4">Account ID</th><th className="p-4">Plan/Phase</th><th className="p-4 text-right">Balance</th><th className="p-4 text-right">Passed At</th></tr></thead><tbody className="divide-y divide-border/50">{phasePassers.length > 0 ? phasePassers.map((a: any) => (<tr key={a.id} className="hover:bg-white/5 transition-colors"><td className="p-4 text-xs font-bold">{a.email}</td><td className="p-4 font-mono text-xs text-primary">{a.id}</td><td className="p-4 uppercase text-[10px]">{a.planType} - {a.phase}</td><td className="p-4 text-right font-mono text-emerald-500">${(a.balance || 0).toLocaleString()}</td><td className="p-4 text-right text-xs text-zinc-500">{a.passedAt?.toDate ? format(a.passedAt.toDate(), 'MMM d, yyyy') : '—'}</td></tr>)) : (<tr><td colSpan={5} className="p-20 text-center text-muted-foreground italic">No phase passers detected.</td></tr>)}</tbody></table></CardContent></Card>
          </TabsContent>

          <TabsContent value="payout-hub" className="space-y-6">
             <h2 className="text-xl font-headline font-bold uppercase tracking-tight">Payout Requests</h2>
             <Card className="bg-card/40 border-border/50"><CardContent className="p-0 overflow-x-auto"><table className="w-full text-sm text-left"><thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-black tracking-widest"><tr><th className="p-4">Requested</th><th className="p-4">Trader Email</th><th className="p-4">Method/Address</th><th className="p-4 text-right">Amount</th><th className="p-4 text-right">Status</th></tr></thead><tbody className="divide-y divide-border/50">{tabData.payouts.map((p: any) => (<tr key={p.id} className="hover:bg-white/5 transition-colors"><td className="p-4 text-xs">{p.createdAt?.toDate ? format(p.createdAt.toDate(), 'MMM d, HH:mm') : '—'}</td><td className="p-4 font-bold text-xs">{p.email}</td><td className="p-4"><p className="text-[10px] uppercase font-black">{p.method}</p><p className="text-[10px] font-mono text-zinc-500 truncate max-w-xs">{p.address}</p></td><td className="p-4 text-right font-bold text-accent">${Number(p.amount).toLocaleString()}</td><td className="p-4 text-right"><div className="flex flex-col items-end gap-2"><Badge className={cn("uppercase text-[8px]", p.status === 'done' ? "bg-emerald-500/20 text-emerald-500" : p.status === 'pending' ? "bg-amber-500/20 text-amber-500" : "bg-destructive/20 text-destructive")}>{p.status}</Badge>{p.status === 'pending' && (<div className="flex gap-1"><Button size="sm" className="h-6 text-[8px] bg-emerald-600" onClick={() => handleUpdatePayoutStatus(p.id, 'done')}>Approve</Button><Button size="sm" variant="destructive" className="h-6 text-[8px]" onClick={() => handleUpdatePayoutStatus(p.id, 'rejected')}>Reject</Button></div>)}</div></td></tr>))}</tbody></table></CardContent></Card>
          </TabsContent>

          <TabsContent value="trading-nodes" className="space-y-6">
             <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <h2 className="text-xl font-headline font-bold uppercase tracking-tight">Active Nodes ({filteredNodes.length})</h2>
                <div className="relative w-full md:w-96"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input placeholder="Search Nodes..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10 bg-secondary/30" /></div>
             </div>
             <Card className="bg-card/40 border-border/50"><CardContent className="p-0 overflow-x-auto"><table className="w-full text-sm text-left"><thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-black tracking-widest"><tr><th className="p-4">Account ID</th><th className="p-4">Trader / Email</th><th className="p-4 text-right">Balance</th><th className="p-4 text-right">Equity</th><th className="p-4">Status</th><th className="p-4 text-right">Action</th></tr></thead><tbody className="divide-y divide-border/50">{filteredNodes.map((a: any) => { const isLiquidated = a.status === 'blown' || a.status === 'breach' || a.status === 'terminated'; return (<tr key={a.id} className="hover:bg-white/5 transition-colors"><td className="p-4 font-mono text-xs text-primary">{a.id}</td><td className="p-4"><p className="font-bold text-xs">{a.label}</p><p className="text-[10px] text-muted-foreground">{a.email}</p></td><td className="p-4 text-right font-mono text-white">${(a.balance || 0).toLocaleString()}</td><td className="p-4 text-right font-mono text-primary">${(a.equity || 0).toLocaleString()}</td><td className="p-4"><Badge className={cn("uppercase text-[8px] font-black", isLiquidated ? "bg-destructive text-white" : "bg-emerald-500/20 text-emerald-500")}>{isLiquidated ? 'Blown' : 'Active'}</Badge></td><td className="p-4 text-right"><div className="flex justify-end gap-2"><Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-primary/20 text-primary" asChild><Link href={`/demo?accountId=${a.id}`} target="_blank"><Eye size={14} /></Link></Button><Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-amber-500/20 text-amber-500" onClick={() => handleResetAccount(a.id)}><RotateCcw size={14} /></Button></div></td></tr>); })}</tbody></table></CardContent></Card>
          </TabsContent>

          <TabsContent value="breaches" className="space-y-6">
             <h2 className="text-xl font-headline font-bold uppercase tracking-tight">Breach Protocol Log</h2>
             <Card className="bg-card/40 border-border/50"><CardContent className="p-0 overflow-x-auto"><table className="w-full text-sm text-left"><thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-black tracking-widest"><tr><th className="p-4">Date</th><th className="p-4">Trader Email</th><th className="p-4">Account ID</th><th className="p-4">Plan/Phase</th><th className="p-4">Reason</th></tr></thead><tbody className="divide-y divide-border/50">{breachedAccounts.map((a: any) => (<tr key={a.id} className="hover:bg-white/5 transition-colors"><td className="p-4 text-xs">{a.blownAt?.toDate ? format(a.blownAt.toDate(), 'MMM d, HH:mm') : (a.updatedAt?.toDate ? format(a.updatedAt.toDate(), 'MMM d, HH:mm') : '—')}</td><td className="p-4 font-bold text-xs">{a.email}</td><td className="p-4 font-mono text-[10px] text-primary">{a.id}</td><td className="p-4 uppercase text-[10px]">{a.planType} - {a.phase}</td><td className="p-4 text-destructive text-xs font-medium leading-relaxed max-w-sm">{a.breachReason || 'Risk parameters exceeded.'}</td></tr>))}</tbody></table></CardContent></Card>
          </TabsContent>

          <TabsContent value="order-review" className="space-y-6">
             <h2 className="text-xl font-headline font-bold uppercase tracking-tight">Order Verification Pipeline</h2>
             <Card className="bg-card/40 border-border/50"><CardContent className="p-0 overflow-x-auto"><table className="w-full text-sm text-left"><thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-black tracking-widest"><tr><th className="p-4">Order ID</th><th className="p-4">Trader / Plan</th><th className="p-4 text-right">Amount</th><th className="p-4">TX Hash</th><th className="p-4">Status</th><th className="p-4 text-right">Actions</th></tr></thead><tbody className="divide-y divide-border/50">{tabData.orders.map((o: any) => { const explorer = EXPLORERS[o.network] || EXPLORERS.ERC20; return (<tr key={o.id} className="hover:bg-white/5 transition-colors"><td className="p-4 font-mono text-[10px]">{o.id}</td><td className="p-4"><p className="font-bold text-xs">{o.email}</p><p className="text-[10px] text-muted-foreground uppercase">{o.plan} - {o.accountSize}</p></td><td className="p-4 text-right font-mono text-white">${o.amountPaid}</td><td className="p-4"><div className="flex items-center gap-2">{o.txHash ? (<a href={`${explorer}${o.txHash}`} target="_blank" className="text-[10px] font-mono text-primary hover:underline truncate max-w-[100px]">{o.txHash}</a>) : (<span className="text-zinc-600 text-[10px]">No Hash</span>)}</div></td><td className="p-4"><Badge className={cn("uppercase text-[8px]", o.status === 'completed' ? "bg-emerald-500/20 text-emerald-500" : "bg-amber-500/20 text-amber-500")}>{o.status}</Badge></td><td className="p-4 text-right"><div className="flex justify-end gap-2">{o.paymentScreenshot && (<Button size="sm" variant="outline" className="h-7 text-[8px]" onClick={() => { setPreviewImage(o.paymentScreenshot); setIsImageModalOpen(true); }}>View Proof</Button>)}{o.status !== 'completed' && (<Button size="sm" className="h-7 text-[8px] bg-primary text-black" onClick={() => approveManualOrderAction(o.id)}>Approve</Button>)}</div></td></tr>); })}</tbody></table></CardContent></Card>
          </TabsContent>

          <TabsContent value="referral-audit" className="space-y-6">
             <h2 className="text-xl font-headline font-bold uppercase tracking-tight">Referral Ecosystem Audit</h2>
             <Card className="bg-card/40 border-border/50"><CardContent className="p-0 overflow-x-auto"><table className="w-full text-sm text-left"><thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-black tracking-widest"><tr><th className="p-4">Date</th><th className="p-4">Referrer (ID)</th><th className="p-4">New Join</th><th className="p-4 text-right">Commission</th></tr></thead><tbody className="divide-y divide-border/50">{tabData.referrals.map((r: any) => (<tr key={r.id} className="hover:bg-white/5 transition-colors"><td className="p-4 text-xs">{r.createdAt?.toDate ? format(r.createdAt.toDate(), 'MMM d, yyyy') : 'Recently'}</td><td className="p-4 font-mono text-[10px] text-primary">{r.referrerId}</td><td className="p-4 text-xs">{r.referredUserEmail}</td><td className="p-4 text-right font-bold text-emerald-500">${(r.amount || 0).toFixed(2)}</td></tr>))}</tbody></table></CardContent></Card>
          </TabsContent>

          <TabsContent value="user-directory" className="space-y-6">
             <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <h2 className="text-xl font-headline font-bold uppercase tracking-tight">User Directory ({stats.totalUsersCount})</h2>
                <div className="relative w-full md:w-96"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input placeholder="Search Users..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10 bg-secondary/30" /></div>
             </div>
             <Card className="bg-card/40 border-border/50"><CardContent className="p-0 overflow-x-auto"><table className="w-full text-sm text-left"><thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-black tracking-widest"><tr><th className="p-4">Trader (Name + Email)</th><th className="p-4">Trader ID</th><th className="p-4">Joined</th><th className="p-4">Status</th><th className="p-4 text-right">Actions</th></tr></thead><tbody className="divide-y divide-border/50">{filteredUsers.map((u: any) => (<tr key={u.id} className="hover:bg-white/5 transition-colors"><td className="p-4"><p className="font-bold text-xs">{u.name}</p><p className="text-[10px] text-muted-foreground">{u.email}</p></td><td className="p-4 font-mono text-xs text-primary">{u.traderId}</td><td className="p-4 text-xs text-zinc-500">{u.createdAt?.toDate ? format(u.createdAt.toDate(), 'MMM d, yyyy') : '—'}</td><td className="p-4"><Badge className="bg-emerald-500/20 text-emerald-500 uppercase text-[8px] font-black">Active</Badge></td><td className="p-4 text-right"><Button size="sm" variant="outline" className="h-7 text-[9px] font-bold" onClick={() => handleManageUser(u)}>Manage</Button></td></tr>))}</tbody></table></CardContent></Card>
          </TabsContent>

          <TabsContent value="kyc-hub" className="space-y-6">
             <h2 className="text-xl font-headline font-bold uppercase tracking-tight">Identity Review Queue</h2>
             <Card className="bg-card/40 border-border/50"><CardContent className="p-0 overflow-x-auto"><table className="w-full text-sm text-left"><thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-black tracking-widest"><tr><th className="p-4">Trader</th><th className="p-4">Submitted At</th><th className="p-4">Status</th><th className="p-4 text-right">Actions</th></tr></thead><tbody className="divide-y divide-border/50">{kycUsers.map((u: any) => (<tr key={u.id} className="hover:bg-white/5 transition-colors"><td className="p-4"><p className="font-bold text-xs">{u.name}</p><p className="text-[10px] text-muted-foreground">{u.email}</p></td><td className="p-4 text-xs">{u.kycSubmittedAt ? format(new Date(u.kycSubmittedAt), 'MMM d, HH:mm') : '—'}</td><td className="p-4"><Badge className={cn("uppercase text-[8px]", u.kycStatus === 'verified' ? "bg-emerald-500/20 text-emerald-500" : u.kycStatus === 'pending' ? "bg-amber-500/20 text-amber-500" : "bg-destructive/20 text-destructive")}>{u.kycStatus}</Badge></td><td className="p-4 text-right"><div className="flex justify-end gap-2">{u.idProofUrl && (<Button size="sm" variant="outline" className="h-7 text-[8px]" onClick={() => { setPreviewImage(u.idProofUrl); setIsImageModalOpen(true); }}>View Docs</Button>)}{u.kycStatus === 'pending' && (<><Button size="sm" className="h-7 text-[8px] bg-emerald-600" onClick={() => handleUpdateKycStatus(u.id, 'verified')}>Approve</Button><Button size="sm" variant="destructive" className="h-7 text-[8px]" onClick={() => handleUpdateKycStatus(u.id, 'rejected')}>Reject</Button></>)}</div></td></tr>))}</tbody></table></CardContent></Card>
          </TabsContent>

          <TabsContent value="broadcasts" className="space-y-6">
             <div className="flex justify-between items-center">
                <h2 className="text-xl font-headline font-bold uppercase tracking-tight">System Broadcasts</h2>
                <Button className="h-10 rounded-xl font-bold bg-primary text-black" onClick={() => setIsBroadcastModalOpen(true)}><Plus className="w-4 h-4 mr-2" /> New Broadcast</Button>
             </div>
             <Card className="bg-card/40 border-border/50"><CardContent className="p-0 overflow-x-auto"><table className="w-full text-sm text-left"><thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-black tracking-widest"><tr><th className="p-4">Sent At</th><th className="p-4">Title</th><th className="p-4">Message</th><th className="p-4 text-right">Type</th></tr></thead><tbody className="divide-y divide-border/50">{tabData.broadcasts.map((b: any) => (<tr key={b.id} className="hover:bg-white/5 transition-colors"><td className="p-4 text-xs font-mono text-zinc-500">{b.sentAt?.toDate ? format(b.sentAt.toDate(), 'MMM d, HH:mm') : '—'}</td><td className="p-4 font-bold text-xs">{b.title}</td><td className="p-4 text-xs text-zinc-400 max-w-md truncate">{b.message}</td><td className="p-4 text-right"><Badge variant="outline" className={cn("uppercase text-[8px] font-black", b.type === 'warning' ? 'border-amber-500 text-amber-500' : b.type === 'success' ? 'border-emerald-500 text-emerald-500' : 'border-primary text-primary')}>{b.type || 'info'}</Badge></td></tr>))}</tbody></table></CardContent></Card>
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
                 <TabsTrigger value="trading-nodes" className="font-bold text-xs">Trading Nodes ({inspectNodes.length})</TabsTrigger>
                 <TabsTrigger value="trade-ledger" className="font-bold text-xs">Trade Ledger</TabsTrigger>
                 <TabsTrigger value="breach-logs" className="font-bold text-xs">Breach Logs</TabsTrigger>
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
                       <p className="text-[8px] font-black uppercase text-zinc-500 mb-1">Historical P&L</p>
                       <p className={cn("text-xl font-bold font-mono", (inspectUser?.allTimePnl >= 0) ? "text-emerald-500" : "text-destructive")}>${(inspectUser?.allTimePnl || 0).toLocaleString()}</p>
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

              <TabsContent value="trading-nodes">
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

              <TabsContent value="trade-ledger">
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

              <TabsContent value="breach-logs">
                <div className="space-y-4">
                  {inspectNodes.filter(n => n.status === 'blown' || n.status === 'breach').map(n => (
                    <div key={n.id} className="p-4 rounded-xl bg-destructive/5 border border-destructive/20">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-[10px] font-black text-destructive uppercase tracking-widest">LIQUIDATION DETECTED</span>
                        <span className="text-[10px] font-mono text-zinc-500">{n.blownAt?.toDate ? format(n.blownAt.toDate(), 'MMM d, yyyy') : '—'}</span>
                      </div>
                      <p className="text-xs text-white font-bold mb-1">{n.label}</p>
                      <p className="text-[11px] text-zinc-400 italic">"{n.breachReason || 'Risk limit breach'}"</p>
                    </div>
                  ))}
                  {inspectNodes.filter(n => n.status === 'blown' || n.status === 'breach').length === 0 && (
                    <p className="text-center py-10 text-xs text-zinc-500">No breach events recorded for this user.</p>
                  )}
                </div>
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

      {/* MODAL: Image Preview (KYC/Order Proof) */}
      <Dialog open={isImageModalOpen} onOpenChange={setIsImageModalOpen}>
        <DialogContent className="max-w-4xl p-0 bg-black border-none">
          <DialogHeader className="sr-only"><DialogTitle>Document Preview</DialogTitle></DialogHeader>
          <div className="relative aspect-video w-full">
            {previewImage && (
              <Image src={previewImage} alt="Document Proof" fill className="object-contain" />
            )}
          </div>
          <div className="absolute top-4 right-4"><Button variant="secondary" size="icon" onClick={() => setIsImageModalOpen(false)}><XCircle /></Button></div>
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
