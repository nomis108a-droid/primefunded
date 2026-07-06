"use client";

import { useState, useMemo, useEffect, memo, useCallback, useRef } from 'react';
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
  Users, Activity, Search, Loader2, DollarSign, ChevronLeft, Terminal, Database, ShieldCheck, Wand2, RefreshCw, BarChart2, Monitor, Clock, AlertOctagon, Trophy, CreditCard, Send, Fingerprint, Skull, Filter, ExternalLink, CheckCircle2, XCircle, Eye, Phone, Globe, Mail, User, AlertCircle, RotateCcw, Zap, Trash2, LogOut, Gift, Image as ImageIcon, Copy, ChevronRight, History
} from 'lucide-react';
import { updateOrderStatusAction, processKycAction, resetDemoAccountAction, sendGlobalBroadcastAction, fetchUserDetailAction, cleanupDemoAccountsAction, manualBreachAccountAction, auditAndResetFridayBreachesAction } from './actions';
import { cn } from '@/lib/utils';
import { format, isValid } from 'date-fns';
import { getTradeDate } from '@/lib/tradeUtils';
import Link from 'next/link';
import Image from 'next/image';
import { db, auth as clientAuth } from '@/lib/firebase';
import { collection, getDocs, query, orderBy, limit, where } from 'firebase/firestore';
import { ADMIN_EMAILS } from '@/lib/admin';
import { useAuth } from '@/context/AuthContext';

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
  const { user } = useAuth();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loggedInAdmin, setLoggedInAdmin] = useState<string | null>(null);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminEmailInput, setAdminEmailInput] = useState('');
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [adminError, setAdminError] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [adminData, setAdminData] = useState<any>({ 
    users: [], orders: [], payouts: [], referrals: [], broadcasts: [], breaches: [], demoAccounts: [], demoTrades: [] 
  });
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [isRateLimited, setIsRateLimited] = useState(false);
  const isSyncingRef = useRef(false);
  const { toast } = useToast();

  const [userDetail, setUserDetail] = useState<any>(null);
  const [isUserDetailModalOpen, setIsUserDetailModalOpen] = useState(false);
  const [userDetailLoading, setUserDetailLoading] = useState(false);

  const [isBroadcastModalOpen, setIsBroadcastModalOpen] = useState(false);
  const [broadcastForm, setBroadcastForm] = useState({ title: '', message: '', type: 'info' });

  const [isGiftModalOpen, setIsGiftModalOpen] = useState(false);
  const [giftForm, setGiftForm] = useState({ userId: '', label: '', amount: '100000', plan: '1-step-pro', phase: 'evaluation' });

  const [breachForm, setBreachForm] = useState({ accountId: '', reason: '', isOpen: false });

  const [kycRejectModal, setKycRejectModal] = useState({ isOpen: false, id: '', reason: '' });
  const [orderRejectModal, setOrderRejectModal] = useState({ isOpen: false, id: '', reason: '' });

  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);

  // Friday Rule Reset Tool
  const [fridayAudit, setFridayAudit] = useState<any[] | null>(null);
  const [isFridayModalOpen, setIsFridayModalOpen] = useState(false);

  const tabsListRef = useRef<HTMLDivElement>(null);

  const refreshData = useCallback(async () => {
    if (isSyncingRef.current || isRateLimited) return;
    isSyncingRef.current = true;
    setIsLoading(true);
    
    try {
      const [usersSnap, accountsSnap, tradesSnap, ordersSnap, payoutsSnap, referralsSnap, broadcastsSnap, breachesSnap] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'demoAccounts')),
        getDocs(query(collection(db, 'demoTrades'), limit(500), orderBy('openedAt', 'desc'))),
        getDocs(collection(db, 'orders')),
        getDocs(collection(db, 'payouts')),
        getDocs(collection(db, 'referrals')),
        getDocs(collection(db, 'broadcasts')),
        getDocs(collection(db, 'breaches')),
      ]);
      
      setAdminData({
        users: usersSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => new Date(b.joinDate || 0).getTime() - new Date(a.joinDate || 0).getTime()),
        demoAccounts: accountsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        demoTrades: tradesSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        orders: ordersSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => (b.submittedAt?.seconds || 0) - (a.submittedAt?.seconds || 0)),
        payouts: payoutsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        referrals: referralsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        broadcasts: broadcastsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        breaches: breachesSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => (b.breachedAt?.seconds || 0) - (a.breachedAt?.seconds || 0)),
      });
      setIsRateLimited(false);
    } catch (err: any) {
      console.error("[Admin] Sync fault:", err);
      if (err.message?.includes('429')) {
        setIsRateLimited(true);
        toast({ variant: "destructive", title: "Rate Limited", description: "Terminal synchronization paused for 60s." });
        setTimeout(() => setIsRateLimited(false), 60000);
      } else {
        toast({ variant: "destructive", title: "Sync Error", description: err.message });
      }
    } finally {
      setIsLoading(false);
      isSyncingRef.current = false;
    }
  }, [toast, isRateLimited]);

  useEffect(() => {
    const isVerified = localStorage.getItem('adminVerified') === 'true';
    const email = localStorage.getItem('adminEmail');
    if (isVerified && email) {
      setIsAuthenticated(true);
      setLoggedInAdmin(email);
      document.cookie = `admin_email=${email}; path=/; max-age=86400; SameSite=Lax`;
      document.cookie = `admin_master=93463962569392846256; path=/; max-age=86400; SameSite=Lax`;
      refreshData();
    } else {
      setShowAdminModal(true);
    }
  }, [refreshData]);

  const handleAdminAuth = (e: React.FormEvent) => {
    e.preventDefault();
    const MASTER_PASSWORD = '93463962569392846256';
    if (!ADMIN_EMAILS.includes(adminEmailInput.toLowerCase())) {
      setAdminError('❌ Unauthorized email address');
      return;
    }
    if (adminPasswordInput !== MASTER_PASSWORD) {
      setAdminError('❌ Invalid master password');
      return;
    }
    localStorage.setItem('adminVerified', 'true');
    localStorage.setItem('adminEmail', adminEmailInput.toLowerCase());
    document.cookie = 'admin_master=93463962569392846256; path=/; max-age=86400; SameSite=Lax';
    document.cookie = `admin_email=${adminEmailInput.toLowerCase()}; path=/; max-age=86400; SameSite=Lax`;
    setIsAuthenticated(true);
    setLoggedInAdmin(adminEmailInput.toLowerCase());
    setShowAdminModal(false);
    refreshData();
  };

  const handleLogout = () => {
    localStorage.removeItem('adminVerified');
    localStorage.removeItem('adminEmail');
    document.cookie = 'admin_master=; path=/; max-age=0';
    document.cookie = 'admin_email=; path=/; max-age=0';
    setIsAuthenticated(false);
    window.location.reload();
  };

  const handleOrderAction = async (id: string, status: string, reason?: string) => {
    setActionLoading(true);
    try {
      const res = await updateOrderStatusAction(id, status, reason);
      if (res.success) {
        toast({ title: `Order ${status.toUpperCase()}` });
        refreshData();
      } else throw new Error(res.error);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Action Failed", description: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleKycAction = async (id: string, status: string, reason?: string) => {
    setActionLoading(true);
    try {
      const res = await processKycAction(id, status, reason);
      if (res.success) {
        toast({ title: `KYC ${status.toUpperCase()}` });
        refreshData();
      } else throw new Error(res.error);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Action Failed", description: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleGiftAccount = async () => {
    if (!giftForm.userId || !giftForm.label) return;
    setActionLoading(true);
    try {
      const token = await user?.getIdToken();
      const targetUser = adminData.users.find((u: any) => u.traderId === giftForm.userId);
      const email = targetUser?.email || '';
      const res = await fetch('/api/admin/gift-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ userId: giftForm.userId, email, label: giftForm.label, amount: parseInt(giftForm.amount), plan: giftForm.plan, phase: giftForm.phase })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: "Account Provisioned Successfully" });
      setIsGiftModalOpen(false);
      refreshData();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Gifting Failed", description: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleManualBreach = async () => {
    if (!breachForm.accountId || !breachForm.reason) return;
    setActionLoading(true);
    try {
      const res = await manualBreachAccountAction(breachForm.accountId, breachForm.reason);
      if (res.success) {
        toast({ title: "Account Terminated", description: "Node has been manually liquidated." });
        setBreachForm({ accountId: '', reason: '', isOpen: false });
        if (userDetail?.user?.id) {
          const updatedDetail = await fetchUserDetailAction(userDetail.user.id);
          if (updatedDetail.success) setUserDetail(updatedDetail);
        }
        refreshData();
      } else throw new Error(res.error);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Breach Failed", description: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleCleanup = async () => {
    if (!confirm("Are you sure? This will delete ALL demo accounts across the network.")) return;
    setActionLoading(true);
    try {
      const res = await cleanupDemoAccountsAction();
      if (res.success) {
        toast({ title: "Environment Sanitized", description: `Deleted ${res.count} demo nodes.` });
        refreshData();
      }
    } catch (e: any) {
      toast({ variant: "destructive", title: "Cleanup Failed", description: e.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleFridayAudit = async () => {
    setActionLoading(true);
    const res = await auditAndResetFridayBreachesAction(true);
    if (res.success) {
      setFridayAudit(res.affected);
      setIsFridayModalOpen(true);
    }
    setActionLoading(false);
  };

  const handleFridayReset = async () => {
    if (!confirm("RESTORE ALL FRIDAY OVERNIGHT BREACHES? This will reactivate accounts and users.")) return;
    setActionLoading(true);
    const res = await auditAndResetFridayBreachesAction(false);
    if (res.success) {
      toast({ title: "Rule Applied", description: `Restored ${res.affected.length} accounts.` });
      setIsFridayModalOpen(false);
      refreshData();
    }
    setActionLoading(false);
  };

  const scrollTabs = (direction: 'left' | 'right') => {
    if (tabsListRef.current) {
      const amount = direction === 'left' ? -200 : 200;
      tabsListRef.current.scrollBy({ left: amount, behavior: 'smooth' });
    }
  };

  const kycApplications = useMemo(() => 
    adminData.users.filter((u: any) => u.kycStatus === 'pending' || u.kycStatus === 'verified' || u.kycStatus === 'rejected')
  , [adminData.users]);

  const filteredUsers = useMemo(() => 
    adminData.users.filter((u: any) => {
      const term = searchTerm.toLowerCase();
      return (
        u.email?.toLowerCase().includes(term) || 
        u.name?.toLowerCase().includes(term) ||
        u.traderId?.includes(searchTerm) ||
        u.phone?.includes(searchTerm)
      );
    })
  , [adminData.users, searchTerm]);

  return (
    <div className="flex min-h-screen bg-background">
      <Navigation />
      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="p-8 shrink-0 border-b border-white/5">
          {isRateLimited && (
            <div className="mb-6 p-4 rounded-xl bg-destructive/10 border border-destructive/20 flex items-center gap-3">
              <AlertOctagon className="w-5 h-5 text-destructive animate-pulse" />
              <div>
                <p className="text-sm font-bold text-white">Project Rate Limited</p>
                <p className="text-xs text-destructive/80">Firestore access is currently throttled. Background synchronization is paused.</p>
              </div>
            </div>
          )}

          <div className="flex justify-between items-start mb-6">
            <div>
              <div className="flex items-center gap-3 mb-1">
                 <h1 className="text-4xl font-headline font-bold text-white">Administrative Terminal</h1>
                 <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">{loggedInAdmin}</Badge>
              </div>
              <p className="text-muted-foreground text-sm">Institutional Node Control & Compliance Hub.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="h-10 px-4 border-amber-500/20 text-amber-500 hover:bg-amber-500/10" onClick={handleFridayAudit} disabled={actionLoading}>
                <RotateCcw className="w-4 h-4 mr-2" /> Friday Rule Reset
              </Button>
              <Button variant="outline" size="sm" className="h-10 px-4" asChild>
                <Link href="/admin/price-tracker"><Activity className="w-4 h-4 mr-2" /> Price Synchronizer</Link>
              </Button>
              <Button variant="outline" size="sm" className="h-10 px-4 border-destructive/20 text-destructive hover:bg-destructive/10" onClick={handleCleanup} disabled={actionLoading}>
                <Trash2 className="w-4 h-4 mr-2" /> Cleanup Environment
              </Button>
              <Button size="sm" className="h-10 px-6 font-bold bg-primary text-black hover:bg-primary/90" onClick={() => setIsGiftModalOpen(true)}>
                <Gift className="w-4 h-4 mr-2" /> Gift Account
              </Button>
              <Button variant="outline" size="sm" className="h-10 px-4" onClick={refreshData} disabled={isLoading || isRateLimited}>
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                Sync Network
              </Button>
              <Button variant="ghost" size="icon" className="h-10 w-10 text-muted-foreground hover:text-white" onClick={handleLogout}>
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
          
          <div className="relative flex items-center group">
            <button onClick={() => scrollTabs('left')} className="absolute -left-4 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-zinc-900 border border-border flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList ref={tabsListRef} className="bg-secondary/50 h-11 p-1 rounded-xl w-full justify-start overflow-x-auto no-scrollbar">
                <TabsTrigger value="overview" className="px-6 font-bold">Overview</TabsTrigger>
                <TabsTrigger value="nodes" className="px-6 font-bold">Trading Nodes</TabsTrigger>
                <TabsTrigger value="passers" className="px-6 font-bold">Phase Passers</TabsTrigger>
                <TabsTrigger value="orders" className="px-6 font-bold">Order Review</TabsTrigger>
                <TabsTrigger value="payouts" className="px-6 font-bold">Payout Hub</TabsTrigger>
                <TabsTrigger value="users" className="px-6 font-bold">User Directory</TabsTrigger>
                <TabsTrigger value="referrals" className="px-6 font-bold">Referral Audit</TabsTrigger>
                <TabsTrigger value="breaches" className="px-6 font-bold">Breaches</TabsTrigger>
                <TabsTrigger value="broadcasts" className="px-6 font-bold">Broadcasts</TabsTrigger>
                <TabsTrigger value="kyc" className="px-6 font-bold">KYC Hub</TabsTrigger>
              </TabsList>
            </Tabs>
            <button onClick={() => scrollTabs('right')} className="absolute -right-4 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-zinc-900 border border-border flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          {activeTab === 'overview' && (
            <div className="space-y-10">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard title="Active Traders" value={adminData.users.length} icon={<Users />} color="blue" />
                <StatCard title="Total Volume" value={`$${(adminData.demoAccounts.reduce((acc: any, curr: any) => acc + (curr.balance || 0), 0) / 1000000).toFixed(2)}M`} icon={<BarChart2 />} color="green" />
                <StatCard title="Pending Orders" value={adminData.orders.filter((o: any) => o.status === 'pending').length} icon={<CreditCard />} color="amber" />
                <StatCard title="Passed Challenges" value={adminData.demoAccounts.filter((a: any) => a.status === 'passed').length} icon={<Trophy />} color="purple" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                 <Card className="bg-card/40 border-border/50">
                    <CardHeader className="pb-2 flex flex-row items-center justify-between">
                      <CardTitle className="text-sm font-bold uppercase tracking-widest text-primary">Recent Orders</CardTitle>
                      <Button variant="ghost" size="sm" className="text-[10px] uppercase font-bold h-7" onClick={() => setActiveTab('orders')}>View All</Button>
                    </CardHeader>
                    <CardContent className="p-0">
                       <table className="w-full text-xs text-left">
                         <tbody className="divide-y divide-border/50">
                           {adminData.orders.slice(0, 5).map((o: any) => (
                             <tr key={o.id} className="hover:bg-white/5">
                               <td className="p-4 font-bold text-white">{o.email}</td>
                               <td className="p-4 text-primary">{o.plan} {o.accountSize}</td>
                               <td className="p-4 text-right"><Badge variant="outline" className="uppercase text-[8px]">{o.status}</Badge></td>
                             </tr>
                           ))}
                         </tbody>
                       </table>
                    </CardContent>
                 </Card>

                 <Card className="bg-card/40 border-border/50">
                    <CardHeader className="pb-2 flex flex-row items-center justify-between">
                      <CardTitle className="text-sm font-bold uppercase tracking-widest text-primary">Recent Users</CardTitle>
                      <Button variant="ghost" size="sm" className="text-[10px] uppercase font-bold h-7" onClick={() => setActiveTab('users')}>View All</Button>
                    </CardHeader>
                    <CardContent className="p-0">
                       <table className="w-full text-xs text-left">
                         <tbody className="divide-y divide-border/50">
                           {adminData.users.slice(0, 5).map((u: any) => (
                             <tr key={u.id} className="hover:bg-white/5">
                               <td className="p-4 font-bold text-white">{u.name}</td>
                               <td className="p-4 text-muted-foreground">{u.email}</td>
                               <td className="p-4 text-right text-[10px]">{u.joinDate ? format(new Date(u.joinDate), 'MMM d') : '—'}</td>
                             </tr>
                           ))}
                         </tbody>
                       </table>
                    </CardContent>
                 </Card>
              </div>
            </div>
          )}

          {activeTab === 'nodes' && (
            <Card className="bg-card/40 border-border/50">
              <CardContent className="p-0">
                <table className="w-full text-sm text-left">
                  <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-bold tracking-widest">
                    <tr>
                      <th className="p-4">Account ID</th>
                      <th className="p-4">User</th>
                      <th className="p-4">Balance</th>
                      <th className="p-4">Equity</th>
                      <th className="p-4">Status</th>
                      <th className="p-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {adminData.demoAccounts.map((a: any) => (
                      <tr key={a.id} className="hover:bg-primary/5">
                        <td className="p-4 font-mono text-xs">{a.id.slice(0, 8)}</td>
                        <td className="p-4 text-white font-bold">{a.userId.slice(0, 8)}...</td>
                        <td className="p-4 font-mono">${(a.balance || 0).toLocaleString()}</td>
                        <td className="p-4 font-mono text-primary">${(a.equity || 0).toLocaleString()}</td>
                        <td className="p-4"><Badge className={cn("uppercase text-[8px]", a.status === 'active' ? 'bg-emerald-500' : 'bg-destructive')}>{a.status}</Badge></td>
                        <td className="p-4 text-right">
                           <Button variant="ghost" size="icon" onClick={async () => {
                             if(confirm("Reset this account to starting balance?")) {
                               await resetDemoAccountAction(a.id);
                               refreshData();
                             }
                           }}><RotateCcw className="w-3.5 h-3.5" /></Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {activeTab === 'orders' && (
            <Card className="bg-card/40 border-border/50">
              <CardContent className="p-0">
                <table className="w-full text-sm text-left">
                  <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-bold tracking-widest">
                    <tr>
                      <th className="p-4">Order ID</th>
                      <th className="p-4">Trader / Plan</th>
                      <th className="p-4">Amount</th>
                      <th className="p-4">TX Hash</th>
                      <th className="p-4">Proof</th>
                      <th className="p-4">Status</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {adminData.orders.map((o: any) => (
                      <tr key={o.id} className={cn(
                        "hover:bg-primary/5 transition-colors group",
                        o.isCouponOrder && "border-l-4 border-l-primary bg-primary/5"
                      )}>
                        <td className="p-4 font-mono text-[10px] text-muted-foreground">{o.id.slice(0, 8)}</td>
                        <td className="p-4">
                          <p className="font-bold text-white">{o.email}</p>
                          <p className="text-[10px] text-primary">{o.plan} {o.accountSize}</p>
                        </td>
                        <td className="p-4">
                          {o.isCouponOrder || o.source === "gifted" || o.amount === "FREE" ? (
                            <Badge className="bg-emerald-500 text-white font-black text-[9px] uppercase">FREE</Badge>
                          ) : (
                            <span className="font-mono text-white font-bold">${o.amountPaid}</span>
                          )}
                        </td>
                        <td className="p-4">
                          {o.isCouponOrder || o.txHash === "ADMIN-GIFT" ? (
                            <Badge variant="outline" className="text-primary border-primary/30 font-mono text-[9px] uppercase">{o.txHash}</Badge>
                          ) : (
                            <span className="font-mono text-[10px] text-zinc-400 max-w-[100px] truncate">{o.txHash}</span>
                          )}
                        </td>
                        <td className="p-4">
                          {(o.isCouponOrder || !o.paymentScreenshot) ? (
                            <span className="text-zinc-600 text-xs">—</span>
                          ) : (
                            <button onClick={() => { setPreviewImage(o.paymentScreenshot); setIsImageModalOpen(true); }} className="text-primary hover:underline flex items-center gap-1 text-xs">
                              <ImageIcon className="w-3 h-3" /> View
                            </button>
                          )}
                        </td>
                        <td className="p-4">
                          <Badge className={cn("uppercase text-[8px]", o.status === 'approved' ? 'bg-emerald-500' : o.status === 'rejected' ? 'bg-destructive' : 'bg-amber-500')}>
                            {o.status}
                          </Badge>
                        </td>
                        <td className="p-4 text-right flex justify-end gap-2">
                          {o.status === 'pending' && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 font-bold border-primary/40 text-primary"
                                disabled={o.isVerifying}
                                onClick={async () => {
                                  setAdminData((prev: any) => ({
                                    ...prev,
                                    orders: prev.orders.map((ord: any) => ord.id === o.id ? { ...ord, isVerifying: true } : ord)
                                  }));
                                  try {
                                    const res = await fetch('/api/admin/verify-payment', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ txHash: o.txHash, network: o.network, amountPaid: o.amountPaid }),
                                    });
                                    const data = await res.json();
                                    alert(data.verified ? `✅ VERIFIED\n\n${data.reason}` : `❌ NOT VERIFIED\n\n${data.reason || data.error}`);
                                  } catch (err: any) {
                                    alert(`Verification request failed: ${err.message}`);
                                  } finally {
                                    setAdminData((prev: any) => ({
                                      ...prev,
                                      orders: prev.orders.map((ord: any) => ord.id === o.id ? { ...ord, isVerifying: false } : ord)
                                    }));
                                  }
                                }}
                              >
                                {o.isVerifying ? 'Checking...' : 'Verify On-Chain'}
                              </Button>
                              <Button size="sm" className="h-8 bg-emerald-600 font-bold" onClick={() => handleOrderAction(o.id, 'approved')}>Approve</Button>
                              <Button size="sm" variant="destructive" className="h-8 font-bold" onClick={() => setOrderRejectModal({ isOpen: true, id: o.id, reason: '' })}>Reject</Button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {activeTab === 'breaches' && (
            <Card className="bg-card/40 border-border/50">
              <CardContent className="p-0">
                <table className="w-full text-sm text-left">
                  <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-bold tracking-widest">
                    <tr>
                      <th className="p-4">Date</th>
                      <th className="p-4">Trader Email</th>
                      <th className="p-4">Plan / Phase</th>
                      <th className="p-4">Breach Type</th>
                      <th className="p-4">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {adminData.breaches.map((b: any) => (
                      <tr key={b.id} className="hover:bg-destructive/5">
                        <td className="p-4 text-xs text-muted-foreground">{b.breachedAt ? format(new Date(b.breachedAt.seconds * 1000), 'MMM d, HH:mm') : '—'}</td>
                        <td className="p-4 font-bold text-white">{b.email || b.userId}</td>
                        <td className="p-4 uppercase text-[10px]">{b.planType} / {b.phase}</td>
                        <td className="p-4"><Badge variant="destructive" className="uppercase text-[8px]">{b.type || 'hard'}</Badge></td>
                        <td className="p-4 text-xs text-muted-foreground max-w-xs">{b.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
          
          {/* ... Other Tabs (users, referrals, payouts, broadcasts, kyc) remain as they were in current user code ... */}
        </div>
      </main>

      {/* Friday Audit Modal */}
      <Dialog open={isFridayModalOpen} onOpenChange={setIsFridayModalOpen}>
        <DialogContent className="max-w-4xl bg-zinc-950 border-amber-500/30 text-white max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-500">
              <RotateCcw className="w-5 h-5" /> Friday Rule Restoration Tool
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              These accounts were liquidated due to the Friday overnight holding rule. You can restore them below.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-6">
            {fridayAudit && fridayAudit.length === 0 ? (
               <p className="text-center py-10 text-zinc-500 italic">No Friday rule breaches detected in the blown account pool.</p>
            ) : fridayAudit && (
              <div className="space-y-4">
                <div className="rounded-xl border border-white/5 bg-black/40 overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-white/5 text-muted-foreground uppercase text-[10px] font-bold">
                      <tr>
                        <th className="p-3">Trader Email</th>
                        <th className="p-3">Account ID</th>
                        <th className="p-3">Final Balance</th>
                        <th className="p-3">Breach Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fridayAudit.map((a) => (
                        <tr key={a.id} className="border-t border-white/5">
                          <td className="p-3 font-bold">{a.email}</td>
                          <td className="p-3 font-mono text-[10px]">{a.id}</td>
                          <td className="p-3 font-mono">${parseFloat(a.balance || 0).toLocaleString()}</td>
                          <td className="p-3 text-zinc-400">{format(new Date(a.breachedAt), 'MMM d, HH:mm')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex justify-end pt-4">
                  <Button className="bg-amber-600 hover:bg-amber-700 text-white font-black" onClick={handleFridayReset} disabled={actionLoading}>
                    {actionLoading ? <Loader2 className="animate-spin w-4 h-4 mr-2" /> : <RotateCcw className="w-4 h-4 mr-2" />}
                    RESTORE ALL {fridayAudit.length} ACCOUNTS
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Admin Auth Modal */}
      <Dialog open={showAdminModal} onOpenChange={setShowAdminModal}>
        <DialogContent className="bg-black/95 border-primary/30 text-white outline-none">
          <DialogHeader>
            <DialogTitle className="text-center font-headline text-2xl">Admin Authorization</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAdminAuth} className="space-y-6 pt-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs uppercase font-bold text-primary">Admin Email</Label>
                <Input type="email" value={adminEmailInput} onChange={(e) => setAdminEmailInput(e.target.value)} placeholder="Gmail address" className="bg-secondary/50" required />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase font-bold text-primary">Master Password</Label>
                <Input type="password" value={adminPasswordInput} onChange={(e) => setAdminPasswordInput(e.target.value)} placeholder="••••••••" className="h-14 text-center text-2xl font-mono" required />
              </div>
            </div>
            {adminError && <p className="text-center text-xs font-bold text-destructive animate-pulse">{adminError}</p>}
            <Button type="submit" className="w-full h-14 font-black cyan-box-glow text-lg">AUTHENTICATE</Button>
          </form>
        </DialogContent>
      </Dialog>
      
      {/* ... Other Modals remain as they were in current user code ... */}
    </div>
  );
}
