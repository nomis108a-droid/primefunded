"use client";

import React, { useState, useMemo, useEffect, memo, useCallback, useRef } from 'react';
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
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { 
  Users, Activity, Search, Loader2, Database, ShieldCheck, RefreshCw, BarChart2, Monitor, Clock, Trophy, Skull, Megaphone, Trash2, Save, Network, BarChart3, Info, Wallet, User, TrendingUp, ChevronLeft, ChevronRight, Upload, DollarSign, Globe, HeartPulse, Lock, ShieldX, AlertTriangle, Check, Pencil, Eye, XCircle, Gift, History, ShieldAlert, CheckCircle2
} from 'lucide-react';
import { 
  updateOrderStatusAction, 
  approveManualOrderAction, 
  giftAccountAction, 
  updateKycStatusAction, 
  updatePayoutStatusAction
} from '@/app/admin/actions';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { db, storage } from '@/lib/firebase';
import { collection, query, orderBy, where, getCountFromServer, doc, onSnapshot, getAggregateFromServer, sum, getDoc, getDocs, addDoc, setDoc, deleteDoc, serverTimestamp, limit } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAuth } from '@/context/AuthContext';
import { ADMIN_EMAILS } from '@/lib/admin';
import Link from 'next/link';
import { CONTRACT_SIZE } from '@/lib/rulesConfig';

const ORDER_REVIEW_STATUSES = ['pending', 'waiting', 'manual_review', 'under_review', 'approved', 'completed', 'paid', 'rejected', 'cancelled'];

const StatCard = memo(function StatCard({ title, value, icon, color }: { title: string, value: string | number, icon: any, color: string }) {
  const colorMap: any = {
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
          <div className={cn("p-2 rounded-lg border", colorMap[color])}>{icon}</div>
          <Badge variant="outline" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground border-white/10">LIVE</Badge>
        </div>
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">{title}</p>
        <h3 className="text-2xl font-headline font-bold text-white group-hover:text-primary transition-colors">
          {value === -1 ? '...' : value}
        </h3>
      </CardContent>
    </Card>
  );
});

