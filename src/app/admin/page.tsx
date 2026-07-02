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
import { Textarea } from '@/components/ui/textarea';
import { 
  Users, Activity, Search, Loader2, DollarSign, ChevronLeft, Terminal, Database, ShieldCheck, Wand2, RefreshCw, BarChart2, Monitor, Clock, AlertOctagon, Trophy, CreditCard, Send, Fingerprint, Skull, Filter, ExternalLink, CheckCircle2, XCircle, Eye, Phone, Globe, Mail, User, AlertCircle, RotateCcw, Zap, Trash2, LogOut, Gift
} from 'lucide-react';
import { advanceTraderPhaseAction, updateOrderStatusAction, updatePayoutStatusAction, processKycAction, resetDemoAccountAction, fetchDemoTradesByAccount, sendGlobalBroadcastAction, fetchUserDetailAction, cleanupDemoAccountsAction, giftAccountAction } from './actions';
import { cn } from '@/lib/utils';
import { format, isValid } from 'date-fns';
import { getTradeDate } from '@/lib/tradeUtils';
import Link from 'next/link';
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

const GIFT_OPTIONS = [
  { id: '10k_eval', label: "Step 1 — $10,000 Challenge", balance: 10000, plan: "1-step-pro", phase: "evaluation" },
  { id: '25k_eval', label: "Step 1 — $25,000 Challenge", balance: 25000, plan: "1-step-pro", phase: "evaluation" },
  { id: '50k_eval', label: "Step 1 — $50,000 Challenge", balance: 50000, plan: "1-step-pro", phase: "evaluation" },
  { id: '10k_instant', label: "Instant Funded — $10,000", balance: 10000, plan: "instant-funding", phase: "funded" },
  { id: '25k_instant', label: "Instant Funded — $25,000", balance: 25000, plan: "instant-funding", phase: "funded" },
  { id: '10k_funded', label: "Funded — $10,000", balance: 10000, plan: "1-step-pro", phase: "funded" },
  { id: '25k_funded', label: "Funded — $25,000", balance: 25000, plan: "1-step-pro", phase: "funded" },
];

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
  const [showRetry, setShowRetry] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const { toast } = useToast();

  const [selectedDemoAccount, setSelectedDemoAccount] = useState<any>(null);
  const [demoFilter, setDemoFilter] = useState<'all' | 'active' | 'blown' | 'passed'>('all');

  const [userDetail, setUserDetail] = useState<any>(null);
  const [isUserDetailModalOpen, setIsUserDetailModalOpen] = useState(false);
  const [userDetailLoading, setUserDetailLoading] = useState(false);

  // Broadcast Modal State
  const [isBroadcastModalOpen, setIsBroadcastModalOpen] = useState(false);
  const [broadcastForm, setBroadcastForm] = useState({ title: '', message: '', type: 'info' });

  // Gift Modal State
  const [isGiftModalOpen, setIsGiftModalOpen] = useState(false);
  const [giftForm, setGiftForm] = useState({ userId: '', optionId: '' });
  const [userSearch, setUserSearch] = useState('');

  /**
   * CLIENT-SIDE REFRESH ENGINE
   * Fetches data directly from Firestore using browser credentials to bypass server-side Admin SDK bottlenecks.
   */
  const refreshData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [usersSnap, accountsSnap, tradesSnap, ordersSnap, payoutsSnap, referralsSnap, broadcastsSnap, breachesSnap] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'demoAccounts')),
        getDocs(query(collection(db, 'demoTrades'), limit(200))),
        getDocs(collection(db, 'orders')),
        getDocs(collection(db, 'payouts')),
        getDocs(collection(db, 'referrals')),
        getDocs(collection(db, 'broadcasts')),
        getDocs(collection(db, 'breaches')),
      ]);
      
      setAdminData({
        users: usersSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        demoAccounts: accountsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        demoTrades: tradesSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        orders: ordersSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        payouts: payoutsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        referrals: referralsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        broadcasts: broadcastsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        breaches: breachesSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      });
    } catch (err: any) {
      console.error("[Admin] Sync fault:", err);
      toast({ 
        variant: "destructive", 
        title: "Sync Error", 
        description: err.code === 'permission-denied' 
          ? "Permission Denied: Please ensure you are logged in with an authorized admin email." 
          : err.message 
      });
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
      setShowAdminModal(false);
      refreshData();
    } else {
      setShowAdminModal(true);
      setIsLoading(false);
    }
    const retryTimer = setTimeout(() => setShowRetry(true), 5000);
    return () => clearTimeout(retryTimer);
  }, [refreshData]);

  const handleAdminAuth = (e: React.FormEvent) => {
    e.preventDefault();
    const MASTER_PASSWORD = '93463962569392846256';
    
    const isEmailAuthorized = ADMIN_EMAILS.map(e => e.toLowerCase()).includes(adminEmailInput.toLowerCase());
    const isPasswordCorrect = adminPasswordInput === MASTER_PASSWORD;

    if (!isEmailAuthorized) {
      setAdminError('❌ Unauthorized email address');
      return;
    }
    if (!isPasswordCorrect) {
      setAdminError('❌ Invalid master password');
      return;
    }

    // Both correct — grant access
    localStorage.setItem('adminVerified', 'true');
    localStorage.setItem('adminEmail', adminEmailInput.toLowerCase());
    document.cookie = 'admin_master=93463962569392846256; path=/; max-age=86400';
    setAdminError('');
    
    setIsAuthenticated(true);
    setLoggedInAdmin(adminEmailInput.toLowerCase());
    setShowAdminModal(false);
    
    refreshData();
  };

  const handleEmergencyReset = () => {
    localStorage.removeItem('adminVerified');
    localStorage.removeItem('adminEmail');
    document.cookie = 'admin_master=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    window.location.reload();
  };

  const handleCleanupData = async () => {
    if (!confirm("CRITICAL: This will permanently delete ALL demo accounts and test trades. Are you sure?")) return;
    setActionLoading(true);
    try {
      const res = await cleanupDemoAccountsAction();
      if (res.success) {
        toast({ title: "Cleanup Successful", description: `Removed ${res.count} records.` });
        refreshData();
      } else throw new Error(res.error);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleGiftAccount = async () => {
    if (!giftForm.userId || !giftForm.optionId) {
      toast({ variant: "destructive", title: "Missing Data", description: "Please select a user and an account type." });
      return;
    }
    const option = GIFT_OPTIONS.find(o => o.id === giftForm.optionId);
    if (!option) return;

    setActionLoading(true);
    try {
      const res = await giftAccountAction(
        giftForm.userId,
        option.label,
        option.balance,
        option.plan,
        option.phase
      );
      if (res.success) {
        toast({ title: "Account Granted", description: "The node has been provisioned successfully." });
        setIsGiftModalOpen(false);
        setGiftForm({ userId: '', optionId: '' });
        refreshData();
      } else throw new Error(res.error);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Gifting Failed", description: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleSendBroadcast = async () => {
    setActionLoading(true);
    try {
      const res = await sendGlobalBroadcastAction(broadcastForm);
      if (res.success) {
        toast({ title: "Broadcast Sent", description: "The platform announcement has been dispatched." });
        setIsBroadcastModalOpen(false);
        setBroadcastForm({ title: '', message: '', type: 'info' });
        refreshData();
      } else throw new Error(res.error);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Broadcast Failed", description: err.message });
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
        (acc.userId && acc.userId.toLowerCase().includes(searchTerm.toLowerCase())) ||
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

  const sortedBroadcasts = useMemo(() => {
    if (!adminData.broadcasts) return [];
    return [...adminData.broadcasts].sort((a, b) => {
      const dateA = getTradeDate(a.sentAt);
      const dateB = getTradeDate(b.sentAt);
      return (dateB?.getTime() || 0) - (dateA?.getTime() || 0);
    });
  }, [adminData.broadcasts]);

  const sortedBreaches = useMemo(() => {
    if (!adminData.breaches) return [];
    return [...adminData.breaches].sort((a, b) => {
      const dateA = getTradeDate(a.breachedAt || a.createdAt || a.date);
      const dateB = getTradeDate(b.breachedAt || b.createdAt || b.date);
      return (dateB?.getTime() || 0) - (dateA?.getTime() || 0);
    });
  }, [adminData.breaches]);

  const handleViewUserDetail = async (userId: string) => {
    setUserDetailLoading(true);
    setIsUserDetailModalOpen(true);
    try {
      const res = await fetchUserDetailAction(userId);
      if (res.success) {
        setUserDetail(res);
      } else throw new Error(res.error);
    } catch (err: any) {
      const msg = err.message || "";
      if (msg.includes("Server Action") || msg.includes("not found on the server")) {
        toast({ title: "App was updated — refreshing..." });
        setTimeout(() => window.location.reload(), 1000);
      } else {
        toast({ variant: "destructive", title: "Fetch Failed", description: msg });
        setIsUserDetailModalOpen(false);
      }
    } finally {
      setUserDetailLoading(false);
    }
  };

  if (!isAuthenticated && !showAdminModal) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-6" />
        <h2 className="text-xl font-headline font-bold text-white mb-2">Verifying Terminal Auth</h2>
        {showRetry && (
          <Button variant="outline" size="sm" onClick={handleEmergencyReset} className="h-10 px-6 mt-4">
            <RotateCcw className="w-4 h-4 mr-2" /> Clear Session & Retry
          </Button>
        )}
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
            <div className="flex items-center gap-4">
              {loggedInAdmin && (
                <div className="flex flex-col items-end">
                   <p className="text-[10px] font-black uppercase text-primary tracking-widest">Logged in as:</p>
                   <p className="text-sm font-bold text-white">{loggedInAdmin}</p>
                </div>
              )}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" asChild className="border-primary/20 text-primary">
                  <Link href="/admin/price-tracker"><Zap className="w-4 h-4 mr-2" /> Price Synchronizer</Link>
                </Button>
                <Button variant="outline" size="sm" onClick={handleCleanupData} disabled={actionLoading} className="border-destructive/20 text-destructive hover:bg-destructive/5">
                  <Trash2 className="w-4 h-4 mr-2" /> Cleanup Environment
                </Button>
                <Button variant="outline" size="sm" onClick={() => setIsGiftModalOpen(true)} className="border-accent/20 text-accent hover:bg-accent/5">
                  <Gift className="w-4 h-4 mr-2" /> Gift Account
                </Button>
                <Button variant="outline" size="sm" onClick={refreshData} disabled={isLoading}>
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                  Sync Network
                </Button>
                <Button variant="ghost" size="sm" onClick={handleEmergencyReset} className="text-muted-foreground hover:text-white">
                  <LogOut className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
          
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="overflow-x-auto no-scrollbar pb-2">
              <TabsList className="bg-secondary/50 h-11 p-1 rounded-xl w-max flex">
                <TabsTrigger value="overview" className="px-6 font-bold whitespace-nowrap">Overview</TabsTrigger>
                <TabsTrigger value="demo_nodes" className="px-6 font-bold whitespace-nowrap">Trading Nodes</TabsTrigger>
                <TabsTrigger value="passers" className="px-6 font-bold whitespace-nowrap">Phase Passers</TabsTrigger>
                <TabsTrigger value="orders" className="px-6 font-bold whitespace-nowrap">Order Review</TabsTrigger>
                <TabsTrigger value="payouts" className="px-6 font-bold whitespace-nowrap">Payout Hub</TabsTrigger>
                <TabsTrigger value="users" className="px-6 font-bold whitespace-nowrap">User Directory</TabsTrigger>
                <TabsTrigger value="referrals" className="px-6 font-bold whitespace-nowrap">Referral Audit</TabsTrigger>
                <TabsTrigger value="broadcasts" className="px-6 font-bold whitespace-nowrap">Broadcasts</TabsTrigger>
                <TabsTrigger value="kyc" className="px-6 font-bold whitespace-nowrap">KYC Hub</TabsTrigger>
                <TabsTrigger value="breaches" className="px-6 font-bold whitespace-nowrap">Breaches</TabsTrigger>
              </TabsList>
            </div>
          </Tabs>
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
                    {adminData.orders.slice(0, 5).map((o: any) => {
                      const orderDate = getTradeDate(o.submittedAt || o.date);
                      return (
                        <div key={o.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/20 border border-white/5">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary"><CreditCard className="w-4 h-4" /></div>
                            <div>
                              <p className="text-xs font-bold text-white">{o.plan} {o.accountSize}</p>
                              <p className="text-[10px] text-muted-foreground">{o.email}</p>
                            </div>
                          </div>
                          <div className="text-right">
                             <Badge variant="outline" className="text-[9px] uppercase mb-1">{o.status}</Badge>
                             <p className="text-[8px] text-muted-foreground">{orderDate && isValid(orderDate) ? format(orderDate, 'MMM d') : ''}</p>
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
                <Card className="bg-card/40 border-border/50">
                  <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Users className="w-5 h-5 text-primary" /> New Traders</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    {adminData.users.slice(0, 5).map((u: any) => {
                      const joinDate = getTradeDate(u.joinDate || u.createdAt);
                      return (
                        <div key={u.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/20 border border-white/5">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500"><Users className="w-4 h-4" /></div>
                            <div>
                              <p className="text-xs font-bold text-white">{u.name}</p>
                              <p className="text-[10px] text-muted-foreground">{u.email}</p>
                            </div>
                          </div>
                          <p className="text-[10px] text-muted-foreground">{joinDate && isValid(joinDate) ? format(joinDate, 'MMM d') : 'New'}</p>
                        </div>
                      );
                    })}
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
                        <tr>
                          <th className="p-4">Trader / Node ID</th>
                          <th className="p-4">Balance</th>
                          <th className="p-4">Status</th>
                          <th className="p-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {filteredDemoAccounts.map((acc: any) => (
                          <tr key={acc.id} className="hover:bg-primary/5">
                            <td className="p-4">
                               <p className="font-mono text-xs text-primary font-bold">{acc.userId?.slice(0, 10)}...</p>
                               <p className="text-[10px] text-muted-foreground font-mono">{acc.id}</p>
                            </td>
                            <td className="p-4 font-bold text-white">${(acc.balance || 0).toLocaleString()}</td>
                            <td className="p-4">
                               <div className="flex flex-col gap-1">
                                 <Badge 
                                   variant={acc.status === 'blown' ? 'destructive' : acc.status === 'passed' ? 'default' : 'secondary'}
                                   className={cn(
                                     "uppercase text-[9px] font-black w-fit px-2",
                                     acc.status === 'passed' && "bg-emerald-500 hover:bg-emerald-600 text-white border-none"
                                   )}
                                 >
                                   {acc.status}
                                 </Badge>
                                 {acc.status === 'blown' && (
                                   <p className="text-[10px] text-destructive/80 font-medium italic">
                                     Reason: {acc.breachReason || 'Not recorded'}
                                   </p>
                                 )}
                               </div>
                            </td>
                            <td className="p-4 text-right">
                               <button 
                                 className="p-2 hover:bg-white/5 rounded-lg text-zinc-400 hover:text-white transition-colors cursor-pointer"
                                 onClick={() => handleViewUserDetail(acc.userId)}
                               >
                                 <Eye className="w-4 h-4" />
                               </button>
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

          {activeTab === 'users' && (
            <div className="space-y-6">
              <div className="relative w-full max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Search name, email, or UID..." className="pl-10 h-10 bg-secondary/50 border-white/5" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
              </div>
              <Card className="bg-card/40 border-border/50">
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-bold tracking-widest">
                        <tr><th className="p-4">Trader Details</th><th className="p-4">Plan Status</th><th className="p-4">Joined</th><th className="p-4 text-right">Actions</th></tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {filteredUsers.map((u: any) => (
                          <tr key={u.id} className="hover:bg-primary/5">
                            <td className="p-4">
                               <p className="font-bold text-white">{u.name}</p>
                               <p className="text-xs text-muted-foreground">{u.email}</p>
                               <p className="text-[9px] font-mono text-primary uppercase mt-1">UID: {u.uid}</p>
                            </td>
                            <td className="p-4">
                               <Badge variant="outline" className="uppercase text-[9px] font-black">{u.tier || 'Bronze'}</Badge>
                               <p className="text-[10px] text-muted-foreground mt-1">{u.accountStatus || 'No Account'}</p>
                            </td>
                            <td className="p-4 text-xs text-muted-foreground">{u.joinDate ? format(new Date(u.joinDate), 'MMM d, yyyy') : 'N/A'}</td>
                            <td className="p-4 text-right">
                               <Button variant="ghost" size="sm" onClick={() => handleViewUserDetail(u.id)}><Eye className="w-3.5 h-3.5" /></Button>
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

          {activeTab === 'broadcasts' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-headline font-bold text-white">System Broadcasts</h2>
                <Button className="font-bold rounded-xl" onClick={() => setIsBroadcastModalOpen(true)}>
                  <Send className="w-4 h-4 mr-2" /> New Broadcast
                </Button>
              </div>
              <Card className="bg-card/40 border-border/50">
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-bold tracking-widest">
                        <tr>
                          <th className="p-4">Title</th>
                          <th className="p-4">Message</th>
                          <th className="p-4">Type</th>
                          <th className="p-4 text-right">Sent Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {sortedBroadcasts.map((b: any) => {
                          const date = getTradeDate(b.sentAt);
                          return (
                            <tr key={b.id} className="hover:bg-primary/5">
                              <td className="p-4 font-bold text-white">{b.title}</td>
                              <td className="p-4 text-muted-foreground max-w-xs truncate">
                                {b.message?.length > 60 ? `${b.message.substring(0, 60)}...` : b.message}
                              </td>
                              <td className="p-4">
                                <Badge variant="outline" className={cn(
                                  "uppercase text-[9px] font-black",
                                  b.type === 'warning' ? "border-amber-500/50 text-amber-500" :
                                  b.type === 'success' ? "border-emerald-500/50 text-emerald-500" :
                                  "border-primary/50 text-primary"
                                )}>
                                  {b.type || 'info'}
                                </Badge>
                              </td>
                              <td className="p-4 text-right text-xs text-muted-foreground">
                                {date && isValid(date) ? format(date, 'MMM d, HH:mm') : '—'}
                              </td>
                            </tr>
                          );
                        })}
                        {sortedBroadcasts.length === 0 && (
                          <tr><td colSpan={4} className="p-20 text-center text-muted-foreground italic">No broadcasts sent yet.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === 'breaches' && (
            <div className="space-y-6">
              <h2 className="text-xl font-headline font-bold text-white">Risk Breach Log</h2>
              <Card className="bg-card/40 border-border/50">
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-bold tracking-widest">
                        <tr>
                          <th className="p-4">User / Account ID</th>
                          <th className="p-4">Reason</th>
                          <th className="p-4">Rule Violated</th>
                          <th className="p-4 text-right">Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {sortedBreaches.map((br: any) => {
                          const date = getTradeDate(br.breachedAt || br.createdAt || br.date);
                          return (
                            <tr key={br.id} className="hover:bg-destructive/5">
                              <td className="p-4">
                                <p className="font-mono text-xs text-destructive font-bold">{br.userId?.slice(0, 8)}...</p>
                                <p className="text-[10px] text-muted-foreground font-mono">{br.accountId}</p>
                              </td>
                              <td className="p-4">
                                <span className="text-white font-medium">{br.breachReason || br.reason || 'Manual Termination'}</span>
                              </td>
                              <td className="p-4">
                                <Badge variant="destructive" className="uppercase text-[9px] font-black">
                                  {br.planType || br.type || 'HARD BREACH'}
                                </Badge>
                              </td>
                              <td className="p-4 text-right text-xs text-muted-foreground">
                                {date && isValid(date) ? format(date, 'MMM d, HH:mm') : '—'}
                              </td>
                            </tr>
                          );
                        })}
                        {sortedBreaches.length === 0 && (
                          <tr>
                            <td colSpan={4} className="p-20 text-center flex flex-col items-center justify-center space-y-4">
                              <ShieldCheck className="w-12 h-12 text-muted-foreground opacity-20" />
                              <p className="text-muted-foreground italic">No breaches recorded.</p>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </main>

      <Dialog open={showAdminModal} onOpenChange={setShowAdminModal}>
        <DialogContent className="bg-black/95 border-primary/30 text-white outline-none">
          <DialogHeader>
            <DialogTitle className="text-center font-headline text-2xl">System Authorization</DialogTitle>
            <DialogDescription className="text-center text-xs text-muted-foreground">
              Dual-factor administrative access required.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAdminAuth} className="space-y-6 pt-4">
            <div className="space-y-4">
               <div className="space-y-2">
                 <Label className="text-xs uppercase font-bold tracking-widest text-primary">Admin Email</Label>
                 <Input 
                   type="email" 
                   value={adminEmailInput} 
                   onChange={(e) => setAdminEmailInput(e.target.value)} 
                   placeholder="Enter your Gmail address" 
                   className="h-12 bg-secondary/50 border-white/5" 
                   required
                 />
               </div>
               <div className="space-y-2">
                 <Label className="text-xs uppercase font-bold tracking-widest text-primary">Master Password</Label>
                 <Input 
                   type="password" 
                   value={adminPasswordInput} 
                   onChange={(e) => setAdminPasswordInput(e.target.value)} 
                   placeholder="••••••••" 
                   className="h-14 text-center text-2xl font-mono" 
                   required
                 />
               </div>
            </div>
            {adminError && <p className="text-center text-xs font-bold text-destructive animate-pulse">{adminError}</p>}
            <Button type="submit" className="w-full h-14 font-black cyan-box-glow text-lg">AUTHENTICATE</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isBroadcastModalOpen} onOpenChange={setIsBroadcastModalOpen}>
        <DialogContent className="bg-zinc-950 border-white/10 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-2xl font-headline">New Global Broadcast</DialogTitle>
            <DialogDescription>Send a notification to all registered traders on the platform.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Broadcast Title</Label>
              <Input 
                placeholder="e.g. Scheduled Maintenance" 
                value={broadcastForm.title} 
                onChange={e => setBroadcastForm({...broadcastForm, title: e.target.value})} 
                className="bg-secondary/50"
              />
            </div>
            <div className="space-y-2">
              <Label>Message Body</Label>
              <Textarea 
                placeholder="Details of the announcement..." 
                value={broadcastForm.message} 
                onChange={e => setBroadcastForm({...broadcastForm, message: e.target.value})}
                className="bg-secondary/50 min-h-[120px]"
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={broadcastForm.type} onValueChange={v => setBroadcastForm({...broadcastForm, type: v})}>
                <SelectTrigger className="bg-secondary/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="info">Information (Blue)</SelectItem>
                  <SelectItem value="warning">Warning (Amber)</SelectItem>
                  <SelectItem value="success">Success (Emerald)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsBroadcastModalOpen(false)}>Cancel</Button>
            <Button className="font-bold cyan-box-glow px-8" onClick={handleSendBroadcast} disabled={actionLoading || !broadcastForm.title || !broadcastForm.message}>
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
              Send Broadcast
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isGiftModalOpen} onOpenChange={setIsGiftModalOpen}>
        <DialogContent className="bg-zinc-950 border-white/10 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-2xl font-headline">Gift Account</DialogTitle>
            <DialogDescription>Provision an institutional trading node directly to a user's terminal.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Search & Select User</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input 
                  placeholder="Search by name or email..." 
                  value={userSearch} 
                  onChange={e => setUserSearch(e.target.value)}
                  className="bg-secondary/50 pl-10"
                />
              </div>
              <div className="max-h-40 overflow-y-auto border border-white/5 rounded-lg bg-secondary/20 mt-2 custom-scrollbar">
                {adminData.users.filter((u: any) => 
                  !userSearch || u.name?.toLowerCase().includes(userSearch.toLowerCase()) || u.email?.toLowerCase().includes(userSearch.toLowerCase())
                ).map((u: any) => (
                  <button 
                    key={u.id} 
                    onClick={() => setGiftForm({...giftForm, userId: u.id})}
                    className={cn(
                      "w-full text-left px-4 py-2 text-xs hover:bg-white/5 transition-colors border-b border-white/5 last:border-none",
                      giftForm.userId === u.id && "bg-primary/10 text-primary font-bold"
                    )}
                  >
                    <p className="font-bold">{u.name}</p>
                    <p className="text-[10px] opacity-50">{u.email}</p>
                  </button>
                ))}
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Account Type</Label>
              <Select value={giftForm.optionId} onValueChange={v => setGiftForm({...giftForm, optionId: v})}>
                <SelectTrigger className="bg-secondary/50">
                  <SelectValue placeholder="Select plan type..." />
                </SelectTrigger>
                <SelectContent>
                  {GIFT_OPTIONS.map(opt => (
                    <SelectItem key={opt.id} value={opt.id}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsGiftModalOpen(false)}>Cancel</Button>
            <Button 
              className="font-black bg-primary text-black px-8" 
              onClick={handleGiftAccount} 
              disabled={actionLoading || !giftForm.userId || !giftForm.optionId}
            >
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Gift className="w-4 h-4 mr-2" />}
              Grant Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isUserDetailModalOpen} onOpenChange={setIsUserDetailModalOpen}>
        <DialogContent className="max-w-5xl bg-zinc-950 border-white/5 text-white h-[90vh] flex flex-col p-0 overflow-hidden">
          {userDetailLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center p-20">
              <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
            </div>
          ) : userDetail && (
            <>
              <div className="p-8 border-b border-white/5 bg-secondary/10">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-3xl font-headline font-bold mb-1">{userDetail.user.name}</h2>
                    <p className="text-sm text-muted-foreground">{userDetail.user.email}</p>
                  </div>
                  <Badge className="bg-primary text-black font-black uppercase text-[10px] tracking-widest">{userDetail.user.tier} TIER</Badge>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                <Tabs defaultValue="nodes">
                  <TabsList className="bg-secondary/40 border border-white/5 mb-8">
                    <TabsTrigger value="nodes" className="font-bold">Nodes ({userDetail.accounts.length})</TabsTrigger>
                    <TabsTrigger value="ledger" className="font-bold">Execution Ledger ({userDetail.trades.length})</TabsTrigger>
                    <TabsTrigger value="stats" className="font-bold">Performance</TabsTrigger>
                  </TabsList>
                  <TabsContent value="nodes">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {userDetail.accounts.map((acc: any) => (
                        <Card key={acc.id} className="bg-card/40 border-border/50">
                          <CardHeader className="pb-4">
                            <CardTitle className="text-lg">
                              <div className="flex justify-between items-start">
                                <span className="flex-1">{acc.label}</span>
                                <div className="flex flex-col items-end gap-1">
                                  <Badge 
                                    variant={acc.status === 'blown' ? 'destructive' : acc.status === 'passed' ? 'default' : 'secondary'}
                                    className={cn(
                                      "text-[8px] uppercase font-black px-2",
                                      acc.status === 'passed' && "bg-emerald-500 text-white"
                                    )}
                                  >
                                    {acc.status}
                                  </Badge>
                                  {acc.status === 'blown' && (
                                    <span className="text-[9px] text-destructive font-medium italic">
                                      Reason: {acc.breachReason || 'Not recorded'}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                             <div className="grid grid-cols-2 gap-4">
                               <div>
                                 <p className="text-[10px] text-muted-foreground uppercase font-bold">Balance</p>
                                 <p className="font-bold font-mono">${(acc.balance || 0).toLocaleString()}</p>
                               </div>
                               <div>
                                 <p className="text-[10px] text-muted-foreground uppercase font-bold">Equity</p>
                                 <p className="font-bold font-mono text-primary">${(acc.equity || 0).toLocaleString()}</p>
                               </div>
                             </div>
                             <Button variant="outline" size="sm" className="w-full mt-6 h-10 font-bold border-primary/20 text-primary" onClick={() => resetDemoAccountAction(acc.id).then(() => handleViewUserDetail(userDetail.user.id))}>
                               <RotateCcw className="w-3.5 h-3.5 mr-2" /> Reset Node
                             </Button>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </TabsContent>
                  <TabsContent value="ledger">
                    <Card className="bg-card/40 border-border/50">
                      <CardContent className="p-0">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-secondary/30 text-muted-foreground uppercase text-[9px] font-bold tracking-widest">
                            <tr><th className="p-4">Symbol</th><th className="p-4">Type</th><th className="p-4">Lots</th><th className="p-4 text-right">P&L</th></tr>
                          </thead>
                          <tbody className="divide-y divide-border/50">
                            {userDetail.trades.map((t: any) => (
                              <tr key={t.id} className="hover:bg-white/5">
                                <td className="p-4 font-bold text-white">{t.symbol}</td>
                                <td className="p-4 uppercase">{t.type}</td>
                                <td className="p-4 font-mono">{t.lots}</td>
                                <td className={cn("p-4 text-right font-bold", t.pnl >= 0 ? "text-emerald-500" : "text-destructive")}>${(t.pnl || 0).toLocaleString()}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
