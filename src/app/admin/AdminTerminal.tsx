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
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  Users, Activity, Search, Loader2, Database, ShieldCheck, RefreshCw, BarChart2, Monitor, Clock, Trophy, Skull, Megaphone, RotateCcw, Zap, Link as LinkIcon, Plus, Eye, Check, XCircle, Gift, History, ShieldAlert, CheckCircle2, Trash2, Settings2, Save, Network, BarChart3, Info, Wallet, User, TrendingUp, LogOut, ChevronLeft, ChevronRight, Upload, DollarSign, Globe, Check as CheckIcon, ChevronsUpDown, HeartPulse, AlertCircle, ArrowRight, Target, Hourglass, Mail, Phone, Lock
} from 'lucide-react';
import { 
  updateOrderStatusAction, 
  resetSingleAccountAction, 
  sendGlobalBroadcastAction, 
  approveManualOrderAction, 
  resetAllHistoryAction, 
  giftAccountAction, 
  updateKycStatusAction, 
  updatePayoutStatusAction, 
  cleanupDuplicateOrdersAction 
} from '@/app/admin/actions';
import { cn, sanitizeInput } from '@/lib/utils';
import { format, differenceInSeconds } from 'date-fns';
import { getTradeDate, formatDuration, calculateHoldingTimeSeconds } from '@/lib/tradeUtils';
import { db, storage } from '@/lib/firebase';
import { collection, query, orderBy, where, getCountFromServer, doc, onSnapshot, getAggregateFromServer, sum, getDoc, getDocs, addDoc, setDoc, deleteDoc, serverTimestamp, limit } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAuth } from '@/context/AuthContext';
import { ADMIN_EMAILS } from '@/lib/admin';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CONTRACT_SIZE } from '@/lib/rulesConfig';

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