const DataTable = memo(function DataTable({ 
  loading, 
  data, 
  columns, 
  renderRow,
  emptyMessage = "No matching records found."
}: { 
  loading: boolean, 
  data: any[], 
  columns: string[], 
  renderRow: (item: any, index: number) => React.ReactNode,
  emptyMessage?: string
}) {
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
        <p className="text-sm font-black uppercase tracking-widest">{emptyMessage}</p>
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
            {data.map((item, index) => renderRow(item, index))}
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
                     <Badge className={cn(
                        "text-[8px] font-black uppercase",
                        (item.status === 'completed' || item.status === 'approved' || item.status === 'paid') ? 'bg-emerald-500/20 text-emerald-500' : 
                        (item.status === 'rejected' || item.status === 'cancelled') ? 'bg-red-500/20 text-red-500' :
                        'bg-amber-500/20 text-amber-500'
                      )}>{item.status}</Badge>
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

const OverviewTab = memo(({ stats, tabData, onActiveTabChange }: { stats: any, tabData: any, onActiveTabChange: (tab: string) => void }) => (
  <div className="space-y-8">
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-7 gap-4">
      <StatCard title="Active Traders" value={stats.totalUsersCount} icon={<Users />} color="blue" />
      <StatCard title="Total Volume" value={stats.totalAum === -1 ? '...' : `$${(stats.totalAum / 1e6).toFixed(2)}M`} icon={<BarChart2 />} color="green" />
      <StatCard title="Registered Nodes" value={stats.totalNodesCount} icon={<Monitor />} color="purple" />
      <StatCard title="Pending Orders" value={stats.pendingOrdersCount} icon={<Clock />} color="amber" />
      <StatCard title="Phase Passers" value={stats.phasePassersCount} icon={<Trophy />} color="blue" />
      <StatCard title="Total Liquidation" value={stats.totalLiquidationCount} icon={<Skull />} color="red" />
      <StatCard title="KYC Records" value={stats.totalKycCount} icon={<CheckCircle2 />} color="green" />
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <AdminSummaryTable title="Recent Orders" data={tabData.orders} columns={['email', 'plan', 'status']} onViewAll={() => onActiveTabChange('order-review')} />
      <AdminSummaryTable title="Recent Users" data={tabData.users} columns={['name', 'email', 'createdAt']} onViewAll={() => onActiveTabChange('user-directory')} />
    </div>
  </div>
));

const OrderReviewRow = memo(function OrderReviewRow({ 
  order, 
  onApprove, 
  onReject, 
  approvingId 
}: { 
  order: any, 
  onApprove: (id: string) => void, 
  onReject: (id: string) => void, 
  approvingId: string | null 
}) {
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    if (!order.userId) return;
    const unsub = onSnapshot(doc(db, 'users', order.userId), (snap) => {
      if (snap.exists()) setProfile(snap.data());
    }, (err) => {
      if (err.code === 'resource-exhausted') console.error('Quota exceeded for order profile sync');
    });
    return () => unsub();
  }, [order.userId]);

  return (
    <tr key={order.id} className="hover:bg-white/5 transition-colors">
      <td className="p-4 font-bold text-xs">{profile?.name || '—'}</td>
      <td className="p-4 text-xs text-muted-foreground">{order.email}</td>
      <td className="p-4 text-[10px] uppercase font-bold text-zinc-300">{order.plan}</td>
      <td className="p-4">
        <Badge variant="outline" className={cn(
          "text-[8px] font-black uppercase border-none",
          profile?.kycStatus === 'verified' ? "bg-emerald-500/20 text-emerald-500" :
          profile?.kycStatus === 'pending' ? "bg-amber-500/20 text-amber-500" :
          profile?.kycStatus === 'rejected' ? "bg-red-500/20 text-red-500" :
          "bg-zinc-500/20 text-zinc-400"
        )}>
          {profile?.kycStatus || 'none'}
        </Badge>
      </td>
      <td className="p-4 text-xs font-mono text-zinc-400">{order.accountSize || '—'}</td>
      <td className="p-4 text-xs font-mono font-bold text-white">${Number(order.amountPaid || 0).toFixed(2)}</td>
      <td className="p-4 text-[10px] uppercase font-bold text-muted-foreground">{order.network || '—'}</td>
      <td className="p-4">
        <Badge className={cn(
          "text-[8px] font-black uppercase",
          (order.status === 'completed' || order.status === 'approved' || order.status === 'paid') ? 'bg-emerald-500/20 text-emerald-500' : 
          (order.status === 'rejected' || order.status === 'cancelled') ? 'bg-red-500/20 text-red-500' :
          'bg-amber-500/20 text-amber-500'
        )}>
          {order.status}
        </Badge>
      </td>
      <td className="p-4 text-right space-x-2">
        {(order.status === 'manual_review' || order.status === 'pending' || order.status === 'waiting' || order.status === 'under_review') && (
          <>
            <Button size="sm" className="h-7 text-[8px] bg-emerald-600" onClick={() => onApprove(order.id)} disabled={approvingId === order.id}>
              {approvingId === order.id ? <Loader2 className="w-3 h-3 animate-spin" /> : "Approve"}
            </Button>
            <Button size="sm" variant="destructive" className="h-7 text-[8px]" onClick={() => onReject(order.id)}>Reject</Button>
          </>
        )}
      </td>
    </tr>
  );
});

