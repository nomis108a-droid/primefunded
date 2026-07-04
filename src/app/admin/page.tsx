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
  Users, Activity, Search, Loader2, DollarSign, ChevronLeft, Terminal, Database, ShieldCheck, Wand2, RefreshCw, BarChart2, Monitor, Clock, AlertOctagon, Trophy, CreditCard, Send, Fingerprint, Skull, Filter, ExternalLink, CheckCircle2, XCircle, Eye, Phone, Globe, Mail, User, AlertCircle, RotateCcw, Zap, Trash2, LogOut, Gift, Image as ImageIcon, Copy, ChevronRight
} from 'lucide-react';
import { updateOrderStatusAction, processKycAction, resetDemoAccountAction, sendGlobalBroadcastAction, fetchUserDetailAction, cleanupDemoAccountsAction, giftAccountAction } from './actions';
import { cn } from '@/lib/utils';
import { format, isValid } from 'date-fns';
import { getTradeDate } from '@/lib/tradeUtils';
import Link from 'next/link';
import Image from 'next/image';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, orderBy, limit, where } from 'firebase/firestore';
import { ADMIN_EMAILS } from '@/lib/admin';

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
  const { toast } = useToast();

  const [userDetail, setUserDetail] = useState<any>(null);
  const [isUserDetailModalOpen, setIsUserDetailModalOpen] = useState(false);
  const [userDetailLoading, setUserDetailLoading] = useState(false);

  const [isBroadcastModalOpen, setIsBroadcastModalOpen] = useState(false);
  const [broadcastForm, setBroadcastForm] = useState({ title: '', message: '', type: 'info' });

  const [isGiftModalOpen, setIsGiftModalOpen] = useState(false);
  const [giftForm, setGiftForm] = useState({ userId: '', label: '', amount: '100000', plan: '1-step-pro', phase: 'evaluation' });

  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);

  const tabsListRef = useRef<HTMLDivElement>(null);

  const refreshData = useCallback(async () => {
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
    } catch (err: any) {
      console.error("[Admin] Sync fault:", err);
      toast({ variant: "destructive", title: "Sync Error", description: err.message });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    const isVerified = localStorage.getItem('adminVerified') === 'true';
    const email = localStorage.getItem('adminEmail');
    if (isVerified && email) {
      setIsAuthenticated(true);
      setLoggedInAdmin(email);
      // Set persistence cookies to prevent "Unauthorized" error in Server Actions
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
    
    // Set explicit administrative cookies for Server Action validation
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

  const handleOrderAction = async (id: string, status: string) => {
    setActionLoading(true);
    try {
      const res = await updateOrderStatusAction(id, status);
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

  const handleKycAction = async (id: string, status: string) => {
    setActionLoading(true);
    try {
      const res = await processKycAction(id, status);
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
      const targetUser = adminData.users.find((u: any) => u.id === giftForm.userId);
      const email = targetUser?.email || 'provisioned@primefunded.fund';
      const res = await giftAccountAction(giftForm.userId, email, giftForm.label, parseInt(giftForm.amount), giftForm.plan, giftForm.phase);
      if (res.success) {
        toast({ title: "Account Provisioned Successfully" });
        setIsGiftModalOpen(false);
        refreshData();
      } else throw new Error(res.error);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Gifting Failed", description: err.message });
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
          <div className="flex justify-between items-start mb-6">
            <div>
              <div className="flex items-center gap-3 mb-1">
                 <h1 className="text-4xl font-headline font-bold text-white">Administrative Terminal</h1>
                 <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">{loggedInAdmin}</Badge>
              </div>
              <p className="text-muted-foreground text-sm">Institutional Node Control & Compliance Hub.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="h-10 px-4" asChild>
                <Link href="/admin/price-tracker"><Activity className="w-4 h-4 mr-2" /> Price Synchronizer</Link>
              </Button>
              <Button variant="outline" size="sm" className="h-10 px-4 border-destructive/20 text-destructive hover:bg-destructive/10" onClick={handleCleanup} disabled={actionLoading}>
                <Trash2 className="w-4 h-4 mr-2" /> Cleanup Environment
              </Button>
              <Button size="sm" className="h-10 px-6 font-bold bg-primary text-black hover:bg-primary/90" onClick={() => setIsGiftModalOpen(true)}>
                <Gift className="w-4 h-4 mr-2" /> Gift Account
              </Button>
              <Button variant="outline" size="sm" className="h-10 px-4" onClick={refreshData} disabled={isLoading}>
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
                      <tr key={o.id} className="hover:bg-primary/5">
                        <td className="p-4 font-mono text-[10px] text-muted-foreground">{o.id.slice(0, 8)}</td>
                        <td className="p-4">
                          <p className="font-bold text-white">{o.email}</p>
                          <p className="text-[10px] text-primary">{o.plan} {o.accountSize}</p>
                        </td>
                        <td className="p-4 font-mono">${o.amountPaid}</td>
                        <td className="p-4 font-mono text-[10px] max-w-[100px] truncate">{o.txHash}</td>
                        <td className="p-4">
                          {o.paymentScreenshot ? (
                            <button onClick={() => { setPreviewImage(o.paymentScreenshot); setIsImageModalOpen(true); }} className="text-primary hover:underline flex items-center gap-1 text-xs">
                              <ImageIcon className="w-3 h-3" /> View
                            </button>
                          ) : 'No Proof'}
                        </td>
                        <td className="p-4">
                          <Badge className={cn("uppercase text-[8px]", o.status === 'approved' ? 'bg-emerald-500' : o.status === 'rejected' ? 'bg-destructive' : 'bg-amber-500')}>
                            {o.status}
                          </Badge>
                        </td>
                        <td className="p-4 text-right flex justify-end gap-2">
                          {o.status === 'pending' && (
                            <>
                              <Button size="sm" className="h-8 bg-emerald-600 font-bold" onClick={() => handleOrderAction(o.id, 'approved')}>Approve</Button>
                              <Button size="sm" variant="destructive" className="h-8 font-bold" onClick={() => handleOrderAction(o.id, 'rejected')}>Reject</Button>
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

          {activeTab === 'kyc' && (
            <Card className="bg-card/40 border-border/50">
              <CardContent className="p-0">
                <table className="w-full text-sm text-left">
                  <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-bold tracking-widest">
                    <tr>
                      <th className="p-4">Trader Name</th>
                      <th className="p-4">Email</th>
                      <th className="p-4">Docs</th>
                      <th className="p-4">Status</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {kycApplications.map((u: any) => (
                      <tr key={u.id} className="hover:bg-primary/5">
                        <td className="p-4 font-bold text-white">{u.name}</td>
                        <td className="p-4 text-xs text-muted-foreground">{u.email}</td>
                        <td className="p-4 flex flex-col gap-1">
                          {u.idProofUrl && <button onClick={() => { setPreviewImage(u.idProofUrl); setIsImageModalOpen(true); }} className="text-xs text-primary hover:underline text-left">ID Proof</button>}
                          {u.addressProofUrl && <button onClick={() => { setPreviewImage(u.addressProofUrl); setIsImageModalOpen(true); }} className="text-xs text-primary hover:underline text-left">Address Proof</button>}
                        </td>
                        <td className="p-4">
                          <Badge variant="outline" className={cn("uppercase text-[8px]", u.kycStatus === 'verified' ? 'text-emerald-500 border-emerald-500' : u.kycStatus === 'rejected' ? 'text-destructive border-destructive' : 'text-amber-500 border-amber-500')}>
                            {u.kycStatus}
                          </Badge>
                        </td>
                        <td className="p-4 text-right flex justify-end gap-2">
                          {u.kycStatus === 'pending' && (
                            <>
                              <Button size="sm" className="h-8 bg-emerald-600 font-bold" onClick={() => handleKycAction(u.id, 'verified')}>Approve</Button>
                              <Button size="sm" variant="destructive" className="h-8 font-bold" onClick={() => handleKycAction(u.id, 'rejected')}>Reject</Button>
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

          {activeTab === 'referrals' && (
            <Card className="bg-card/40 border-border/50">
              <CardContent className="p-0">
                <table className="w-full text-sm text-left">
                  <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-bold tracking-widest">
                    <tr>
                      <th className="p-4">Referrer UID</th>
                      <th className="p-4">Referred User</th>
                      <th className="p-4">Commission</th>
                      <th className="p-4">Status</th>
                      <th className="p-4 text-right">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {adminData.referrals.map((r: any) => (
                      <tr key={r.id} className="hover:bg-primary/5">
                        <td className="p-4 font-mono text-xs text-primary">{r.referrerId}</td>
                        <td className="p-4 text-white font-bold">{r.referredUserEmail}</td>
                        <td className="p-4 font-mono text-emerald-500">${r.amount}</td>
                        <td className="p-4 uppercase text-[9px] font-black">{r.status}</td>
                        <td className="p-4 text-right text-xs text-muted-foreground">
                          {r.createdAt ? format(new Date(r.createdAt.seconds * 1000), 'MMM d, HH:mm') : '—'}
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

          {activeTab === 'payouts' && (
            <Card className="bg-card/40 border-border/50">
              <CardContent className="p-0">
                <table className="w-full text-sm text-left">
                  <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-bold tracking-widest">
                    <tr>
                      <th className="p-4">Trader</th>
                      <th className="p-4">Amount</th>
                      <th className="p-4">Method</th>
                      <th className="p-4">Address</th>
                      <th className="p-4">Status</th>
                      <th className="p-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {adminData.payouts.map((p: any) => (
                      <tr key={p.id} className="hover:bg-primary/5">
                        <td className="p-4 font-bold text-white">{p.email}</td>
                        <td className="p-4 font-mono text-emerald-500">${p.amount}</td>
                        <td className="p-4 text-xs">{p.method}</td>
                        <td className="p-4 font-mono text-[10px] truncate max-w-[150px]">{p.address}</td>
                        <td className="p-4"><Badge className="uppercase text-[8px]">{p.status}</Badge></td>
                        <td className="p-4 text-right">
                           <Button size="sm" className="h-8 bg-emerald-600">Done</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {activeTab === 'users' && (
            <div className="space-y-6">
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Search name, email, phone or trader ID..." className="pl-10 bg-secondary/30" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
              </div>
              <Card className="bg-card/40 border-border/50">
                <CardContent className="p-0">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-bold tracking-widest">
                      <tr>
                        <th className="p-4">TRADER ID</th>
                        <th className="p-4">Trader Name</th>
                        <th className="p-4">Email</th>
                        <th className="p-4">Phone</th>
                        <th className="p-4">Tier</th>
                        <th className="p-4">Joined</th>
                        <th className="p-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {filteredUsers.map((u: any) => (
                        <tr key={u.id} className="hover:bg-primary/5">
                          <td className="p-4 font-mono text-[11px] flex items-center gap-2">
                            {u.traderId || u.id.slice(0, 8)}
                            <button onClick={() => { navigator.clipboard.writeText(u.traderId || u.id); toast({ title: "ID Copied" }); }}><Copy className="w-3 h-3 text-muted-foreground hover:text-primary" /></button>
                          </td>
                          <td className="p-4 font-bold text-white">{u.name}</td>
                          <td className="p-4 text-muted-foreground">{u.email}</td>
                          <td className="p-4 text-muted-foreground text-xs">{u.phone || '—'}</td>
                          <td className="p-4"><Badge variant="outline">{u.tier || 'Bronze'}</Badge></td>
                          <td className="p-4 text-xs text-muted-foreground">{u.joinDate ? format(new Date(u.joinDate), 'MMM d, yyyy') : '—'}</td>
                          <td className="p-4 text-right">
                            <Button variant="ghost" size="sm" className="text-primary h-8" onClick={async () => {
                              setUserDetailLoading(true);
                              setIsUserDetailModalOpen(true);
                              const res = await fetchUserDetailAction(u.id);
                              if (res.success) setUserDetail(res);
                              setUserDetailLoading(false);
                            }}>Inspect Node</Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === 'broadcasts' && (
            <div className="space-y-6">
              <div className="flex justify-end">
                <Button className="bg-primary text-black font-bold" onClick={() => setIsBroadcastModalOpen(true)}><Send className="w-4 h-4 mr-2" /> New Broadcast</Button>
              </div>
              <Card className="bg-card/40 border-border/50">
                <CardContent className="p-0">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-bold tracking-widest">
                      <tr>
                        <th className="p-4">Title</th>
                        <th className="p-4">Type</th>
                        <th className="p-4">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {adminData.broadcasts.map((b: any) => (
                        <tr key={b.id} className="hover:bg-primary/5">
                          <td className="p-4 font-bold text-white">{b.title}</td>
                          <td className="p-4"><Badge variant="secondary" className="uppercase text-[8px]">{b.type}</Badge></td>
                          <td className="p-4 text-xs text-muted-foreground">{b.sentAt ? format(new Date(b.sentAt.seconds * 1000), 'MMM d, HH:mm') : 'Recently'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </div>
          )}
        </div>
      </main>

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

      {/* Gift Account Modal */}
      <Dialog open={isGiftModalOpen} onOpenChange={setIsGiftModalOpen}>
        <DialogContent className="bg-card border-primary/20 text-white">
          <DialogHeader>
            <DialogTitle>Provision Manual Node</DialogTitle>
            <DialogDescription>Manually gift a demo account to a user ID.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Target User UID</Label>
              <Input placeholder="Enter Firestore UID" value={giftForm.userId} onChange={e => setGiftForm({...giftForm, userId: e.target.value})} className="bg-secondary/50" />
            </div>
            <div className="space-y-2">
              <Label>Account Label</Label>
              <Input placeholder="e.g. Free $100k Challenge" value={giftForm.label} onChange={e => setGiftForm({...giftForm, label: e.target.value})} className="bg-secondary/50" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Balance</Label>
                <Select value={giftForm.amount} onValueChange={v => setGiftForm({...giftForm, amount: v})}>
                  <SelectTrigger className="bg-secondary/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10000">$10,000</SelectItem>
                    <SelectItem value="25000">$25,000</SelectItem>
                    <SelectItem value="50000">$50,000</SelectItem>
                    <SelectItem value="100000">$100,000</SelectItem>
                    <SelectItem value="200000">$200,000</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Plan Type</Label>
                <Select value={giftForm.plan} onValueChange={v => setGiftForm({...giftForm, plan: v})}>
                  <SelectTrigger className="bg-secondary/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1-step-pro">1-Step Pro</SelectItem>
                    <SelectItem value="2-step-classic">2-Step Classic</SelectItem>
                    <SelectItem value="3-step-classic">3-Step Classic</SelectItem>
                    <SelectItem value="instant-funding">Instant Funding</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsGiftModalOpen(false)}>Cancel</Button>
            <Button className="bg-primary text-black font-bold" onClick={handleGiftAccount} disabled={actionLoading}>
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Wand2 className="w-4 h-4 mr-2" />}
              Provision Node
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Broadcast Modal */}
      <Dialog open={isBroadcastModalOpen} onOpenChange={setIsBroadcastModalOpen}>
        <DialogContent className="bg-card border-primary/20 text-white">
          <DialogHeader>
            <DialogTitle>Send Global Broadcast</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Announcement Title</Label>
              <Input value={broadcastForm.title} onChange={e => setBroadcastForm({...broadcastForm, title: e.target.value})} className="bg-secondary/50" />
            </div>
            <div className="space-y-2">
              <Label>Message Content</Label>
              <Textarea value={broadcastForm.message} onChange={e => setBroadcastForm({...broadcastForm, message: e.target.value})} className="bg-secondary/50 min-h-[100px]" />
            </div>
            <div className="space-y-2">
              <Label>Notification Type</Label>
              <Select value={broadcastForm.type} onValueChange={v => setBroadcastForm({...broadcastForm, type: v})}>
                <SelectTrigger className="bg-secondary/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="info">General Info</SelectItem>
                  <SelectItem value="warning">Maintenance Warning</SelectItem>
                  <SelectItem value="success">Profit Payout Proof</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsBroadcastModalOpen(false)}>Cancel</Button>
            <Button className="bg-primary text-black font-bold" onClick={async () => {
              setActionLoading(true);
              await sendGlobalBroadcastAction(broadcastForm);
              setActionLoading(false);
              setIsBroadcastModalOpen(false);
              refreshData();
            }} disabled={actionLoading}>Send Announcement</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* User Detail Inspect Modal */}
      <Dialog open={isUserDetailModalOpen} onOpenChange={setIsUserDetailModalOpen}>
        <DialogContent className="max-w-4xl bg-zinc-950 border-zinc-800 text-white max-h-[85vh] overflow-y-auto">
          <DialogHeader className="mb-4">
            <DialogTitle className="text-3xl font-headline font-bold text-white">
              {userDetailLoading ? "Scanning Node..." : userDetail?.user?.name || "Trader Profile"}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {userDetail?.user?.email || "Detailed institutional node activity logs."}
            </DialogDescription>
          </DialogHeader>

          {userDetailLoading ? (
             <div className="py-20 flex flex-col items-center justify-center gap-4">
               <Loader2 className="w-8 h-8 animate-spin text-primary" />
               <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Deep Scanning Node Data...</p>
             </div>
          ) : userDetail && (
            <div className="space-y-8">
              <div className="flex justify-between items-start">
                <Badge className="bg-primary text-black text-[10px] font-black uppercase px-4 py-1.5">{userDetail.user.tier} TRADER</Badge>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-secondary/30 border border-border">
                  <p className="text-[10px] font-black uppercase text-muted-foreground mb-1">KYC Status</p>
                  <p className="text-lg font-bold text-white">{userDetail.user.kycStatus || 'None'}</p>
                </div>
                <div className="p-4 rounded-xl bg-secondary/30 border border-border">
                  <p className="text-[10px] font-black uppercase text-muted-foreground mb-1">Referral Code</p>
                  <p className="text-lg font-bold text-primary font-mono">{userDetail.user.referralCode}</p>
                </div>
                <div className="p-4 rounded-xl bg-secondary/30 border border-border">
                  <p className="text-[10px] font-black uppercase text-muted-foreground mb-1">Total Payouts</p>
                  <p className="text-lg font-bold text-emerald-500">${userDetail.payouts.reduce((a:any, c:any)=>a+parseFloat(c.amount||0),0).toLocaleString()}</p>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-primary border-b border-primary/20 pb-2">Trading Nodes</h3>
                <div className="grid grid-cols-1 gap-3">
                   {userDetail.accounts.map((a: any) => (
                     <div key={a.id} className="p-4 rounded-xl bg-white/5 border border-white/5 flex justify-between items-center group hover:border-primary/30 transition-colors">
                        <div>
                          <p className="font-bold text-white">{a.label}</p>
                          <p className="text-[10px] font-mono text-muted-foreground">ID: {a.id}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono text-sm font-bold">${(a.balance || 0).toLocaleString()}</p>
                          <Badge variant="outline" className="text-[8px] uppercase">{a.status}</Badge>
                        </div>
                     </div>
                   ))}
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-primary border-b border-primary/20 pb-2">Recent Node Logs</h3>
                <div className="overflow-x-auto rounded-xl border border-white/5 bg-black/40">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-white/5 text-muted-foreground uppercase text-[10px] font-bold">
                      <tr>
                        <th className="p-3">Symbol</th>
                        <th className="p-3">Type</th>
                        <th className="p-3">Lots</th>
                        <th className="p-3 text-right">PnL</th>
                        <th className="p-3">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {userDetail.trades.slice(0, 10).map((t: any) => (
                        <tr key={t.id} className="border-t border-white/5">
                          <td className="p-3 font-bold">{t.symbol}</td>
                          <td className="p-3 uppercase">{t.type}</td>
                          <td className="p-3">{t.lots}</td>
                          <td className={cn("p-3 text-right font-mono font-bold", (t.pnl||0) >= 0 ? "text-emerald-500" : "text-destructive")}>${(t.pnl||0).toLocaleString()}</td>
                          <td className="p-3 text-muted-foreground">{t.openedAt ? format(new Date(t.openedAt), 'MMM d') : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Image Preview Modal */}
      <Dialog open={isImageModalOpen} onOpenChange={setIsImageModalOpen}>
        <DialogContent className="max-w-4xl bg-black/95 border-border overflow-hidden p-0">
          <DialogHeader className="p-4 bg-zinc-900 border-b border-white/5">
            <DialogTitle className="text-white font-headline text-lg">Document Verification Preview</DialogTitle>
          </DialogHeader>
          <div className="relative aspect-video w-full">
            {previewImage && <Image src={previewImage} alt="Preview" fill className="object-contain" />}
          </div>
          <div className="flex justify-center gap-4 p-6 bg-zinc-900/50">
            <Button variant="outline" className="font-bold text-white border-white/10" onClick={() => window.open(previewImage!, '_blank')}>
              <ExternalLink className="mr-2 w-4 h-4" /> Open in New Tab
            </Button>
            <Button variant="secondary" className="font-bold" onClick={() => setIsImageModalOpen(false)}>Close Preview</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