const DataTable = memo(function DataTable({ loading, data, columns, renderRow }: { loading: boolean, data: any[], columns: string[], renderRow: (item: any, index: number) => React.ReactNode }) {
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

const PhasePassersTab = memo(({ data, isLoading, onInspect }: { data: any[], isLoading: boolean, onInspect: (userId: string) => void }) => (
  <div className="space-y-6">
    <TabHeader title="Elite Performance: Phase Passers" count={data.length} />
    <DataTable loading={isLoading} data={data} columns={['Trader', 'Account ID', 'Plan / Phase', 'Pass Date', 'Actions']} renderRow={(acc) => (
      <tr key={acc.id} className="hover:bg-white/5 transition-colors">
        <td className="p-4 font-bold text-xs">{acc.email || 'Trader'}</td>
        <td className="p-4 font-mono text-[10px] text-zinc-400">{acc.id}</td>
        <td className="p-4 text-[10px] uppercase font-bold text-zinc-300">{acc.planType || acc.plan} · {acc.phase}</td>
        <td className="p-4 text-xs text-muted-foreground">{acc.passedAt?.toDate ? format(acc.passedAt.toDate(), 'MMM d, yyyy') : 'Recently'}</td>
        <td className="p-4 text-right"><Button variant="outline" size="sm" onClick={() => onInspect(acc.userId)}><Eye className="w-3 h-3 mr-2" /> Inspect</Button></td>
      </tr>
    )} />
  </div>
));

const KycHubTab = memo(({ users, isLoading, onApprove, onReject, approvingUserId, stats }: { users: any[], isLoading: boolean, onApprove: (id: string) => void, onReject: (id: string) => void, approvingUserId: string | null, stats: any }) => (
  <div className="space-y-6">
    <TabHeader title="Compliance: Identity Review" count={stats.totalKycCount === -1 ? '...' : stats.totalKycCount} />
    <DataTable loading={isLoading} data={users} columns={['Trader', 'Submission Date', 'Proof Front', 'Proof Back', 'Selfie', 'Actions']} renderRow={(u) => (
      <tr key={u.id} className="hover:bg-white/5 transition-colors">
        <td className="p-4 font-bold text-xs">{u.email}</td>
        <td className="p-4 text-xs text-muted-foreground">{u.kycSubmittedAt ? format(new Date(u.kycSubmittedAt), 'MMM d, HH:mm') : 'Recently'}</td>
        <td className="p-4 text-center">{u.idProofUrl && <a href={u.idProofUrl} target="_blank" className="text-primary hover:underline text-[9px] font-black uppercase">View Front</a>}</td>
        <td className="p-4 text-center">{u.idBackProofUrl && <a href={u.idBackProofUrl} target="_blank" className="text-primary hover:underline text-[9px] font-black uppercase">View Back</a>}</td>
        <td className="p-4 text-center">{u.selfieProofUrl && <a href={u.selfieProofUrl} target="_blank" className="text-primary hover:underline text-[9px] font-black uppercase">View Selfie</a>}</td>
        <td className="p-4 text-right space-x-2">
          <Button size="sm" className="h-7 text-[8px] bg-emerald-600" onClick={() => onApprove(u.id)} disabled={approvingUserId === u.id}>{approvingUserId === u.id ? <Loader2 className="w-3 h-3 animate-spin" /> : "Approve"}</Button>
          <Button size="sm" variant="destructive" className="h-7 text-[8px]" onClick={() => onReject(u.id)}>Reject</Button>
        </td>
      </tr>
    )} />
  </div>
));

export default function AdminTerminal() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
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
  const [inspectionTab, setInspectionTab] = useState('overview');
  const [nodeFilterId, setNodeFilterId] = useState<string | null>(null);
  
  const [userTrades, setUserTrades] = useState<any[]>([]);
  const [tradesLoading, setTradesLoading] = useState(false);

  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectingOrderId, setRejectingOrderId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const [isKycRejectModalOpen, setIsKycRejectModalOpen] = useState(false);
  const [kycRejectingUserId, setKycRejectingUserId] = useState<string | null>(null);
  const [kycRejectReason, setKycRejectReason] = useState('');

  const instanceId = "Studio-8383940162";

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
        fetchCount('orders', query(collection(db, 'orders'), where('status', 'in', ['manual_review', 'completed', 'approved', 'rejected']))),
        getAggregateFromServer(query(collection(db, 'orders'), where('status', 'in', ['completed', 'approved'])), { totalVolume: sum('amountPaid') }),
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
    setActionLoading(true);
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
        globalLiquidity: accountData ? (accountData.balance || 0) : null,
        id: userData.id
      };

      setSelectedUser(merged);
      setNodeFilterId(accountData ? accountData.id : null);
      
      setTradesLoading(true);
      const tradesQ = query(collection(db, 'demoTrades'), where('userId', '==', userData.id), orderBy('openedAt', 'desc'), limit(100));
      const tradesSnap = await getDocs(tradesQ);
      setUserTrades(tradesSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setTradesLoading(false);

      setInspectionTab('overview');
      setIsUserManagementOpen(true);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Inspection Failed", description: e.message });
    } finally { setActionLoading(false); }
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
        if (selectedUser?.id === userId) handleViewUserByAccount(userId);
      }
    } finally { setApprovingKycUserId(null); }
  }, [refreshStats, toast, user, selectedUser, handleViewUserByAccount]);

  const handleRejectKyc = async () => {
    if (!kycRejectingUserId || !kycRejectReason.trim() || !user) return;
    setActionLoading(true);
    try {
      const idToken = await user.getIdToken(true);
      const res = await updateKycStatusAction(idToken, kycRejectingUserId, 'rejected', kycRejectReason.trim());
      if (res.success) {
        toast({ title: "KYC Rejected" });
        setIsKycRejectModalOpen(false);
        refreshStats(true);
        if (selectedUser?.id === kycRejectingUserId) handleViewUserByAccount(kycRejectingUserId);
      }
    } finally { setActionLoading(false); }
  };

  const handleApproveOrder = useCallback(async (orderId: string) => {
    setApprovingOrderId(orderId);
    try {
      const res = await approveManualOrderAction(orderId);
      if (res.success) { toast({ title: "Order Approved" }); refreshStats(true); }
      else toast({ variant: "destructive", title: "Failed", description: res.error });
    } finally { setApprovingOrderId(null); }
  }, [refreshStats, toast]);

  const handleRejectOrder = async () => {
    if (!rejectingOrderId || !rejectReason.trim()) return;
    setActionLoading(true);
    try {
      const res = await updateOrderStatusAction(rejectingOrderId, 'rejected', rejectReason.trim());
      if (res.success) {
        toast({ title: "Order Rejected" });
        setIsRejectModalOpen(false);
        refreshStats(true);
      }
    } finally { setActionLoading(false); }
  };

  useEffect(() => {
    if (!isAuthenticated || !isAuthorized || authLoading || isQuotaExhausted) return;
    setIsLoading(true);
    let unsub: () => void = () => {};
    const term = debouncedSearchTerm.toLowerCase().trim();

    if (term && (activeTab === 'user-directory' || activeTab === 'trading-nodes')) {
      const path = activeTab === 'user-directory' ? 'users' : 'demoAccounts';
      const q = query(collection(db, path), where('email', '>=', term), where('email', '<=', term + '\uf8ff'), limit(100));
      unsub = onSnapshot(q, (snap) => {
        setTabData((prev: any) => ({ ...prev, [activeTab === 'user-directory' ? 'users' : 'demoAccounts']: snap.docs.map(d => ({ id: d.id, ...d.data() })) }));
        setIsLoading(false);
      });
      return () => unsub();
    }

    switch (activeTab) {
      case 'overview':
        refreshStats();
        {
          const uO = onSnapshot(query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(10)), (snap) => setTabData((prev: any) => ({ ...prev, users: snap.docs.map(d => ({ id: d.id, ...d.data() })) })));
          const oO = onSnapshot(query(collection(db, 'orders'), orderBy('submittedAt', 'desc'), limit(10)), (snap) => setTabData((prev: any) => ({ ...prev, orders: snap.docs.map(d => ({ id: d.id, ...d.data() })) })));
          unsub = () => { uO(); oO(); };
        }
        break;
      case 'kyc-hub':
        unsub = onSnapshot(query(collection(db, 'users'), where('kycStatus', 'in', ['pending', 'verified', 'rejected']), limit(100)), (snap) => {
          setTabData((prev: any) => ({ ...prev, users: snap.docs.map(d => ({ id: d.id, ...d.data() })) }));
          setIsLoading(false);
        });
        break;
      case 'trading-nodes':
        unsub = onSnapshot(query(collection(db, 'demoAccounts'), orderBy('updatedAt', 'desc'), limit(100)), (snap) => {
          setTabData((prev: any) => ({ ...prev, demoAccounts: snap.docs.map(d => ({ id: d.id, ...d.data() })) }));
          setIsLoading(false);
        });
        break;
      case 'order-review':
        unsub = onSnapshot(query(collection(db, 'orders'), where('status', 'in', ['manual_review', 'completed', 'approved', 'rejected']), limit(100)), (snap) => {
          setTabData((prev: any) => ({ ...prev, orders: snap.docs.map(d => ({ id: d.id, ...d.data() })) }));
          setIsLoading(false);
        });
        break;
      default: refreshStats(); setIsLoading(false);
    }
    return () => unsub();
  }, [isAuthenticated, isAuthorized, authLoading, activeTab, debouncedSearchTerm, refreshStats, isQuotaExhausted]);

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
            <p className="text-muted-foreground text-xs">{instanceId} · {user?.email}</p>
          </div>
          <div className="flex gap-4">
             <Button className="h-10 font-bold bg-primary text-black" asChild><Link href="/admin/price-tracker">Price Tracker</Link></Button>
             <Button variant="outline" className="h-10" onClick={() => refreshStats(true)}><RefreshCw className={cn("w-4 h-4 mr-2", isLoading && "animate-spin")} /> Sync</Button>
          </div>
        </header>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
          <TabsList className="bg-transparent h-12 w-full justify-start p-0 gap-8 border-b border-white/5 rounded-none">
            {['Overview', 'Phase Passers', 'KYC Hub', 'Order Review', 'Trading Nodes', 'User Directory'].map(tab => (
              <TabsTrigger key={tab} value={tab.toLowerCase().replace(' ', '-')} className="data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 h-full text-xs font-black uppercase tracking-widest text-muted-foreground">{tab}</TabsTrigger>
            ))}
          </TabsList>
          
          <TabsContent value="overview"><OverviewTab stats={stats} tabData={tabData} onActiveTabChange={setActiveTab} /></TabsContent>
          <TabsContent value="phase-passers"><PhasePassersTab data={tabData.passers} isLoading={isLoading} onInspect={handleViewUserByAccount} /></TabsContent>
          <TabsContent value="kyc-hub"><KycHubTab users={tabData.users} isLoading={isLoading} onApprove={handleApproveKyc} onReject={id => { setKycRejectingUserId(id); setIsKycRejectModalOpen(true); }} approvingUserId={approvingKycUserId} stats={stats} /></TabsContent>
          
          <TabsContent value="order-review">
            <TabHeader title="Order Review" count={stats.pendingOrdersCount} onSearch={setSearchTerm} />
            <DataTable loading={isLoading} data={tabData.orders} columns={['EMAIL', 'PLAN', 'AMOUNT', 'STATUS', 'ACTIONS']} renderRow={(o) => (
              <tr key={o.id} className="hover:bg-white/5">
                <td className="p-4 text-xs">{o.email}</td>
                <td className="p-4 text-[10px] font-bold uppercase">{o.plan}</td>
                <td className="p-4 font-mono text-xs">${Number(o.amountPaid || 0).toFixed(2)}</td>
                <td className="p-4"><Badge className={cn("text-[8px] uppercase", o.status === 'completed' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-amber-500/20 text-amber-500')}>{o.status}</Badge></td>
                <td className="p-4 text-right space-x-2">
                   {o.status === 'manual_review' && (
                     <>
                        <Button size="sm" className="h-7 text-[8px] bg-emerald-600" onClick={() => handleApproveOrder(o.id)} disabled={approvingOrderId === o.id}>Approve</Button>
                        <Button size="sm" variant="destructive" className="h-7 text-[8px]" onClick={() => { setRejectingOrderId(o.id); setIsRejectModalOpen(true); }}>Reject</Button>
                     </>
                   )}
                   {(o.proofScreenshotUrl || o.proofUrl) && <button onClick={() => window.open(o.proofScreenshotUrl || o.proofUrl, '_blank')} className="text-primary text-[8px] font-black uppercase">PROOF</button>}
                </td>
              </tr>
            )} />
          </TabsContent>

          <TabsContent value="trading-nodes">
            <TabHeader title="Active Nodes" count={stats.totalNodesCount} onSearch={setSearchTerm} />
            <DataTable loading={isLoading} data={tabData.demoAccounts} columns={['EMAIL', 'PLAN', 'BALANCE', 'STATUS', 'ACTIONS']} renderRow={(acc) => (
              <tr key={acc.id} className="hover:bg-white/5">
                <td className="p-4 text-xs">{acc.email}</td>
                <td className="p-4 text-[10px] font-bold uppercase">{acc.planType}</td>
                <td className="p-4 font-mono text-xs">${(acc.balance || 0).toLocaleString()}</td>
                <td className="p-4"><Badge className={cn("text-[8px] uppercase", acc.status === 'active' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-red-500/20 text-red-500')}>{acc.status}</Badge></td>
                <td className="p-4 text-right"><Button size="sm" variant="outline" className="h-7 text-[8px]" onClick={() => handleViewUserByAccount(acc.id)}>Inspect</Button></td>
              </tr>
            )} />
          </TabsContent>
        </Tabs>

        {/* User Inspection Modal */}
        <Dialog open={isUserManagementOpen} onOpenChange={setIsUserManagementOpen}>
          <DialogContent className="max-w-6xl h-[85vh] bg-zinc-950 border-zinc-800 p-0 overflow-hidden flex flex-col">
            <DialogHeader className="p-6 border-b border-white/5">
              <DialogTitle className="flex items-center gap-4">
                <Avatar className="w-10 h-10 border border-primary/20"><AvatarFallback>{selectedUser?.name?.slice(0,2).toUpperCase() || 'TR'}</AvatarFallback></Avatar>
                <div>
                  <h3 className="text-lg font-bold text-white">{selectedUser?.name || 'Trader Profile'}</h3>
                  <p className="text-xs text-zinc-500 font-mono">{selectedUser?.id}</p>
                </div>
                <Badge className="ml-auto bg-primary/10 text-primary uppercase text-[10px]">{selectedUser?.accountStatus}</Badge>
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 flex overflow-hidden">
               <aside className="w-64 border-r border-white/5 p-4 space-y-2 shrink-0">
                  <button onClick={() => setInspectionTab('overview')} className={cn("w-full text-left p-3 rounded-lg text-xs font-bold transition-all", inspectionTab === 'overview' ? "bg-primary text-black" : "text-zinc-400 hover:bg-white/5")}>Node Overview</button>
                  <button onClick={() => setInspectionTab('trades')} className={cn("w-full text-left p-3 rounded-lg text-xs font-bold transition-all", inspectionTab === 'trades' ? "bg-primary text-black" : "text-zinc-400 hover:bg-white/5")}>Trade Ledger</button>
                  <button onClick={() => setInspectionTab('kyc')} className={cn("w-full text-left p-3 rounded-lg text-xs font-bold transition-all", inspectionTab === 'kyc' ? "bg-primary text-black" : "text-zinc-400 hover:bg-white/5")}>Compliance / KYC</button>
               </aside>
               <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                  {inspectionTab === 'overview' && (
                    <div className="space-y-8">
                       <div className="grid grid-cols-3 gap-4">
                          <Card className="bg-secondary/30 p-4"><p className="text-[9px] font-black text-zinc-500 mb-1">BALANCE</p><p className="text-xl font-bold font-mono text-white">${selectedUser?.balance?.toLocaleString()}</p></Card>
                          <Card className="bg-secondary/30 p-4"><p className="text-[9px] font-black text-zinc-500 mb-1">EQUITY</p><p className="text-xl font-bold font-mono text-emerald-400">${selectedUser?.equity?.toLocaleString()}</p></Card>
                          <Card className="bg-secondary/30 p-4"><p className="text-[9px] font-black text-zinc-500 mb-1">START BAL</p><p className="text-xl font-bold font-mono text-zinc-400">${selectedUser?.startBalance?.toLocaleString()}</p></Card>
                       </div>
                       <div className="grid grid-cols-2 gap-8">
                          <div className="space-y-4">
                             <h4 className="text-xs font-black uppercase text-primary border-b border-primary/20 pb-2">Administrative Actions</h4>
                             <div className="grid grid-cols-1 gap-2">
                                <Button variant="outline" className="justify-start text-xs h-11" onClick={() => { if(confirm("Reset account balance and history?")) resetSingleAccountAction(nodeFilterId!) }}>Reset Node Sequence</Button>
                                <Button variant="destructive" className="justify-start text-xs h-11">Terminate Execution</Button>
                             </div>
                          </div>
                          <div className="space-y-4">
                             <h4 className="text-xs font-black uppercase text-zinc-500 border-b border-white/5 pb-2">System Telemetry</h4>
                             <div className="text-[10px] space-y-2 text-zinc-400">
                                <div className="flex justify-between"><span>Plan Type:</span><span className="text-white font-bold">{selectedUser?.planType}</span></div>
                                <div className="flex justify-between"><span>Phase:</span><span className="text-white font-bold">{selectedUser?.phase}</span></div>
                                <div className="flex justify-between"><span>Updated:</span><span className="text-white">{selectedUser?.updatedAt?.toDate()?.toLocaleString()}</span></div>
                             </div>
                          </div>
                       </div>
                    </div>
                  )}
                  {inspectionTab === 'trades' && (
                    <div className="space-y-4">
                      <DataTable loading={tradesLoading} data={userTrades} columns={['SYM', 'TYPE', 'LOTS', 'OPEN', 'PNL', 'STATUS']} renderRow={(t) => (
                        <tr key={t.id} className="text-[10px]">
                          <td className="p-3 font-bold">{t.symbol}</td>
                          <td className="p-3 uppercase">{t.type}</td>
                          <td className="p-3 font-mono">{t.lots}</td>
                          <td className="p-3 font-mono">${t.openPrice?.toLocaleString()}</td>
                          <td className={cn("p-3 font-bold", t.pnl >= 0 ? "text-emerald-500" : "text-red-500")}>${Number(t.pnl || 0).toFixed(2)}</td>
                          <td className="p-3 uppercase text-zinc-500">{t.status}</td>
                        </tr>
                      )} />
                    </div>
                  )}
                  {inspectionTab === 'kyc' && (
                    <div className="space-y-8">
                       <div className="flex justify-between items-center">
                          <h4 className="text-sm font-bold">Verification Status: <span className="text-primary">{selectedUser?.kycStatus?.toUpperCase() || 'NONE'}</span></h4>
                          <div className="space-x-2">
                             <Button size="sm" className="bg-emerald-600 h-8" onClick={() => handleApproveKyc(selectedUser?.id)}>Approve</Button>
                             <Button size="sm" variant="destructive" className="h-8" onClick={() => { setKycRejectingUserId(selectedUser?.id); setIsKycRejectModalOpen(true); }}>Reject</Button>
                          </div>
                       </div>
                       <div className="grid grid-cols-2 gap-8">
                          {selectedUser?.idProofUrl && <div className="space-y-2"><p className="text-[10px] font-bold text-zinc-500">ID FRONT</p><img src={selectedUser.idProofUrl} className="w-full rounded-xl border border-white/10" alt="ID Front" /></div>}
                          {selectedUser?.idBackProofUrl && <div className="space-y-2"><p className="text-[10px] font-bold text-zinc-500">ID BACK</p><img src={selectedUser.idBackProofUrl} className="w-full rounded-xl border border-white/10" alt="ID Back" /></div>}
                          {selectedUser?.selfieProofUrl && <div className="space-y-2"><p className="text-[10px] font-bold text-zinc-500">SELFIE</p><img src={selectedUser.selfieProofUrl} className="w-full rounded-xl border border-white/10" alt="Selfie" /></div>}
                       </div>
                    </div>
                  )}
               </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Rejection Modal for KYC */}
        <Dialog open={isKycRejectModalOpen} onOpenChange={setIsKycRejectModalOpen}>
          <DialogContent className="bg-zinc-950 border-zinc-800 text-white">
            <DialogHeader><DialogTitle>Reject KYC Submission</DialogTitle></DialogHeader>
            <div className="py-4 space-y-4">
              <Label>Reason for Rejection</Label>
              <Textarea value={kycRejectReason} onChange={e => setKycRejectReason(e.target.value)} placeholder="e.g. Image blurry, ID expired..." className="bg-secondary/30 h-32" />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setIsKycRejectModalOpen(false)}>Cancel</Button>
              <Button variant="destructive" onClick={handleRejectKyc} disabled={actionLoading}>Reject Verification</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Rejection Modal for Orders */}
        <Dialog open={isRejectModalOpen} onOpenChange={setIsRejectModalOpen}>
          <DialogContent className="bg-zinc-950 border-zinc-800 text-white">
            <DialogHeader><DialogTitle>Reject Order</DialogTitle></DialogHeader>
            <div className="py-4 space-y-4">
              <Label>Reason for Rejection</Label>
              <Textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="e.g. Payment not received, wrong network..." className="bg-secondary/30 h-32" />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setIsRejectModalOpen(false)}>Cancel</Button>
              <Button variant="destructive" onClick={handleRejectOrder} disabled={actionLoading}>Confirm Rejection</Button>
            </DialogFooter>
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
        {title} {count !== undefined && <span className="text-primary ml-2 opacity-50">({count === -1 ? '...' : count})</span>}
      </h2>
      {onSearch && (
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search records..." onChange={e => onSearch(e.target.value)} className="pl-10 bg-secondary/30" />
        </div>
      )}
    </div>
  );
}