export default function AdminTerminal() {
  const { user, loading: authLoading } = useAuth();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [adminError, setAdminError] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [isQuotaExhausted, setIsQuotaExhausted] = useState(false);
  
  const [stats, setStats] = useState({ 
    totalUsersCount: -1, totalNodesCount: -1, totalAum: -1, pendingOrdersCount: -1, phasePassersCount: -1, totalLiquidationCount: -1, totalKycCount: -1 
  });

  const lastRefreshTimeRef = useRef(0);

  const [tabData, setTabData] = useState<any>({
    users: [], orders: [], payouts: [], referrals: [], broadcasts: [], demoAccounts: [], breaches: [], passers: [], featuredPayouts: []
  });

  const [isLoading, setIsLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [approvingOrderId, setApprovingOrderId] = useState<string | null>(null);
  const [approvingKycUserId, setApprovingKycUserId] = useState<string | null>(null);
  const { toast } = useToast();

  const [isUserManagementOpen, setIsUserManagementOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [inspectionTab, setInspectionTab] = useState('trade-node');
  
  const [userTrades, setUserTrades] = useState<any[]>([]);
  const [userBreaches, setUserBreaches] = useState<any[]>([]);
  const [tradesLoading, setTradesLoading] = useState(false);

  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectingOrderId, setRejectingOrderId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const [isKycRejectModalOpen, setIsKycRejectModalOpen] = useState(false);
  const [kycRejectingUserId, setKycRejectingUserId] = useState<string | null>(null);
  const [kycRejectReason, setKycRejectReason] = useState('');

  const isAuthorized = useMemo(() => {
    if (!user || !user.email) return false;
    const adminList = ADMIN_EMAILS.map(e => e.toLowerCase());
    return adminList.includes(user.email.toLowerCase());
  }, [user]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchTerm(searchTerm), 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const refreshStats = useCallback(async (force = false) => {
    if (!isAuthenticated || !isAuthorized || authLoading || isQuotaExhausted) return;
    const now = Date.now();
    if (!force && lastRefreshTimeRef.current !== 0 && now - lastRefreshTimeRef.current < 5000) return;

    try {
      const fetchCount = async (collName: string, q: any) => {
        try {
          const count = (await getCountFromServer(q)).data().count;
          return count;
        } catch (e: any) {
          if (e.code === 'resource-exhausted') setIsQuotaExhausted(true);
          return null;
        }
      };

      const results = await Promise.allSettled([
        fetchCount('users', collection(db, 'users')),
        fetchCount('demoAccounts', collection(db, 'demoAccounts')),
        fetchCount('breaches', query(collection(db, 'demoAccounts'), where('status', 'in', ['blown', 'breach', 'terminated']))),
        fetchCount('passers', query(collection(db, 'demoAccounts'), where('status', '==', 'passed'))),
        fetchCount('orders', query(collection(db, 'orders'), where('status', 'in', ORDER_REVIEW_STATUSES))),
        getAggregateFromServer(query(collection(db, 'orders'), where('status', 'in', ['completed', 'approved', 'paid'])), { totalVolume: sum('amountPaid') }),
        fetchCount('kyc', query(collection(db, 'users'), where('kycStatus', 'in', ['pending', 'verified', 'rejected'])))
      ]);

      const statsPayload: any = {};
      results.forEach((r, i) => {
        const val = r.status === 'fulfilled' ? r.value : null;
        if (val !== null) {
          if (i === 0) statsPayload.totalUsersCount = val;
          if (i === 1) statsPayload.totalNodesCount = val;
          if (i === 2) statsPayload.totalLiquidationCount = val;
          if (i === 3) statsPayload.phasePassersCount = val;
          if (i === 4) statsPayload.pendingOrdersCount = val;
          if (i === 5) statsPayload.totalAum = (val as any)?.data?.()?.totalVolume || 0;
          if (i === 6) statsPayload.totalKycCount = val;
        }
      });

      if (Object.keys(statsPayload).length > 0) {
        setStats(prev => ({ ...prev, ...statsPayload }));
      }
      lastRefreshTimeRef.current = now;
    } catch (err: any) { 
      console.error('[Admin-Stats] Refresh fault:', err.message); 
    }
  }, [isAuthenticated, isAuthorized, authLoading, isQuotaExhausted]);

  const handleAdminAuth = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPasswordInput === '93463962569392846256') {
      localStorage.setItem('adminVerified', 'true');
      document.cookie = "admin_master=93463962569392846256; path=/; max-age=604800; SameSite=Lax; Secure";
      setIsAuthenticated(true);
      setShowAdminModal(false);
      setAdminError('');
    } else setAdminError('❌ Invalid credentials');
  };

  const handleViewUserByAccount = useCallback(async (userIdOrAccountId: string) => {
    setIsLoading(true);
    try {
      let accountSnap = await getDoc(doc(db, 'demoAccounts', userIdOrAccountId));
      let userSnap;
      let uid = '';

      if (accountSnap.exists()) {
        const accData = accountSnap.data();
        uid = accData.userId;
        userSnap = await getDoc(doc(db, 'users', uid));
      } else {
        uid = userIdOrAccountId;
        userSnap = await getDoc(doc(db, 'users', uid));
        const accQuery = query(collection(db, 'demoAccounts'), where('userId', '==', uid), limit(1));
        const accsSnap = await getDocs(accQuery);
        if (!accsSnap.empty) {
          const sorted = accsSnap.docs.sort((a, b) => 
            (b.data().updatedAt?.toMillis() || 0) - (a.data().updatedAt?.toMillis() || 0)
          );
          accountSnap = sorted[0] as any;
        }
      }

      const userData = userSnap?.exists() ? { id: userSnap.id, ...userSnap.data() } : { id: uid, email: '—' };
      const accountData = accountSnap?.exists() ? { id: accountSnap.id, ...accountSnap.data() } : null;

      const merged = {
        ...userData,
        ...accountData,
        accountStatus: accountData ? (accountData.status || "active") : "No Account Node",
        id: userData.id
      };

      setSelectedUser(merged);
      setTradesLoading(true);
      
      try {
        const tradesQ = query(collection(db, 'demoTrades'), where('userId', '==', userData.id), orderBy('openedAt', 'desc'), limit(100));
        const tradesSnap = await getDocs(tradesQ);
        setUserTrades(tradesSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) { setUserTrades([]); }

      try {
        if (accountData?.id) {
          const bQ = query(collection(db, 'breaches'), where('accountId', '==', accountData.id), orderBy('breachedAt', 'desc'));
          const bSnap = await getDocs(bQ);
          setUserBreaches(bSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        } else { setUserBreaches([]); }
      } catch (e) { setUserBreaches([]); }
      
      setTradesLoading(false);
      setInspectionTab('trade-node');
      setIsUserManagementOpen(true);
    } catch (e) {
      toast({ variant: "destructive", title: "Error", description: "Unable to load inspection data." });
    } finally { setIsLoading(false); }
  }, [toast]);

  const handleApproveKyc = useCallback(async (userId: string) => {
    if (!user) return;
    setApprovingKycUserId(userId);
    try {
      const idToken = await user.getIdToken(true);
      const res = await updateKycStatusAction(idToken, userId, 'verified');
      if (res.success) { 
        toast({ title: "KYC Approved" }); 
        refreshStats(true); 
      }
    } finally { setApprovingKycUserId(null); }
  }, [refreshStats, toast, user]);

  const handleApproveOrder = useCallback(async (orderId: string) => {
    setApprovingOrderId(orderId);
    try {
      const res = await approveManualOrderAction(orderId);
      if (res.success) { toast({ title: "Order Approved" }); refreshStats(true); }
    } finally { setApprovingOrderId(null); }
  }, [refreshStats, toast]);

  useEffect(() => {
    if (!isAuthenticated || !isAuthorized || authLoading || isQuotaExhausted) return;
    setIsLoading(true);
    let unsub: () => void = () => {};

    switch (activeTab) {
      case 'overview':
        refreshStats();
        {
          const uO = onSnapshot(query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(10)), (snap) => setTabData((prev: any) => ({ ...prev, users: snap.docs.map(d => ({ id: d.id, ...d.data() })) })));
          const oO = onSnapshot(query(collection(db, 'orders'), orderBy('submittedAt', 'desc'), limit(10)), (snap) => setTabData((prev: any) => ({ ...prev, orders: snap.docs.map(d => ({ id: d.id, ...d.data() })) })));
          unsub = () => { uO(); oO(); };
        }
        break;
      case 'order-review':
        unsub = onSnapshot(query(collection(db, 'orders'), where('status', 'in', ORDER_REVIEW_STATUSES)), (snap) => {
          setTabData((prev: any) => ({ ...prev, orders: snap.docs.map(d => ({ id: d.id, ...d.data() })) }));
          setIsLoading(false);
          setStats(prev => ({ ...prev, pendingOrdersCount: snap.size }));
        });
        break;
      case 'broadcasts':
        unsub = onSnapshot(query(collection(db, 'broadcasts'), orderBy('sentAt', 'desc')), (snap) => {
          setTabData((prev: any) => ({ ...prev, broadcasts: snap.docs.map(d => ({ id: d.id, ...d.data() })) }));
          setIsLoading(false);
        });
        break;
      case 'breaches':
        unsub = onSnapshot(query(collection(db, 'demoAccounts'), where('status', 'in', ['blown', 'breach', 'terminated'])), (snap) => {
          setTabData((prev: any) => ({ ...prev, breaches: snap.docs.map(d => ({ id: d.id, ...d.data() })) }));
          setIsLoading(false);
        });
        break;
      default: refreshStats(); setIsLoading(false);
    }
    return () => unsub();
  }, [isAuthenticated, isAuthorized, authLoading, activeTab, refreshStats, isQuotaExhausted]);

  if (authLoading) return null;

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <ShieldAlert className="w-16 h-16 text-destructive mb-6" />
        <h1 className="text-3xl font-headline font-bold text-white mb-2">Unauthorized</h1>
        <Button asChild><Link href="/dashboard">Return Home</Link></Button>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="w-full max-w-md bg-card/50 border-primary/20 backdrop-blur-xl">
          <CardHeader className="text-center">
             <Lock className="w-12 h-12 text-primary mx-auto mb-4" />
             <CardTitle className="text-2xl font-headline font-bold">Admin Key</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAdminAuth} className="space-y-4">
              <Input type="password" value={adminPasswordInput} onChange={(e) => setAdminPasswordInput(e.target.value)} className="text-center text-xl tracking-widest h-12" placeholder="••••••••" />
              {adminError && <p className="text-xs text-destructive text-center">{adminError}</p>}
              <Button type="submit" className="w-full h-12 font-black cyan-box-glow">Unlock Terminal</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background text-white">
      <Navigation />
      <main className="flex-1 p-8 overflow-y-auto custom-scrollbar">
        <header className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-10 pb-6 border-b border-white/5">
          <div className="space-y-1">
            <h1 className="text-3xl font-headline font-bold uppercase tracking-tighter">Administrative Terminal</h1>
            <p className="text-muted-foreground text-xs">System Intelligence & Global Control Hub.</p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
             <Button variant="outline" className="h-10 px-6 rounded-xl font-black text-[10px] border-white/10" onClick={() => refreshStats(true)}>
               <RefreshCw className={cn("w-3.5 h-3.5 mr-2", isLoading && "animate-spin")} /> Sync Network
             </Button>
          </div>
        </header>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
          <TabsList className="bg-transparent h-12 w-full justify-start p-0 gap-8 border-b border-white/5 rounded-none overflow-x-auto no-scrollbar">
            {['Overview', 'Breaches', 'Order Review', 'Broadcasts'].map(tab => (
              <TabsTrigger key={tab} value={tab.toLowerCase().replace(' ', '-')} className="data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 h-full text-xs font-black uppercase tracking-widest">{tab}</TabsTrigger>
            ))}
          </TabsList>
          
          <TabsContent value="overview"><OverviewTab stats={stats} tabData={tabData} onActiveTabChange={setActiveTab} /></TabsContent>

          <TabsContent value="breaches">
            <TabHeader title="Liquidation Ledger" />
            <DataTable 
              loading={isLoading} 
              data={tabData.breaches} 
              columns={['TRADER', 'ACCOUNT ID', 'ACCOUNT', 'PLAN', 'STATUS', 'REASON', 'BREACHED AT']} 
              renderRow={(b) => {
                const date = b.blownAt?.toDate ? b.blownAt.toDate() : (b.updatedAt?.toDate ? b.updatedAt.toDate() : null);
                return (
                  <tr key={b.id} className="hover:bg-white/5">
                    <td className="p-4 font-bold text-xs">{b.email || '—'}</td>
                    <td className="p-4 font-mono text-[10px] text-zinc-500">{b.id}</td>
                    <td className="p-4 text-xs font-mono font-bold">${(b.startBalance || 0).toLocaleString()}</td>
                    <td className="p-4 text-[10px] uppercase font-bold text-zinc-400">{b.planType || '—'}</td>
                    <td className="p-4"><Badge className="bg-red-500/20 text-red-500 border-none text-[8px] font-black uppercase">{b.status}</Badge></td>
                    <td className="p-4 text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap">{b.breachReason || 'Risk violation'}</td>
                    <td className="p-4 text-xs text-muted-foreground whitespace-nowrap">
                      {date ? (
                        <div className="flex flex-col">
                          <span className="text-white font-bold">{format(date, 'dd MMM yyyy')}</span>
                          <span className="text-[10px] font-mono">{format(date, 'HH:mm')}</span>
                        </div>
                      ) : '—'}
                    </td>
                  </tr>
                );
              }} 
            />
          </TabsContent>

          <TabsContent value="order-review">
            <TabHeader title="Commerce: Order Review" count={stats.pendingOrdersCount} onSearch={setSearchTerm} />
            <DataTable 
              loading={isLoading} 
              data={tabData.orders} 
              columns={['NAME', 'EMAIL', 'PLAN', 'KYC', 'ACCOUNT SIZE', 'AMOUNT', 'NETWORK', 'STATUS', 'ACTION']} 
              renderRow={(o) => (
                <OrderReviewRow 
                  key={o.id} 
                  order={o} 
                  onApprove={handleApproveOrder} 
                  onReject={(id) => { setRejectingOrderId(id); setIsRejectModalOpen(true); }}
                  approvingId={approvingOrderId}
                />
              )} 
            />
          </TabsContent>

          <TabsContent value="broadcasts">
            <TabHeader title="Communication: Broadcasts" />
            <DataTable 
              loading={isLoading} 
              data={tabData.broadcasts} 
              columns={['TITLE', 'MESSAGE', 'TYPE', 'SENT BY', 'SENT AT', 'ACTIONS']} 
              renderRow={(b) => (
                <tr key={b.id} className="hover:bg-white/5">
                  <td className="p-4 font-bold text-xs">{b.title}</td>
                  <td className="p-4 text-xs text-muted-foreground whitespace-pre-wrap">{b.message}</td>
                  <td className="p-4"><Badge variant="outline" className="text-[8px] font-black uppercase">{b.type || 'INFO'}</Badge></td>
                  <td className="p-4 text-[10px] font-mono">{b.sentBy || 'System'}</td>
                  <td className="p-4 text-[10px] text-muted-foreground">{b.sentAt?.toDate ? format(b.sentAt.toDate(), 'dd MMM yyyy, HH:mm') : '—'}</td>
                  <td className="p-4 text-right"><Button variant="destructive" size="sm" onClick={async () => { if(confirm("Delete?")) await deleteDoc(doc(db, 'broadcasts', b.id)); }}><Trash2 className="w-3 h-3" /></Button></td>
                </tr>
              )} 
            />
          </TabsContent>
        </Tabs>

        {/* User Inspection Modal */}
        <Dialog open={isUserManagementOpen} onOpenChange={setIsUserManagementOpen}>
          <DialogContent className="max-w-6xl h-[85vh] bg-zinc-950 border-zinc-800 p-0 overflow-hidden flex flex-col">
            <DialogHeader className="p-6 border-b border-white/5">
              <DialogTitle className="flex items-center gap-4">
                <Avatar className="w-10 h-10"><AvatarFallback>TR</AvatarFallback></Avatar>
                <div><h3 className="text-lg font-bold text-white">{selectedUser?.name || 'Trader Profile'}</h3><p className="text-xs text-zinc-500 font-mono">{selectedUser?.id}</p></div>
                <Badge className="ml-auto bg-primary/10 text-primary uppercase text-[10px]">{selectedUser?.accountStatus}</Badge>
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 flex overflow-hidden">
               <aside className="w-64 border-r border-white/5 p-4 space-y-2 shrink-0">
                  <button onClick={() => setInspectionTab('trade-node')} className={cn("w-full text-left p-3 rounded-lg text-xs font-bold", inspectionTab === 'trade-node' ? "bg-primary text-black" : "text-zinc-400")}>Trade Node</button>
                  <button onClick={() => setInspectionTab('trades')} className={cn("w-full text-left p-3 rounded-lg text-xs font-bold", inspectionTab === 'trades' ? "bg-primary text-black" : "text-zinc-400")}>Trade History</button>
                  <button onClick={() => setInspectionTab('kyc')} className={cn("w-full text-left p-3 rounded-lg text-xs font-bold", inspectionTab === 'kyc' ? "bg-primary text-black" : "text-zinc-400")}>Compliance / KYC</button>
                  <button onClick={() => setInspectionTab('breaches')} className={cn("w-full text-left p-3 rounded-lg text-xs font-bold", inspectionTab === 'breaches' ? "bg-primary text-black" : "text-zinc-400")}>Breach Logs</button>
               </aside>
               <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                  {inspectionTab === 'trade-node' && (
                    <div className="space-y-8">
                       <div><h3 className="text-xl font-bold text-white">User Inspection — {selectedUser?.email}</h3><p className="text-sm text-zinc-500">Trade node details, trade history, and breach logs.</p></div>
                       <div className="grid grid-cols-3 gap-4">
                          <InfoCard label="Email" value={selectedUser?.email} />
                          <InfoCard label="Display Name" value={selectedUser?.name} />
                          <InfoCard label="Plan Type" value={selectedUser?.planType} />
                          <InfoCard label="Account Size" value={selectedUser?.startBalance ? `$${selectedUser.startBalance.toLocaleString()}` : '—'} />
                          <InfoCard label="Status" value={selectedUser?.accountStatus} />
                          <InfoCard label="KYC Status" value={selectedUser?.kycStatus} />
                          <InfoCard label="Balance" value={selectedUser?.balance ? `$${selectedUser.balance.toLocaleString()}` : '—'} />
                          <InfoCard label="Equity" value={selectedUser?.equity ? `$${selectedUser.equity.toLocaleString()}` : '—'} />
                          <InfoCard label="Phase" value={selectedUser?.phase} />
                          <InfoCard label="Created" value={selectedUser?.createdAt?.toDate ? format(selectedUser.createdAt.toDate(), 'MMM d, yyyy') : '—'} />
                          <InfoCard label="Updated" value={selectedUser?.updatedAt?.toDate ? format(selectedUser.updatedAt.toDate(), 'MMM d, HH:mm') : '—'} />
                          <InfoCard label="User ID" value={selectedUser?.id} isMono />
                       </div>
                    </div>
                  )}
                  {inspectionTab === 'breaches' && (
                    <div className="space-y-6">
                      <div className="flex items-center gap-2 mb-4"><ShieldX className="text-destructive w-5 h-5" /><h3 className="text-lg font-bold text-white">System Breach Logs</h3></div>
                      {userBreaches.length === 0 ? (
                        <Card className="bg-emerald-500/5 border-emerald-500/20 p-10 flex flex-col items-center justify-center text-center space-y-4">
                           <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500"><Check size={24} /></div>
                           <p className="text-sm font-bold text-emerald-500">✅ No breach has been recorded for this account.</p>
                        </Card>
                      ) : (
                        userBreaches.map(breach => (
                          <Card key={breach.id} className="bg-destructive/5 border-destructive/20 p-6">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                              <BreachMetric label="Status" value="Breached" color="text-destructive" />
                              <BreachMetric label="Date" value={breach.breachedAt?.toDate ? format(breach.breachedAt.toDate(), 'PPP') : '—'} />
                              <BreachMetric label="Reason" value={breach.reason} color="text-destructive" />
                              <BreachMetric label="Rule" value="Risk Parameter Breach" />
                            </div>
                          </Card>
                        ))
                      )}
                    </div>
                  )}
               </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Rejection Modal */}
        <Dialog open={isRejectModalOpen} onOpenChange={setIsRejectModalOpen}>
          <DialogContent className="bg-zinc-950 border-zinc-800 text-white">
            <DialogHeader><DialogTitle>Reject Order</DialogTitle></DialogHeader>
            <div className="py-4 space-y-4">
              <Label>Reason</Label>
              <Textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Reason..." className="bg-secondary/30 h-32" />
            </div>
            <DialogFooter><Button variant="destructive" onClick={async () => { setActionLoading(true); await updateOrderStatusAction(rejectingOrderId!, 'rejected', rejectReason); setIsRejectModalOpen(false); setActionLoading(false); refreshStats(true); }}>Confirm Rejection</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}

