
"use client";

import { useState, useMemo, useEffect, memo, useCallback } from 'react';
import { Navigation } from '@/components/Navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Users, Activity, Search, Loader2, Database, ShieldCheck, RefreshCw, BarChart2, Monitor, Clock, Trophy, Skull, Megaphone, RotateCcw, Zap, Link as LinkIcon, Plus, Eye, Check, XCircle, Gift, History, ShieldAlert, CheckCircle2, Trash2, Settings2, Save, Network, BarChart3, Info, Wallet, User, TrendingUp, LogOut, ChevronLeft, ChevronRight
} from 'lucide-react';
import { updateOrderStatusAction, resetDemoAccountAction, resetSingleAccountAction, sendGlobalBroadcastAction, approveManualOrderAction, resetAllHistoryAction, giftAccountAction, updateKycStatusAction, updatePayoutStatusAction, cleanupDuplicateOrdersAction } from './actions';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, limit, where, getCountFromServer, doc, onSnapshot, getAggregateFromServer, sum, getDoc } from 'firebase/firestore';
import { useAuth } from '@/context/AuthContext';
import { ADMIN_EMAILS } from '@/lib/admin';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import Link from 'next/link';

const StatCard = memo(function StatCard({ title, value, icon, color }: { title: string, value: string | number, icon: any, color: string }) {
  const colors: any = {
    blue: 'text-primary bg-primary/10 border-primary/20',
    green: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
    amber: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
    red: 'text-destructive bg-destructive/10 border-destructive/20',
    purple: 'text-purple-500 bg-purple-500/10 border-purple-500/20',
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

/**
 * Institutional Data View: Memoized to prevent button and interaction lag.
 */
const DataTable = memo(function DataTable({ loading, data, columns, renderRow }: { loading: boolean, data: any[], columns: string[], renderRow: (item: any) => React.ReactNode }) {
  if (loading) {
    return (
      <Card className="bg-card/40 border-border/50">
        <CardContent className="p-0 space-y-4 py-8">
          {[1, 2, 3].map(i => <div key={i} className="h-12 mx-4 bg-white/5 animate-pulse rounded-lg" />)}
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card className="bg-card/40 border-border/50 border-dashed border-2 py-20 text-center flex flex-col items-center justify-center opacity-40">
        <Info className="w-12 h-12 mb-4" />
        <p className="text-sm font-black uppercase tracking-widest">No matching records found.</p>
      </Card>
    );
  }

  return (
    <Card className="bg-card/40 border-border/50 overflow-hidden shadow-2xl">
      <CardContent className="p-0 overflow-x-auto custom-scrollbar">
        <table className="w-full text-sm text-left">
          <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-black tracking-widest border-b border-white/5">
            <tr>{columns.map(c => <th key={c} className="p-4">{c}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {data.map(item => renderRow(item))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
});

const AdminSummaryTable = memo(function AdminSummaryTable({ title, data, columns, onViewAll }: { title: string, data: any[], columns: string[], onViewAll: () => void }) {
  return (
    <Card className="bg-card/30 border-border/50">
      <CardHeader className="flex flex-row items-center justify-between border-b border-white/5 pb-4">
        <CardTitle className="text-sm font-headline font-bold uppercase tracking-tight">{title}</CardTitle>
        <button onClick={onViewAll} className="text-[10px] font-black uppercase text-primary hover:text-white transition-colors">View All</button>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-sm text-left">
          <tbody className="divide-y divide-border/50">
            {!data || data.length === 0 ? (
              <tr><td colSpan={3} className="py-10 text-center text-[10px] text-zinc-600 font-bold uppercase">No data found.</td></tr>
            ) : data.slice(0, 5).map((item, i) => (
              <tr key={i} className="hover:bg-white/5 transition-colors">
                <td className="py-3 px-4 font-bold text-xs truncate max-w-[120px]">{item[columns[0]]}</td>
                <td className="py-3 px-4 text-[10px] text-muted-foreground uppercase truncate max-w-[100px]">{item[columns[1]]}</td>
                <td className="py-3 px-4 text-right">
                   {columns[2] === 'status' ? (
                     <Badge className={cn("text-[8px] font-black uppercase", (item.status === 'completed' || item.status === 'approved') ? 'bg-emerald-500/20 text-emerald-500' : 'bg-amber-500/20 text-amber-500')}>{item.status}</Badge>
                   ) : (
                     <span className="text-[10px] font-mono text-zinc-500">{item.createdAt?.toDate ? format(item.createdAt.toDate(), 'MMM d') : '—'}</span>
                   )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
});

export default function AdminPage() {
  const { user, loading: authLoading } = useAuth();
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
    users: [], orders: [], payouts: [], referrals: [], broadcasts: [], demoAccounts: [], breaches: [], passers: []
  });

  const [isLoading, setIsLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const { toast } = useToast();

  const [isUserManagementOpen, setIsUserManagementOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [inspectionTab, setInspectionTab] = useState('overview');
  const [nodeFilterId, setNodeFilterId] = useState<string | null>(null);
  const [userTrades, setUserTrades] = useState<any[]>([]);

  const [isGiftModalOpen, setIsGiftModalOpen] = useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectingOrderId, setRejectingOrderId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [giftForm, setGiftForm] = useState({ traderId: '', email: '', plan: '1-step-pro', size: 100000 });

  const [userPage, setUserPage] = useState(1);
  const usersPerPage = 50;

  const instanceId = "Studio-8383940162";

  const isAuthorized = useMemo(() => {
    if (!user || !user.email) return false;
    const lowerEmail = user.email.toLowerCase();
    const adminList = ADMIN_EMAILS.map(e => e.toLowerCase());
    return adminList.includes(lowerEmail);
  }, [user]);

  const refreshStats = useCallback(async () => {
    if (!isAuthenticated || !isAuthorized || authLoading) return;
    
    try {
      const fetchCount = async (q: any) => {
        try { return (await getCountFromServer(q)).data().count; } 
        catch (e) { return 0; }
      };

      const results = await Promise.allSettled([
        fetchCount(collection(db, 'users')),
        fetchCount(collection(db, 'demoAccounts')),
        fetchCount(query(collection(db, 'demoAccounts'), where('status', 'in', ['blown', 'breach', 'terminated']))),
        fetchCount(query(collection(db, 'demoAccounts'), where('status', '==', 'passed'))),
        fetchCount(query(collection(db, 'orders'), where('status', 'in', ['pending', 'manual_review', 'waiting']))),
        getAggregateFromServer(
          query(collection(db, 'orders'), where('status', 'in', ['completed', 'approved'])),
          { totalVolume: sum('amountPaid') }
        )
      ]);

      const statsPayload: any = {};
      results.forEach((r, i) => {
        const val = r.status === 'fulfilled' ? r.value : 0;
        if (i === 0) statsPayload.totalUsersCount = val;
        if (i === 1) statsPayload.totalNodesCount = val;
        if (i === 2) statsPayload.totalLiquidationCount = val;
        if (i === 3) statsPayload.phasePassersCount = val;
        if (i === 4) statsPayload.pendingOrdersCount = val;
        if (i === 5) statsPayload.totalAum = (val as any)?.data?.()?.totalVolume || 0;
      });

      setStats(prev => ({ ...prev, ...statsPayload }));
    } catch (err: any) {
      console.error('[Admin-Stats] Refresh fault:', err.message);
    }
  }, [isAuthenticated, isAuthorized, authLoading]);

  useEffect(() => {
    if (!isAuthenticated || !isAuthorized || authLoading) return;

    setIsLoading(true);
    let unsub: () => void = () => {};

    // CRITICAL: All real-time listeners MUST use limit(100) to protect Firestore Quota
    // especially with collections exceeding 11,000 documents.
    switch(activeTab) {
      case 'user-directory':
        unsub = onSnapshot(query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(100)), (snap) => {
          setTabData((prev: any) => ({ ...prev, users: snap.docs.map(d => ({ id: d.id, ...d.data() })) }));
          setIsLoading(false);
          refreshStats();
        });
        break;
      case 'trading-nodes':
        unsub = onSnapshot(query(collection(db, 'demoAccounts'), orderBy('updatedAt', 'desc'), limit(100)), (snap) => {
          setTabData((prev: any) => ({ ...prev, demoAccounts: snap.docs.map(d => ({ id: d.id, ...d.data() })) }));
          setIsLoading(false);
        });
        break;
      case 'breaches':
        unsub = onSnapshot(query(collection(db, 'demoAccounts'), where('status', 'in', ['blown', 'breach', 'terminated']), orderBy('updatedAt', 'desc'), limit(100)), (snap) => {
          setTabData((prev: any) => ({ ...prev, breaches: snap.docs.map(d => ({ id: d.id, ...d.data() })) }));
          setIsLoading(false);
        });
        break;
      case 'phase-passers':
        unsub = onSnapshot(query(collection(db, 'demoAccounts'), where('status', '==', 'passed'), orderBy('updatedAt', 'desc'), limit(100)), (snap) => {
          setTabData((prev: any) => ({ ...prev, passers: snap.docs.map(d => ({ id: d.id, ...d.data() })) }));
          setIsLoading(false);
        });
        break;
      case 'order-review':
        unsub = onSnapshot(query(collection(db, 'orders'), orderBy('submittedAt', 'desc'), limit(100)), (snap) => {
          setTabData((prev: any) => ({ ...prev, orders: snap.docs.map(d => ({ id: d.id, ...d.data() })) }));
          setIsLoading(false);
        });
        break;
      case 'payout-hub':
        unsub = onSnapshot(query(collection(db, 'payouts'), orderBy('createdAt', 'desc'), limit(100)), (snap) => {
          setTabData((prev: any) => ({ ...prev, payouts: snap.docs.map(d => ({ id: d.id, ...d.data() })) }));
          setIsLoading(false);
        });
        break;
      case 'referral-audit':
        unsub = onSnapshot(query(collection(db, 'referrals'), orderBy('createdAt', 'desc'), limit(100)), (snap) => {
          setTabData((prev: any) => ({ ...prev, referrals: snap.docs.map(d => ({ id: d.id, ...d.data() })) }));
          setIsLoading(false);
        });
        break;
      case 'kyc-hub':
        unsub = onSnapshot(query(collection(db, 'users'), where('kycStatus', 'in', ['pending', 'verified', 'rejected']), limit(100)), (snap) => {
          setTabData((prev: any) => ({ ...prev, users: snap.docs.map(d => ({ id: d.id, ...d.data() })) }));
          setIsLoading(false);
        });
        break;
      case 'broadcasts':
        unsub = onSnapshot(query(collection(db, 'broadcasts'), orderBy('sentAt', 'desc'), limit(100)), (snap) => {
          setTabData((prev: any) => ({ ...prev, broadcasts: snap.docs.map(d => ({ id: d.id, ...d.data() })) }));
          setIsLoading(false);
        });
        break;
      default:
        refreshStats();
        setIsLoading(false);
    }

    return () => unsub();
  }, [isAuthenticated, isAuthorized, authLoading, activeTab, refreshStats]);

  useEffect(() => {
    const isVerified = localStorage.getItem('adminVerified') === 'true';
    if (isVerified) setIsAuthenticated(true);
    else setShowAdminModal(true);
  }, []);

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

  const handleResetSingleAccount = async (accountId: string) => {
    if (!confirm('WARNING: This will reset the account balance to its starting value and PERMANENTLY DELETE all trade history for this account only. Continue?')) return;
    setActionLoading(true);
    try {
      const res = await resetSingleAccountAction(accountId);
      if (res.success) {
        toast({ title: "Account Restored", description: "Balance reset and history cleared." });
        if (selectedUser) {
           const snap = await getDoc(doc(db, 'users', selectedUser.id));
           if (snap.exists()) setSelectedUser({ id: snap.id, ...snap.data() });
        }
      } else {
        throw new Error(res.error || "Reset failed");
      }
    } catch (e: any) {
      toast({ variant: "destructive", title: "Operation Failed", description: e.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleGiftAccount = async () => {
    if (!giftForm.traderId && !giftForm.email) {
      toast({ variant: "destructive", title: "Input Required", description: "Please enter a Trader ID or Email." });
      return;
    }

    setActionLoading(true);
    try {
      const startBalance = giftForm.size;
      const res = await giftAccountAction(
        giftForm.traderId,
        giftForm.email,
        `Gifted ${giftForm.plan.toUpperCase()} — $${startBalance / 1000}k`,
        startBalance,
        giftForm.plan,
        'evaluation'
      );

      if (res.success) {
        toast({ title: "🎁 Success", description: "The trading node has been provisioned." });
        setIsGiftModalOpen(false);
        setGiftForm({ traderId: '', email: '', plan: '1-step-pro', size: 100000 });
        refreshStats();
      } else {
        throw new Error(res.error);
      }
    } catch (e: any) {
      toast({ variant: "destructive", title: "Grant Failed", description: e.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectOrder = async () => {
    if (!rejectingOrderId || !rejectReason.trim()) {
      toast({ variant: "destructive", title: "Reason Required", description: "Please enter a rejection message." });
      return;
    }
    setActionLoading(true);
    try {
      const res = await updateOrderStatusAction(rejectingOrderId, 'rejected', rejectReason.trim());
      if (res.success) {
        toast({ title: "Order Rejected", description: "The trader has been notified." });
        setIsRejectModalOpen(false);
        setRejectingOrderId(null);
        setRejectReason('');
        refreshStats();
      } else {
        throw new Error(res.error || "Rejection failed");
      }
    } catch (e: any) {
      toast({ variant: "destructive", title: "Rejection Failed", description: e.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleViewUserByAccount = async (userId: string) => {
    if (!userId) return;
    setActionLoading(true);
    try {
      let userObj = tabData.users?.find((u: any) => u.id === userId);
      if (!userObj) {
        const snap = await getDoc(doc(db, 'users', userId));
        if (snap.exists()) userObj = { id: snap.id, ...snap.data() };
      }
      if (userObj) {
        setSelectedUser(userObj);
        setInspectionTab('overview');
        setNodeFilterId(null);
        setIsUserManagementOpen(true);
      } else {
        toast({ variant: "destructive", title: "Trader Not Found" });
      }
    } finally {
      setActionLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedUser?.id || !isUserManagementOpen) return;
    const qT = query(collection(db, 'demoTrades'), where('userId', '==', selectedUser.id), orderBy('openedAt', 'desc'), limit(100));
    const unsubT = onSnapshot(qT, (snap) => setUserTrades(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => unsubT();
  }, [selectedUser?.id, isUserManagementOpen]);

  const filteredUsers = useMemo(() => (tabData.users || []).filter((u: any) => {
    const term = searchTerm.toLowerCase();
    return u.name?.toLowerCase().includes(term) || u.email?.toLowerCase().includes(term) || u.traderId?.toLowerCase().includes(term);
  }), [tabData.users, searchTerm]);

  useEffect(() => {
    setUserPage(1);
  }, [searchTerm]);

  const paginatedUsers = useMemo(() => {
    const start = (userPage - 1) * usersPerPage;
    return filteredUsers.slice(start, start + usersPerPage);
  }, [filteredUsers, userPage]);

  const totalUserPages = Math.ceil(filteredUsers.length / usersPerPage);

  const filteredOrders = useMemo(() => (tabData.orders || []).filter((o: any) => {
    const term = searchTerm.toLowerCase();
    return o.email?.toLowerCase().includes(term) || o.id.toLowerCase().includes(term);
  }), [tabData.orders, searchTerm]);

  if (!isAuthenticated && !showAdminModal) return null;

  return (
    <div className="flex min-h-screen bg-background text-white">
      <Navigation />
      <main className="flex-1 p-8 overflow-y-auto custom-scrollbar">
        <header className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-10 pb-6 border-b border-white/5">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-1">
               <ShieldAlert className="text-primary w-5 h-5" />
               <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 text-[10px] font-bold tracking-widest">{user?.email}</Badge>
            </div>
            <h1 className="text-3xl font-headline font-bold uppercase tracking-tighter">Administrative Terminal</h1>
            <p className="text-muted-foreground text-xs font-medium opacity-60">System Intelligence & Global Control Hub.</p>
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
                <Button variant="outline" className="h-10 rounded-xl font-bold border-white/10" onClick={handleResetHistory} disabled={actionLoading}>
                  <RotateCcw className="w-4 h-4 mr-2" /> Friday Rule Reset
                </Button>
                <Button variant="outline" className="h-10 rounded-xl font-bold border-white/10" asChild>
                  <Link href="/admin/price-tracker">
                    <TrendingUp className="w-4 h-4 mr-2" /> Price Synchronizer
                  </Link>
                </Button>
                <Button className="h-10 rounded-xl font-black bg-primary text-black" onClick={() => setIsGiftModalOpen(true)}>
                  <Gift className="w-4 h-4 mr-2" /> Gift Account
                </Button>
                <Button variant="outline" className="h-10 rounded-xl font-bold border-white/10" onClick={() => refreshStats()} disabled={isLoading}>
                  <RefreshCw className={cn("w-4 h-4 mr-2", isLoading && "animate-spin")} /> Sync Network
                </Button>
                <Button variant="outline" className="h-10 w-10 p-0 rounded-xl border-white/10" asChild>
                  <Link href="/dashboard"><LogOut size={16} /></Link>
                </Button>
             </div>
          </div>
        </header>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
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

          <TabsContent value="overview" className="space-y-8">
             <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <StatCard title="Active Traders" value={stats.totalUsersCount} icon={<Users />} color="blue" />
                <StatCard title="Total Volume" value={`$${(stats.totalAum / 1e6).toFixed(2)}M`} icon={<BarChart2 />} color="green" />
                <StatCard title="Registered Nodes" value={stats.totalNodesCount} icon={<Monitor />} color="purple" />
                <StatCard title="Pending Orders" value={stats.pendingOrdersCount} icon={<Clock />} color="amber" />
                <StatCard title="Phase Passers" value={stats.phasePassersCount} icon={<Trophy />} color="blue" />
                <StatCard title="Total Liquidation" value={stats.totalLiquidationCount} icon={<Skull />} color="red" />
             </div>
             
             <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <AdminSummaryTable title="Recent Orders" data={tabData.orders} columns={['email', 'plan', 'status']} onViewAll={() => setActiveTab('order-review')} />
                <AdminSummaryTable title="Recent Users" data={tabData.users} columns={['name', 'email', 'createdAt']} onViewAll={() => setActiveTab('user-directory')} />
             </div>
          </TabsContent>

          <TabsContent value="phase-passers" className="space-y-6">
             <TabHeader title="Elite Performance: Phase Passers" count={stats.phasePassersCount} />
             <DataTable loading={isLoading} data={tabData.passers} columns={['Trader', 'Account ID', 'Plan / Phase', 'Pass Date', 'Actions']} renderRow={(acc) => (
                  <tr key={acc.id} className="hover:bg-white/5 transition-colors">
                    <td className="p-4 font-bold text-xs">{acc.email || 'Trader'}</td>
                    <td className="p-4 font-mono text-[10px] text-zinc-400">{acc.id}</td>
                    <td className="p-4 text-[10px] uppercase font-bold text-zinc-300">{acc.planType || acc.plan} · {acc.phase}</td>
                    <td className="p-4 text-xs text-muted-foreground">{acc.passedAt?.toDate ? format(acc.passedAt.toDate(), 'MMM d, yyyy') : 'Recently'}</td>
                    <td className="p-4 text-right"><Button variant="outline" size="sm" onClick={() => handleViewUserByAccount(acc.userId)}><Eye className="w-3 h-3 mr-2" /> Inspect</Button></td>
                  </tr>
                )}
             />
          </TabsContent>

          <TabsContent value="payout-hub" className="space-y-6">
             <TabHeader title="Withdrawal Queue" count={tabData.payouts?.length} />
             <DataTable loading={isLoading} data={tabData.payouts} columns={['Trader', 'Method / Address', 'Amount', 'Status', 'Actions']} renderRow={(p) => (
                  <tr key={p.id} className="hover:bg-white/5 transition-colors">
                    <td className="p-4 font-bold text-xs">{p.email}</td>
                    <td className="p-4"><p className="text-[10px] font-bold text-white">{p.method}</p><p className="text-[9px] text-muted-foreground font-mono truncate max-w-xs">{p.address}</p></td>
                    <td className="p-4 font-mono text-emerald-500 font-bold text-right">${(p.amount || 0).toLocaleString()}</td>
                    <td className="p-4"><Badge className={cn("text-[8px] uppercase", p.status === 'done' ? "bg-emerald-500/20 text-emerald-500" : "bg-amber-500/20 text-amber-500")}>{p.status}</Badge></td>
                    <td className="p-4 text-right"><Button size="sm" className="h-7 text-[8px] bg-primary text-black" onClick={() => updatePayoutStatusAction(p.id, 'done')}>Mark Paid</Button></td>
                  </tr>
                )}
             />
          </TabsContent>

          <TabsContent value="trading-nodes" className="space-y-6">
             <TabHeader title="Challenge Node Registry" count={stats.totalNodesCount} onSearch={setSearchTerm} />
             <DataTable loading={isLoading} data={tabData.demoAccounts} columns={['Account ID', 'Plan / Phase', 'Balance', 'Equity', 'Status', 'Actions']} renderRow={(acc) => (
                  <tr key={acc.id} className="hover:bg-white/5 transition-colors">
                    <td className="p-4"><p className="font-mono text-[10px] text-primary">{acc.id}</p><p className="text-[9px] text-muted-foreground">{acc.email}</p></td>
                    <td className="p-4 text-[10px] uppercase font-bold text-zinc-300">{acc.planType || acc.plan} · {acc.phase}</td>
                    <td className="p-4 font-mono text-white text-right">${(acc.balance || 0).toLocaleString()}</td>
                    <td className="p-4 font-mono text-white text-right">${(acc.equity || 0).toLocaleString()}</td>
                    <td className="p-4"><Badge className={cn("text-[8px] uppercase", acc.status === 'active' ? "bg-emerald-500/20 text-emerald-500" : "bg-destructive/20 text-destructive")}>{acc.status}</Badge></td>
                    <td className="p-4 text-right"><Button variant="outline" size="sm" onClick={() => handleViewUserByAccount(acc.userId)}><Eye className="w-3 h-3 mr-2" /> Inspect</Button></td>
                  </tr>
                )}
             />
          </TabsContent>

          <TabsContent value="breaches" className="space-y-6">
             <TabHeader title="Liquidated Nodes (Hard Breaches)" count={stats.totalLiquidationCount} />
             <DataTable loading={isLoading} data={tabData.breaches} columns={['Date', 'Account ID', 'Reason', 'Final Balance', 'Actions']} renderRow={(acc) => (
                  <tr key={acc.id} className="hover:bg-white/5 transition-colors">
                    <td className="p-4 text-xs text-muted-foreground">{acc.updatedAt?.toDate ? format(acc.updatedAt.toDate(), 'MMM d, HH:mm') : '—'}</td>
                    <td className="p-4"><p className="font-mono text-[10px] text-destructive">{acc.id}</p><p className="text-[9px] text-muted-foreground">{acc.email}</p></td>
                    <td className="p-4 text-[10px] text-zinc-400 max-w-xs truncate">{acc.breachReason || 'Risk parameter violation.'}</td>
                    <td className="p-4 font-mono text-white text-right">${(acc.balance || 0).toLocaleString()}</td>
                    <td className="p-4 text-right"><Button variant="ghost" size="sm" onClick={() => handleViewUserByAccount(acc.userId)}><Eye className="w-4 h-4" /></Button></td>
                  </tr>
                )}
             />
          </TabsContent>

          <TabsContent value="order-review" className="space-y-6">
             <div className="flex justify-between items-center">
                <TabHeader title="Payment Verification Pipeline" count={stats.pendingOrdersCount} onSearch={setSearchTerm} />
                <Button variant="outline" onClick={cleanupDuplicateOrdersAction} className="border-destructive/20 text-destructive hover:bg-destructive/5 h-10"><Trash2 className="w-4 h-4 mr-2" /> Clean Duplicates</Button>
             </div>
             <DataTable loading={isLoading} data={filteredOrders} columns={['Order ID', 'Trader / Plan', 'Amount Paid', 'TXID', 'Proof', 'Status', 'Actions']} renderRow={(o) => (
                  <tr key={o.id} className="hover:bg-white/5 transition-colors">
                    <td className="p-4 font-mono text-[10px]">{o.id}</td>
                    <td className="p-4"><p className="font-bold text-xs">{o.email}</p><p className="text-[10px] text-muted-foreground uppercase">{o.plan} - {o.accountSize}</p></td>
                    <td className="p-4 font-mono text-white text-right">${o.amountPaid}</td>
                    <td className="p-4 font-mono text-[9px] text-zinc-400 max-w-[140px] truncate">{o.txHash || '—'}</td>
                    <td className="p-4 text-center">
                      {o.proofScreenshotUrl ? (
                        <a href={o.proofScreenshotUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-[9px] font-black uppercase">View</a>
                      ) : '—'}
                    </td>
                    <td className="p-4"><Badge className={cn("uppercase text-[8px]", o.status === 'completed' || o.status === 'approved' ? "bg-emerald-500/20 text-emerald-500" : o.status === 'rejected' ? "bg-destructive/20 text-destructive" : "bg-amber-500/20 text-amber-500")}>{o.status}</Badge></td>
                    <td className="p-4 text-right space-x-2">
                      {(o.status === 'completed' || o.status === 'approved') ? (
                        <Button size="sm" variant="outline" className="h-7 text-[8px] border-emerald-500/30 text-emerald-500 cursor-default" disabled>Approved ✓</Button>
                      ) : o.status === 'rejected' ? (
                        <Button size="sm" variant="outline" className="h-7 text-[8px] border-destructive/30 text-destructive cursor-default" disabled>Rejected</Button>
                      ) : (
                        <>
                          <Button size="sm" className="h-7 text-[8px] bg-primary text-black" onClick={() => approveManualOrderAction(o.id)}>Approve</Button>
                          <Button size="sm" variant="destructive" className="h-7 text-[8px]" onClick={() => { setRejectingOrderId(o.id); setRejectReason(''); setIsRejectModalOpen(true); }}>Reject</Button>
                        </>
                      )}
                    </td>
                  </tr>
                )}
             />
          </TabsContent>

          <TabsContent value="referral-audit" className="space-y-6">
             <TabHeader title="Affiliate Performance Tracking" count={tabData.referrals?.length} />
             <DataTable loading={isLoading} data={tabData.referrals} columns={['Referrer ID', 'Referred User', 'Commission', 'Date', 'Status']} renderRow={(r) => (
                  <tr key={r.id} className="hover:bg-white/5 transition-colors">
                    <td className="p-4 font-mono text-[10px] text-primary">{r.referrerId}</td>
                    <td className="p-4 font-bold text-xs">{r.referredUserEmail ? `${r.referredUserEmail.slice(0,3)}***@${r.referredUserEmail.split('@')[1]}` : 'Anonymous'}</td>
                    <td className="p-4 font-mono text-emerald-500 font-bold text-right">${(r.amount || 0).toFixed(2)}</td>
                    <td className="p-4 text-xs text-muted-foreground">{r.createdAt?.toDate ? format(r.createdAt.toDate(), 'MMM d, yyyy') : 'Recently'}</td>
                    <td className="p-4"><Badge variant="outline" className="text-[8px] uppercase">{r.status}</Badge></td>
                  </tr>
                )}
             />
          </TabsContent>

          <TabsContent value="user-directory" className="space-y-6">
             <TabHeader title="Institutional Trader Directory" count={stats.totalUsersCount} onSearch={setSearchTerm} />
             <DataTable loading={isLoading} data={paginatedUsers} columns={['Trader Name', 'Registered Email', 'Trader ID', 'Tier', 'Joined Date', 'Actions']} renderRow={(u) => (
                  <tr key={u.id} className="hover:bg-white/5 transition-colors">
                    <td className="p-4 font-bold text-sm text-white">{u.name || 'Trader'}</td>
                    <td className="p-4 text-xs text-muted-foreground">{u.email}</td>
                    <td className="p-4 font-mono text-[10px] text-zinc-400">{u.traderId || '—'}</td>
                    <td className="p-4"><Badge variant="outline" className="text-[9px] uppercase font-black">{u.tier || 'Bronze'}</Badge></td>
                    <td className="p-4 text-xs text-muted-foreground">{u.createdAt?.toDate ? format(u.createdAt.toDate(), 'MMM d, yyyy') : 'Recently'}</td>
                    <td className="p-4 text-right"><Button variant="outline" size="sm" onClick={() => handleViewUserByAccount(u.id)}>Manage</Button></td>
                  </tr>
                )}
             />
             
             {totalUserPages > 1 && (
               <div className="flex items-center justify-between mt-4 px-2">
                 <p className="text-xs text-muted-foreground">Showing {paginatedUsers.length} of {filteredUsers.length} traders (Snapshot view)</p>
                 <div className="flex gap-2">
                   <Button variant="outline" size="sm" disabled={userPage === 1} onClick={() => setUserPage(p => p - 1)}><ChevronLeft className="w-4 h-4 mr-1" /> Previous</Button>
                   <Button variant="outline" size="sm" disabled={userPage === totalUserPages} onClick={() => setUserPage(p => p + 1)}>Next <ChevronRight className="w-4 h-4 ml-1" /></Button>
                 </div>
               </div>
             )}
          </TabsContent>

          <TabsContent value="kyc-hub" className="space-y-6">
             <TabHeader title="Compliance: Identity Review" count={tabData.users?.length} />
             <DataTable loading={isLoading} data={tabData.users} columns={['Trader', 'Submission Date', 'Proof Front', 'Proof Back', 'Selfie', 'Actions']} renderRow={(u) => (
                  <tr key={u.id} className="hover:bg-white/5 transition-colors">
                    <td className="p-4 font-bold text-xs">{u.email}</td>
                    <td className="p-4 text-xs text-muted-foreground">{u.kycSubmittedAt ? format(new Date(u.kycSubmittedAt), 'MMM d, HH:mm') : 'Recently'}</td>
                    <td className="p-4 text-center">{u.idProofUrl && <a href={u.idProofUrl} target="_blank" className="text-primary hover:underline text-[9px] font-black uppercase">View Front</a>}</td>
                    <td className="p-4 text-center">{u.idBackProofUrl && <a href={u.idBackProofUrl} target="_blank" className="text-primary hover:underline text-[9px] font-black uppercase">View Back</a>}</td>
                    <td className="p-4 text-center">{u.selfieProofUrl && <a href={u.selfieProofUrl} target="_blank" className="text-primary hover:underline text-[9px] font-black uppercase">View Selfie</a>}</td>
                    <td className="p-4 text-right space-x-2">
                       <Button size="sm" className="h-7 text-[8px] bg-emerald-600" onClick={() => updateKycStatusAction(u.id, 'verified')}>Approve</Button>
                       <Button size="sm" variant="destructive" className="h-7 text-[8px]" onClick={() => updateKycStatusAction(u.id, 'rejected', 'Documents unclear.')}>Reject</Button>
                    </td>
                  </tr>
                )}
             />
          </TabsContent>

          <TabsContent value="broadcasts" className="space-y-6">
             <TabHeader title="System Announcements" count={tabData.broadcasts?.length} />
             <DataTable loading={isLoading} data={tabData.broadcasts} columns={['Sent At', 'Title', 'Message Summary', 'Type']} renderRow={(b) => (
                  <tr key={b.id} className="hover:bg-white/5 transition-colors">
                    <td className="p-4 text-xs text-muted-foreground">{b.sentAt?.toDate ? format(b.sentAt.toDate(), 'MMM d, HH:mm') : 'Recently'}</td>
                    <td className="p-4 font-bold text-xs text-white">{b.title}</td>
                    <td className="p-4 text-[10px] text-zinc-400 max-w-xs truncate">{b.message}</td>
                    <td className="p-4"><Badge className="bg-primary/20 text-primary text-[8px] uppercase">{b.type}</Badge></td>
                  </tr>
                )}
             />
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={isUserManagementOpen} onOpenChange={setIsUserManagementOpen}>
        <DialogContent className="max-w-5xl bg-zinc-950 border-zinc-800 text-white max-h-[90vh] flex flex-col p-0">
          <DialogHeader className="p-6 border-b border-white/5 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary"><User size={24} /></div>
                <div><DialogTitle className="text-xl font-headline font-bold uppercase tracking-tight">{selectedUser?.name}</DialogTitle><p className="text-xs text-muted-foreground">Trader GUID: {selectedUser?.id}</p></div>
              </div>
              <div className="flex items-center gap-2">
                 <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 text-[10px] uppercase font-black">{selectedUser?.tier || 'Bronze'}</Badge>
                 <Badge variant="outline" className={cn("text-[10px] uppercase font-black", selectedUser?.kycVerified ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-destructive/10 text-destructive border-destructive/20")}>KYC: {selectedUser?.kycStatus || 'None'}</Badge>
              </div>
            </div>
          </DialogHeader>
          <Tabs value={inspectionTab} onValueChange={setInspectionTab} className="flex-1 flex flex-col min-h-0">
            <div className="px-6 border-b border-white/5 bg-zinc-900/30 shrink-0">
              <TabsList className="bg-transparent h-12 justify-start p-0 gap-8">
                {['Overview', 'Trading Nodes', 'Trade Status / History', 'Breach Logs'].map(tab => (
                  <TabsTrigger key={tab} value={tab.toLowerCase().replace(/ /g, '-').split('/')[0].trim()} className="data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 h-full text-[10px] font-black uppercase tracking-widest text-muted-foreground">{tab}</TabsTrigger>
                ))}
              </TabsList>
            </div>
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
               <TabsContent value="overview" className="m-0 space-y-6">
                  <div className="grid grid-cols-3 gap-4">
                     <div className="p-4 rounded-xl bg-zinc-900/50 border border-white/5 space-y-2"><p className="text-[8px] font-black uppercase text-zinc-500 tracking-widest">Registered Email</p><p className="text-sm font-bold text-white">{selectedUser?.email}</p></div>
                     <div className="p-4 rounded-xl bg-zinc-900/50 border border-white/5 space-y-2"><p className="text-[8px] font-black uppercase text-zinc-500 tracking-widest">Phone</p><p className="text-sm font-bold text-white">{selectedUser?.phone || 'Not Provided'}</p></div>
                     <div className="p-4 rounded-xl bg-zinc-900/50 border border-white/5 space-y-2"><p className="text-[8px] font-black uppercase text-zinc-500 tracking-widest">Joined</p><p className="text-sm font-bold text-white">{selectedUser?.createdAt?.toDate ? format(selectedUser.createdAt.toDate(), 'PPP') : '—'}</p></div>
                  </div>
               </TabsContent>
               <TabsContent value="trading-nodes" className="m-0 space-y-4">
                  {(tabData.demoAccounts || []).filter((n: any) => n.userId === selectedUser?.id).map((acc: any) => {
                    const isLiquidated = ['blown', 'breach', 'terminated'].includes(acc.status);
                    return (
                      <Card key={acc.id} className="bg-zinc-900/50 border-zinc-800 hover:border-primary/40 transition-all cursor-pointer group" onClick={() => { setNodeFilterId(acc.id); setInspectionTab('trade'); }}>
                        <CardHeader className="p-4 flex flex-row items-center justify-between">
                           <div><p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">{acc.plan}</p><CardTitle className="text-sm font-bold text-white group-hover:text-primary">{acc.label}</CardTitle></div>
                           <div className="flex items-center gap-2">
                              <Badge className={cn("text-[8px] uppercase", acc.status === 'active' ? "bg-emerald-500/20 text-emerald-500" : "bg-destructive/20 text-destructive")}>{acc.status}</Badge>
                              <Button variant="outline" size="sm" className="h-7 text-[8px] border-destructive/30 text-destructive hover:bg-destructive/10 font-black" onClick={(e) => { e.stopPropagation(); handleResetSingleAccount(acc.id); }}>
                                <RefreshCw className="w-3 h-3 mr-1" /> RESET BALANCE
                              </Button>
                           </div>
                        </CardHeader>
                        <CardContent className="px-4 pb-4 space-y-4">
                           <div className="grid grid-cols-2 gap-2">
                              <div><p className="text-[7px] font-black uppercase text-zinc-600">Balance</p><p className="text-[11px] font-mono font-bold">${(acc.balance || 0).toLocaleString()}</p></div>
                              <div><p className="text-[7px] font-black uppercase text-zinc-600">Equity</p><p className="text-[11px] font-mono font-bold">${(acc.equity || 0).toLocaleString()}</p></div>
                           </div>
                           {isLiquidated && (
                             <div className="pt-2 border-t border-white/5">
                                <p className="text-[7px] font-black uppercase text-destructive tracking-widest mb-1">Termination Reason</p>
                                <p className="text-[10px] font-medium text-red-400 italic">"{acc.breachReason || 'No reason recorded.'}"</p>
                             </div>
                           )}
                        </CardContent>
                      </Card>
                    );
                  })}
               </TabsContent>
               <TabsContent value="trade" className="m-0">
                  <div className="flex justify-between items-center mb-4">
                     <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Execution Ledger {nodeFilterId && <span className="text-primary">— Filtering by Node: {nodeFilterId.slice(0,8)}</span>}</p>
                     {nodeFilterId && <Button variant="ghost" className="h-6 text-[8px] font-black" onClick={() => setNodeFilterId(null)}>CLEAR FILTER</Button>}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="text-[9px] uppercase font-black text-zinc-600 tracking-widest border-b border-white/5">
                        <tr><th className="py-2 px-1">Symbol</th><th className="py-2 px-1">Type</th><th className="py-2 px-1 text-right">PnL</th><th className="py-2 px-1 text-right">Date</th></tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {userTrades.filter(t => !nodeFilterId || t.accountId === nodeFilterId).map(t => (
                          <tr key={t.id} className="hover:bg-white/5"><td className="py-2 px-1 font-bold">{t.symbol}</td><td className="py-2 px-1 uppercase font-medium">{t.type}</td><td className={cn("py-2 px-1 text-right font-bold", (t.pnl || 0) >= 0 ? "text-emerald-500" : "text-destructive")}>${(t.pnl || 0).toLocaleString()}</td><td className="py-2 px-1 text-right text-zinc-500">{t.closedAt?.toDate ? format(t.closedAt.toDate(), 'HH:mm') : '—'}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
               </TabsContent>
            </div>
            <DialogFooter className="p-6 border-t border-white/5 bg-zinc-900/50"><Button variant="outline" className="font-bold rounded-xl h-12 flex-1" onClick={() => setIsUserManagementOpen(false)}>Close Inspection</Button></DialogFooter>
          </Tabs>
        </DialogContent>
      </Dialog>

      <Dialog open={isGiftModalOpen} onOpenChange={setIsGiftModalOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white">
          <DialogHeader><DialogTitle>Provision Free Account</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><Label>Trader ID or Email</Label><Input value={giftForm.traderId} onChange={e => setGiftForm({...giftForm, traderId: e.target.value})} className="bg-zinc-900 border-zinc-800" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Account Size</Label><Select onValueChange={v => setGiftForm({...giftForm, size: parseInt(v)})}>
                <SelectTrigger className="bg-zinc-900 border-zinc-800"><SelectValue placeholder="100k" /></SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                  {[5, 10, 25, 50, 100, 200, 300].map(s => <SelectItem key={s} value={`${s*1000}`}>${s}k</SelectItem>)}
                </SelectContent>
              </Select></div>
              <div className="space-y-2"><Label>Plan Type</Label><Select onValueChange={v => setGiftForm({...giftForm, plan: v})}>
                <SelectTrigger className="bg-zinc-900 border-zinc-800"><SelectValue placeholder="1-Step Pro" /></SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                  <SelectItem value="1-step-pro">1-Step Pro</SelectItem>
                  <SelectItem value="2-step-classic">2-Step Classic</SelectItem>
                  <SelectItem value="3-step-classic">3-Step Classic</SelectItem>
                  <SelectItem value="instant-funding">Instant Funding</SelectItem>
                  <SelectItem value="instant-pro">Instant Pro</SelectItem>
                </SelectContent>
              </Select></div>
            </div>
          </div>
          <DialogFooter><Button className="w-full bg-primary text-black font-black" onClick={handleGiftAccount} disabled={actionLoading}>{actionLoading ? <Loader2 className="animate-spin" /> : "GRANT ACCOUNT"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isRejectModalOpen} onOpenChange={setIsRejectModalOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white">
          <DialogHeader>
            <DialogTitle>Reject Order</DialogTitle>
            <DialogDescription>Enter a message explaining why this order is being rejected. The trader will be notified.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Rejection Message</Label>
              <Textarea
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="e.g. Transaction amount does not match, screenshot unclear, TXID not found on-chain..."
                className="bg-zinc-900 border-zinc-800 min-h-[100px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="flex-1" onClick={() => setIsRejectModalOpen(false)}>Cancel</Button>
            <Button variant="destructive" className="flex-1 font-black" onClick={handleRejectOrder} disabled={actionLoading}>
              {actionLoading ? <Loader2 className="animate-spin" /> : "Send Rejection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TabHeader({ title, count, onSearch }: { title: string, count?: number, onSearch?: (v: string) => void }) {
  return (
    <div className="flex flex-col md:flex-row justify-between items-center gap-4">
      <h2 className="text-xl font-headline font-bold uppercase tracking-tight">{title} {count !== undefined && <span className="text-primary ml-2 opacity-50">({count})</span>}</h2>
      {onSearch && (
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search records..." onChange={e => onSearch(e.target.value)} className="pl-10 bg-secondary/30" />
        </div>
      )}
    </div>
  );
}

