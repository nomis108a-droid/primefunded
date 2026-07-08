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
  Users, Activity, Search, Loader2, Database, ShieldCheck, RefreshCw, BarChart2, Monitor, Clock, Trophy, Skull, Megaphone, RotateCcw, Zap, Link as LinkIcon, Plus, Eye, Check, XCircle, Gift, History, ShieldAlert, FileImage, CheckCircle2, Trash2
} from 'lucide-react';
import { updateOrderStatusAction, resetDemoAccountAction, sendGlobalBroadcastAction, approveManualOrderAction, resetAllHistoryAction, giftAccountAction, updateKycStatusAction, updatePayoutStatusAction, cleanupDuplicateOrdersAction } from './actions';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import Image from 'next/image';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, orderBy, limit, where, getCountFromServer, doc } from 'firebase/firestore';
import { useAuth } from '@/context/AuthContext';
import { ADMIN_EMAILS } from '@/lib/admin';
import { EXPLORERS, isValidTxHash } from '@/lib/onChainVerification';
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
  
  const [stats, setStats] = useState({ 
    totalUsersCount: 0, totalNodesCount: 0, totalAum: 0, pendingOrdersCount: 0, phasePassersCount: 0, totalLiquidationCount: 0 
  });

  const [tabData, setTabData] = useState<any>({
    users: [], orders: [], payouts: [], referrals: [], broadcasts: [], demoAccounts: [], breaches: []
  });

  const [isLoading, setIsLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const { toast } = useToast();

  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const [isKycModalOpen, setIsKycModalOpen] = useState(false);
  const [kycInquiryUser, setKycInquiryUser] = useState<any>(null);

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

  const refreshStats = useCallback(async () => {
    if (!isAuthenticated || !isAuthorized) return;
    
    try {
      const [userCountSnap, accountsCountSnap, liquidSnap, passedSnap, ordersCountSnap] = await Promise.all([
        getCountFromServer(collection(db, 'users')),
        getCountFromServer(collection(db, 'demoAccounts')),
        getCountFromServer(query(collection(db, 'demoAccounts'), where('status', 'in', ['blown', 'breach', 'terminated']))),
        getCountFromServer(query(collection(db, 'demoAccounts'), where('status', '==', 'passed'))),
        getCountFromServer(query(collection(db, 'orders'), where('status', 'in', ['pending', 'manual_review', 'waiting'])))
      ]);

      setStats({
        totalUsersCount: userCountSnap.data().count,
        totalNodesCount: accountsCountSnap.data().count,
        totalLiquidationCount: liquidSnap.data().count,
        phasePassersCount: passedSnap.data().count,
        pendingOrdersCount: ordersCountSnap.data().count,
        totalAum: accountsCountSnap.data().count * 50000 
      });
    } catch (err: any) {
      console.error('[Admin-Stats] Quota or Auth fault:', err.message);
    }
  }, [isAuthenticated, isAuthorized]);

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
          snap = await getDocs(query(collection(db, 'users'), limit(50), orderBy('createdAt', 'desc')));
          setTabData((prev: any) => ({ ...prev, users: snap.docs.map((d: any) => ({ id: d.id, ...d.data() })) }));
          break;
        case 'trading-nodes':
        case 'phase-passers':
          snap = await getDocs(query(collection(db, 'demoAccounts'), limit(50), orderBy('createdAt', 'desc')));
          setTabData((prev: any) => ({ ...prev, demoAccounts: snap.docs.map((d: any) => ({ id: d.id, ...d.data() })) }));
          break;
        case 'payout-hub':
          snap = await getDocs(query(collection(db, 'payouts'), limit(20), orderBy('createdAt', 'desc')));
          setTabData((prev: any) => ({ ...prev, payouts: snap.docs.map((d: any) => ({ id: d.id, ...d.data() })) }));
          break;
        case 'order-review':
          snap = await getDocs(query(collection(db, 'orders'), limit(50), orderBy('createdAt', 'desc')));
          setTabData((prev: any) => ({ ...prev, orders: snap.docs.map((d: any) => ({ id: d.id, ...d.data() })) }));
          break;
        case 'referral-audit':
          snap = await getDocs(query(collection(db, 'referrals'), limit(50), orderBy('createdAt', 'desc')));
          setTabData((prev: any) => ({ ...prev, referrals: snap.docs.map((d: any) => ({ id: d.id, ...d.data() })) }));
          break;
        case 'broadcasts':
          snap = await getDocs(query(collection(db, 'broadcasts'), limit(20), orderBy('sentAt', 'desc')));
          setTabData((prev: any) => ({ ...prev, broadcasts: snap.docs.map((d: any) => ({ id: d.id, ...d.data() })) }));
          break;
        case 'breaches':
          snap = await getDocs(query(collection(db, 'demoAccounts'), where('status', 'in', ['blown', 'breach', 'terminated']), limit(50), orderBy('updatedAt', 'desc')));
          setTabData((prev: any) => ({ ...prev, breaches: snap.docs.map((d: any) => ({ id: d.id, ...d.data() })) }));
          break;
        case 'kyc-hub':
          snap = await getDocs(query(collection(db, 'users'), where('kycStatus', '!=', 'none'), limit(50)));
          setTabData((prev: any) => ({ ...prev, users: snap.docs.map((d: any) => ({ id: d.id, ...d.data() })) }));
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
      refreshStats();
      fetchTabData(activeTab);
    }
  }, [isAuthenticated, activeTab, fetchTabData, refreshStats]);

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

  const handleCleanupDuplicates = async () => {
    setActionLoading(true);
    try {
      const res = await cleanupDuplicateOrdersAction();
      if (res.success) {
        toast({ title: "Cleanup Successful", description: `${res.count} duplicate orders purged.` });
        fetchTabData('order-review');
      } else throw new Error(res.error);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Cleanup Failed", description: e.message });
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
        getDocs(query(collection(db, 'demoAccounts'), where('userId', '==', user.id), limit(10))),
        getDocs(query(collection(db, 'demoTrades'), where('userId', '==', user.id), limit(20), orderBy('openedAt', 'desc')))
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
        setIsKycModalOpen(false);
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

  const filteredNodes = useMemo(() => (tabData.demoAccounts || []).filter((a: any) => {
    const term = searchTerm.toLowerCase();
    return a.id.toLowerCase().includes(term) || a.email?.toLowerCase().includes(term) || a.label?.toLowerCase().includes(term);
  }), [tabData.demoAccounts, searchTerm]);

  const filteredUsers = useMemo(() => (tabData.users || []).filter((u: any) => {
    const term = searchTerm.toLowerCase();
    return u.name?.toLowerCase().includes(term) || u.email?.toLowerCase().includes(term) || u.traderId?.toLowerCase().includes(term);
  }), [tabData.users, searchTerm]);

  const filteredOrders = useMemo(() => (tabData.orders || []).filter((o: any) => {
    const term = searchTerm.toLowerCase();
    return o.id.toLowerCase().includes(term) || o.email?.toLowerCase().includes(term) || o.txHash?.toLowerCase().includes(term);
  }), [tabData.orders, searchTerm]);

  const phasePassers = useMemo(() => (tabData.demoAccounts || []).filter((a: any) => a.status === 'passed'), [tabData.demoAccounts]);
  const kycUsers = useMemo(() => (tabData.users || []).filter((u: any) => u.kycStatus && u.kycStatus !== 'none'), [tabData.users]);
  const breachedAccounts = tabData.breaches || [];

  if (!isAuthenticated && !showAdminModal) return null;

  if (isAuthenticated && !isAuthorized && !isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <ShieldAlert className="w-16 h-16 text-destructive mb-6 animate-pulse" />
        <h2 className="text-3xl font-headline font-bold text-white mb-2 uppercase tracking-tight">Firebase Authorization Failed</h2>
        <p className="text-muted-foreground max-sm mx-auto mb-8">Your account ({user?.email}) is not registered in the institutional master list. Administrative access denied by security rules.</p>
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

          <TabsContent value="order-review" className="space-y-6">
             <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <h2 className="text-xl font-headline font-bold uppercase tracking-tight">Order Pipeline</h2>
                <div className="flex items-center gap-4 w-full md:w-auto">
                   <Button variant="outline" className="h-10 rounded-xl font-bold border-destructive/20 text-destructive hover:bg-destructive/5" onClick={handleCleanupDuplicates} disabled={actionLoading}>
                      <Trash2 className="w-4 h-4 mr-2" /> Clean Duplicates
                   </Button>
                   <div className="relative w-full md:w-96">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input placeholder="Search Orders, Emails, Hashes..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10 bg-secondary/30" />
                   </div>
                </div>
             </div>
             <Card className="bg-card/40 border-border/50"><CardContent className="p-0 overflow-x-auto"><table className="w-full text-sm text-left"><thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-black tracking-widest"><tr><th className="p-4">Order ID</th><th className="p-4">Trader / Plan</th><th className="p-4 text-right">Amount</th><th className="p-4">TX Hash</th><th className="p-4">Status</th><th className="p-4 text-right">Actions</th></tr></thead><tbody className="divide-y divide-border/50">{filteredOrders.map((o: any) => { const explorer = EXPLORERS[o.network] || EXPLORERS.ERC20; const isHashValid = isValidTxHash(o.txHash, o.network); return (<tr key={o.id} className="hover:bg-white/5 transition-colors"><td className="p-4 font-mono text-[10px]">{o.id}</td><td className="p-4"><p className="font-bold text-xs">{o.email}</p><p className="text-[10px] text-muted-foreground uppercase">{o.plan} - {o.accountSize}</p></td><td className="p-4 text-right font-mono text-white">${o.amountPaid}</td><td className="p-4"><div className="flex flex-col gap-1">{o.txHash ? (<div className="flex items-center gap-2"><a href={`${explorer}${o.txHash}`} target="_blank" className="text-[10px] font-mono text-primary hover:underline truncate max-w-[100px]">{o.txHash}</a>{!isHashValid && <Badge variant="destructive" className="h-3 text-[7px] font-black">INVALID HASH</Badge>}</div>) : (<span className="text-zinc-600 text-[10px]">No Hash</span>)}</div></td><td className="p-4"><Badge className={cn("uppercase text-[8px]", o.status === 'completed' ? "bg-emerald-500/20 text-emerald-500" : o.status === 'waiting' ? "bg-blue-500/20 text-blue-500" : "bg-amber-500/20 text-amber-500")}>{o.status}</Badge></td><td className="p-4 text-right"><div className="flex justify-end gap-2">{o.paymentScreenshot && (<Button size="sm" variant="outline" className="h-7 text-[8px]" onClick={() => { setPreviewImage(o.paymentScreenshot); setIsImageModalOpen(true); }}>View Proof</Button>)}{o.status !== 'completed' && (<Button size="sm" className="h-7 text-[8px] bg-primary text-black" onClick={() => approveManualOrderAction(o.id)}>Approve</Button>)}</div></td></tr>); })}</tbody></table></CardContent></Card>
          </TabsContent>

          <TabsContent value="kyc-hub" className="space-y-6">
            <h2 className="text-xl font-headline font-bold uppercase tracking-tight">Identity Review Hub</h2>
            <Card className="bg-card/40 border-border/50"><CardContent className="p-0 overflow-x-auto"><table className="w-full text-sm text-left"><thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-black tracking-widest"><tr><th className="p-4">Trader</th><th className="p-4">Submitted</th><th className="p-4">Status</th><th className="p-4 text-right">Actions</th></tr></thead><tbody className="divide-y divide-border/50">{kycUsers.map((u: any) => (<tr key={u.id} className="hover:bg-white/5 transition-colors"><td className="p-4"><p className="font-bold text-xs">{u.name}</p><p className="text-[10px] text-muted-foreground">{u.email}</p></td><td className="p-4 text-xs">{u.kycSubmittedAt ? format(new Date(u.kycSubmittedAt), 'MMM d, HH:mm') : '—'}</td><td className="p-4"><Badge className={cn("text-[9px] uppercase font-black", u.kycStatus === 'verified' ? "bg-emerald-500/20 text-emerald-500" : u.kycStatus === 'pending' ? "bg-amber-500/20 text-amber-500" : "bg-destructive/20 text-destructive")}>{u.kycStatus}</Badge></td><td className="p-4 text-right"><Button size="sm" variant="outline" className="h-8 text-[9px] uppercase font-black" onClick={() => { setKycInquiryUser(u); setIsKycModalOpen(true); }}><FileImage className="w-3 h-3 mr-2" /> View Docs</Button></td></tr>))}</tbody></table></CardContent></Card>
          </TabsContent>

          <TabsContent value="broadcasts" className="space-y-6">
             <div className="flex justify-between items-center">
                <h2 className="text-xl font-headline font-bold uppercase tracking-tight">System Broadcasts</h2>
                <Button className="h-10 rounded-xl font-bold bg-primary text-black" onClick={() => setIsBroadcastModalOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" /> New Broadcast
                </Button>
             </div>
             <Card className="bg-card/40 border-border/50"><CardContent className="p-0 overflow-x-auto"><table className="w-full text-sm text-left"><thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-black tracking-widest"><tr><th className="p-4">Sent At</th><th className="p-4">Title</th><th className="p-4">Message</th><th className="p-4 text-right">Type</th></tr></thead><tbody className="divide-y divide-border/50">{tabData.broadcasts?.map((b: any) => (<tr key={b.id} className="hover:bg-white/5 transition-colors"><td className="p-4 text-[10px] font-mono">{b.sentAt ? format(b.sentAt.toDate(), 'MMM d, HH:mm') : '—'}</td><td className="p-4 font-bold text-xs">{b.title}</td><td className="p-4 text-xs text-muted-foreground">{b.message}</td><td className="p-4 text-right"><Badge variant="outline" className="text-[8px] uppercase font-black">{b.type}</Badge></td></tr>))}</tbody></table></CardContent></Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* KYC REVIEW MODAL */}
      <Dialog open={isKycModalOpen} onOpenChange={setIsKycModalOpen}>
        <DialogContent className="max-w-4xl bg-zinc-950 border-zinc-800 text-white">
          <DialogHeader>
            <DialogTitle>Identity Verification: {kycInquiryUser?.name}</DialogTitle>
            <DialogDescription>Review submitted documents for compliance approval.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 py-6">
            <KycDocCard label="ID Front" url={kycInquiryUser?.idProofUrl} />
            <KycDocCard label="ID Back" url={kycInquiryUser?.idBackProofUrl || kycInquiryUser?.addressProofUrl} />
            <KycDocCard label="Selfie" url={kycInquiryUser?.selfieProofUrl} />
          </div>
          {kycInquiryUser?.kycStatus === 'verified' && (
            <div className="mb-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-emerald-500" />
              <span className="font-headline font-bold text-emerald-500 uppercase italic">Identity Verified!</span>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" className="border-destructive/30 text-destructive hover:bg-destructive/5" onClick={() => handleUpdateKycStatus(kycInquiryUser.id, 'rejected')} disabled={actionLoading}>Reject KYC</Button>
            <Button className="bg-emerald-500 text-black font-bold" onClick={() => handleUpdateKycStatus(kycInquiryUser.id, 'verified')} disabled={actionLoading || kycInquiryUser?.kycStatus === 'verified'}>Approve Verification</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* GIFT ACCOUNT MODAL */}
      <Dialog open={isGiftModalOpen} onOpenChange={setIsGiftModalOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white">
          <DialogHeader>
            <DialogTitle>Provision Institutional Account</DialogTitle>
            <DialogDescription>Manually grant a challenge or funded node to a trader.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Trader ID or Email</Label>
              <Input placeholder="e.g. 09283742 or trader@email.com" value={giftForm.traderId} onChange={e => setGiftForm({...giftForm, traderId: e.target.value})} className="bg-zinc-900 border-zinc-800" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Challenge Plan</Label>
                <Select value={giftForm.plan} onValueChange={v => setGiftForm({...giftForm, plan: v})}>
                  <SelectTrigger className="bg-zinc-900 border-zinc-800"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                    <SelectItem value="1-step-pro">1-Step Pro</SelectItem>
                    <SelectItem value="2-step-classic">2-Step Classic</SelectItem>
                    <SelectItem value="3-step-classic">3-Step Classic</SelectItem>
                    <SelectItem value="instant-funding">Instant Funding</SelectItem>
                    <SelectItem value="instant-pro">Instant Pro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Account Size</Label>
                <Select value={String(giftForm.size)} onValueChange={v => setGiftForm({...giftForm, size: parseInt(v)})}>
                  <SelectTrigger className="bg-zinc-900 border-zinc-800"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                    <SelectItem value="5000">$5,000</SelectItem>
                    <SelectItem value="10000">$10,000</SelectItem>
                    <SelectItem value="25000">$25,000</SelectItem>
                    <SelectItem value="50000">$50,000</SelectItem>
                    <SelectItem value="100000">$100,000</SelectItem>
                    <SelectItem value="200000">$200,000</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button className="w-full bg-primary text-black font-black" onClick={handleGiftAccount} disabled={actionLoading}>
              {actionLoading ? <Loader2 className="animate-spin" /> : "PROVISION ACCOUNT"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* BROADCAST MODAL */}
      <Dialog open={isBroadcastModalOpen} onOpenChange={setIsBroadcastModalOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white">
          <DialogHeader>
            <DialogTitle>Deploy System Broadcast</DialogTitle>
            <DialogDescription>Push a real-time notification to all active traders.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Broadcast Title</Label>
              <Input value={broadcastForm.title} onChange={e => setBroadcastForm({...broadcastForm, title: e.target.value})} className="bg-zinc-900 border-zinc-800" />
            </div>
            <div className="space-y-2">
              <Label>Message Content</Label>
              <Textarea value={broadcastForm.message} onChange={e => setBroadcastForm({...broadcastForm, message: e.target.value})} className="bg-zinc-900 border-zinc-800 min-h-[100px]" />
            </div>
            <div className="space-y-2">
              <Label>Alert Level</Label>
              <Select value={broadcastForm.type} onValueChange={v => setBroadcastForm({...broadcastForm, type: v})}>
                <SelectTrigger className="bg-zinc-900 border-zinc-800"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                  <SelectItem value="info">Information</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsBroadcastModalOpen(false)}>Cancel</Button>
            <Button className="bg-primary text-black font-bold" onClick={handleDeployBroadcast} disabled={actionLoading}>Deploy Broadcast</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* IMAGE PREVIEW MODAL */}
      <Dialog open={isImageModalOpen} onOpenChange={setIsImageModalOpen}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden bg-black border-none">
          <DialogHeader className="sr-only">
            <DialogTitle>Image Preview</DialogTitle>
          </DialogHeader>
          {previewImage && <img src={previewImage} alt="Payment Proof" className="w-full h-auto object-contain max-h-[90vh]" />}
          <div className="absolute top-4 right-4"><Button size="icon" variant="ghost" className="text-white hover:bg-white/20" onClick={() => setIsImageModalOpen(false)}><XCircle /></Button></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KycDocCard({ label, url }: { label: string, url?: string }) {
  return (
    <div className="space-y-2">
      <Label className="text-[10px] font-black uppercase text-zinc-500">{label}</Label>
      <div className="aspect-[4/3] rounded-xl bg-zinc-900 border border-zinc-800 overflow-hidden relative group">
        {url ? (
          <>
            <img src={url} alt={label} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Button size="sm" variant="outline" className="text-[10px] font-black" onClick={() => window.open(url, '_blank')}>Expand <IconOpenLink className="ml-2 w-3 h-3" /></Button>
            </div>
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center italic text-zinc-600 text-xs">No image provided</div>
        )}
      </div>
    </div>
  );
}

function IconOpenLink(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
  );
}