function TabHeader({ title, count, onSearch }: { title: string, count?: number | string, onSearch?: (v: string) => void }) {
  return (
    <div className="flex flex-col md:flex-row justify-between items-center gap-4">
      <h2 className="text-xl font-headline font-bold uppercase tracking-tight">
        {title} {count !== undefined && <span className="text-primary ml-2">({count.toLocaleString()})</span>}
      </h2>
      {onSearch && (
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search..." onChange={e => onSearch(e.target.value)} className="pl-10 bg-secondary/30" />
        </div>
      )}
    </div>
  );
}

function InfoCard({ label, value, isMono = false }: { label: string, value: any, isMono?: boolean }) {
  return (
    <Card className="bg-secondary/30 p-4 border-white/5">
      <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">{label}</p>
      <p className={cn("text-sm font-bold truncate", isMono ? "font-mono text-xs text-zinc-400" : "text-white")}>{value || '—'}</p>
    </Card>
  );
}

function BreachMetric({ label, value, color = 'text-zinc-300' }: { label: string, value: any, color?: string }) {
  return (
    <div>
      <p className="text-[9px] font-black uppercase text-zinc-500 tracking-widest mb-1">{label}</p>
      <p className={cn("text-xs font-bold", color)}>{value || '—'}</p>
    </div>
  );
}
