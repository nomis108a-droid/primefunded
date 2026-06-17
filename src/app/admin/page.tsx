"use client";

import { useState, useMemo, useEffect, memo } from 'react';
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
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { 
  Eye, Users, ShoppingCart, Wallet, Activity, Search, Loader2, DollarSign, ChevronLeft, Gift, Skull, AlertTriangle, CheckCircle2, ShieldEllipsis, Trophy, Landmark, Terminal, Key, Database, Hash, FileImage, XCircle, CreditCard, Banknote, ShieldCheck, FileText, Fingerprint, RefreshCw, Megaphone, Share2, Trash2, Send, UserCircle, Save, Copy, Edit2, Phone, Calendar, UserPlus, ShoppingBag, AlertOctagon, Clock, ArrowRight
} from 'lucide-react';
import { fetchAdminTerminalData, registerMt5AccountAction, updateOrderStatusAction, updatePayoutStatusAction, processKycAction, createBroadcastAction, deleteBroadcastAction, updateUserProfileAction } from './actions';
import DashboardPage from '@/app/dashboard/page';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { formatDistanceToNow } from 'date-fns';

const StatCard = memo(function StatCard({ title, value, icon, color }: { title: string, value: string | number, icon: any, color: string }) {
  const colors: any = {
    blue: 'text-primary bg-primary/10 border-primary/20',
    purple: 'text-purple-500 bg-purple-500/10 border-purple-500/20',
    green: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
    amber: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
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
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [adminError, setAdminError] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [previewUserId, setPreviewUserId] = useState<string | null>(null);
  const [adminData, setAdminData] = useState<any>({ users: [], orders: [], payouts: [], referrals: [], broadcasts: [], breaches: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const { toast } = useToast();

  // Provisioning Form State
  const [provisionForm, setProvisionForm] = useState({
    login: '',
    password: '',
    displayLogin: '',
    plan: '1-Step',
    size: '100000',
    userId: '',
    phase: 'evaluation'
  });
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [provisionResult, setProvisionResult] = useState<{ docId: string, login: string } | null>(null);

  // User Editor State
  const [editorSearchTerm, setEditorSearchTerm] = useState('');
  const [selectedEditorUser, setSelectedEditorUser] = useState<any>(null);
  const [userEditForm, setUserEditForm] = useState({
    name: '',
    phone: '',
    country: '',
    referralCode: '',
    tier: 'Bronze',
    status: 'active'
  });
  const [isEditorConfirmOpen, setIsEditorConfirmOpen] = useState(false);

  // Broadcast Form State
  const [broadcastForm, setBroadcastForm] = useState({ title: '', message: '' });

  // Proof Preview State
  const [viewProofUrl, setViewProofProofUrl] = useState<string | null>(null);

  useEffect(() => {
    const isVerified = localStorage.getItem('adminVerified') === 'true';
    if (isVerified) setIsAuthenticated(true);
    else setShowAdminModal(true);
    const savedTab = localStorage.getItem('admin_active_tab');
    if (savedTab) setActiveTab(savedTab);
  }, []);

  const refreshData = async () => {
    setIsLoading(true);
    const res = await fetchAdminTerminalData();
    if (res.success) {
      setAdminData(res);
    } else {
      toast({ variant: "destructive", title: "Sync Error", description: res.error });
    }
    setIsLoading(false);
  };

  useEffect(() => {
    if (isAuthenticated) refreshData();
  }, [isAuthenticated]);

  const handleAdminAuth = (e: React.FormEvent) => {
    e.preventDefault();
    const masterKey = "93463962569392846256";
    if (adminPasswordInput === masterKey) {
      setIsAuthenticated(true);
      setShowAdminModal(false);
      localStorage.setItem('adminVerified', 'true');
      toast({ title: "Admin Access Granted" });
    } else {
      setAdminError("❌ Access Denied");
      setAdminPasswordInput('');
    }
  };

  const handleUpdateOrderStatus = async (orderId: string, status: 'verified' | 'rejected', reason?: string) => {
    setActionLoading(true);
    const res = await updateOrderStatusAction(orderId, status);
    if (res.success) {
      toast({ title: `Order ${status.toUpperCase()}` });
      refreshData();
    } else {
      toast({ variant: "destructive", title: "Action Failed", description: res.error });
    }
    setActionLoading(false);
  };

  const handleUpdatePayoutStatus = async (payoutId: string, status: 'approved' | 'rejected' | 'done', reason?: string) => {
    setActionLoading(true);
    const res = await updatePayoutStatusAction(payoutId, status);
    if (res.success) {
      toast({ title: `Payout ${status.toUpperCase()}` });
      refreshData();
    } else {
      toast({ variant: "destructive", title: "Action Failed", description: res.error });
    }
    setActionLoading(false);
  };

  const handleUpdateKycStatus = async (userId: string, status: 'verified' | 'rejected') => {
    let reason = "";
    if (status === 'rejected') {
      reason = window.prompt("Enter rejection reason:") || "Documents do not meet institutional requirements.";
    }

    setActionLoading(true);
    const res = await processKycAction(userId, status, reason);
    if (res.success) {
      toast({ title: `KYC ${status === 'verified' ? 'Approved' : 'Rejected'}` });
      refreshData();
    } else {
      toast({ variant: "destructive", title: "KYC Update Failed", description: res.error });
    }
    setActionLoading(false);
  };

  const handleSendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastForm.title || !broadcastForm.message) return;
    
    setActionLoading(true);
    const res = await createBroadcastAction(broadcastForm.title, broadcastForm.message);
    if (res.success) {
      toast({ title: "Broadcast Published" });
      setBroadcastForm({ title: '', message: '' });
      refreshData();
    } else {
      toast({ variant: "destructive", title: "Publish Error", description: res.error });
    }
    setActionLoading(false);
  };

  const handleDeleteBroadcast = async (id: string) => {
    if (!confirm("Permanently delete this broadcast?")) return;
    
    setActionLoading(true);
    const res = await deleteBroadcastAction(id);
    if (res.success) {
      toast({ title: "Broadcast Deleted" });
      refreshData();
    } else {
      toast({ variant: "destructive", title: "Delete Error", description: res.error });
    }
    setActionLoading(false);
  };

  const handleUserEditSubmit = async () => {
    if (!selectedEditorUser) return;
    setActionLoading(true);
    const res = await updateUserProfileAction(selectedEditorUser.id, userEditForm);
    if (res.success) {
      toast({ title: "Profile Synchronized" });
      setIsEditorConfirmOpen(false);
      refreshData();
    } else {
      toast({ variant: "destructive", title: "Update Failed", description: res.error });
    }
    setActionLoading(false);
  };

  const filteredUsersForSearch = useMemo(() => {
    if (!userSearchTerm) return [];
    return adminData.users.filter((u: any) => 
      u.email?.toLowerCase().includes(userSearchTerm.toLowerCase()) || 
      u.name?.toLowerCase().includes(userSearchTerm.toLowerCase())
    ).slice(0, 5);
  }, [adminData.users, userSearchTerm]);

  const filteredUsersForEditor = useMemo(() => {
    if (!editorSearchTerm) return [];
    return adminData.users.filter((u: any) => 
      u.email?.toLowerCase().includes(editorSearchTerm.toLowerCase()) || 
      u.name?.toLowerCase().includes(editorSearchTerm.toLowerCase())
    ).slice(0, 5);
  }, [adminData.users, editorSearchTerm]);

  const filteredUsersForDirectory = useMemo(() => {
    if (!searchTerm) return adminData.users;
    const lowerSearch = searchTerm.toLowerCase();
    return adminData.users.filter((u: any) => 
      u.name?.toLowerCase().includes(lowerSearch) || 
      u.email?.toLowerCase().includes(lowerSearch) ||
      u.id?.toLowerCase().includes(lowerSearch) || // Search by Auth UID
      (u.uid && u.uid.toString().toLowerCase().includes(lowerSearch)) // Search by 8-digit numeric ID
    );
  }, [adminData.users, searchTerm]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied!", description: `${label} copied to clipboard.` });
  };

  const handleProvisionSubmit = async () => {
    if (!/^\d+$/.test(provisionForm.login)) {
      toast({ variant: "destructive", title: "Invalid Login", description: "MT5 Login must be digits only." });
      return;
    }
    if (!provisionForm.userId) {
      toast({ variant: "destructive", title: "User Required", description: "Please select a trader for this account." });
      return;
    }

    setActionLoading(true);
    const res = await registerMt5AccountAction({
      ...provisionForm,
      size: Number(provisionForm.size)
    });

    if (res.success) {
      toast({ title: "Account Registered Successfully" });
      setProvisionResult({ docId: res.docId!, login: provisionForm.login });
      setProvisionForm({ login: '', password: '', displayLogin: '', plan: '1-Step', size: '100000', userId: '', phase: 'evaluation' });
      setUserSearchTerm('');
      setIsConfirmOpen(false);
      refreshData();
    } else {
      toast({ variant: "destructive", title: "Provisioning Failed", description: res.error });
    }
    setActionLoading(false);
  };

  const stats = useMemo(() => {
    const verifiedOrders = adminData.orders.filter((o: any) => o.status === 'verified');
    const totalRevenue = verifiedOrders.reduce((acc: number, o: any) => acc + (parseFloat(o.amountPaid) || 0), 0);
    const pendingPayouts = adminData.payouts.filter((p: any) => p.status === 'pending').length;
    return { 
      totalRevenue, 
      totalTraders: adminData.users.length, 
      verifiedCount: verifiedOrders.length,
      pendingOrders: adminData.orders.filter((o: any) => o.status === 'pending').length,
      pendingPayouts
    };
  }, [adminData]);

  const recentActivity = useMemo(() => {
    const activities: any[] = [];

    // 1. Signups
    adminData.users.forEach((u: any) => {
      activities.push({
        id: `signup-${u.id}`,
        type: 'signup',
        description: `New trader: ${u.name || u.email}`,
        timestamp: u.createdAt || u.joinDate,
        icon: <UserPlus className="w-4 h-4 text-purple-500" />,
        color: 'purple'
      });
    });

    // 2. Orders
    adminData.orders.forEach((o: any) => {
      activities.push({
        id: `order-${o.id}`,
        type: 'order',
        description: `Order submitted: ${o.accountSize} ${o.plan} by ${o.userName || o.email}`,
        timestamp: o.submittedAt || o.date,
        icon: <ShoppingBag className="w-4 h-4 text-primary" />,
        color: 'blue'
      });
    });

    // 3. Payouts
    adminData.payouts.forEach((p: any) => {
      activities.push({
        id: `payout-${p.id}`,
        type: 'payout',
        description: `Payout requested: $${p.amount} by ${p.email}`,
        timestamp: p.createdAt || p.date,
        icon: <Banknote className="w-4 h-4 text-emerald-500" />,
        color: 'green'
      });
    });

    // 4. Breaches
    adminData.breaches.forEach((b: any) => {
      activities.push({
        id: `breach-${b.id}`,
        type: 'breach',
        description: `Breach detected: ${b.breachReason} on account ${b.login || b.userId}`,
        timestamp: b.breachedAt,
        icon: <AlertOctagon className="w-4 h-4 text-destructive" />,
        color: 'destructive'
      });
    });

    return activities
      .filter(a => a.timestamp)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 20);
  }, [adminData]);

  const referrerAggregates = useMemo(() => {
    const referrersMap = new Map();
    
    adminData.users.forEach((u: any) => {
      if (u.referralCode) {
        referrersMap.set(u.id, {
          id: u.id,
          email: u.email,
          name: u.name,
          code: u.referralCode,
          signups: 0,
          earnings: 0,
          conversions: 0,
          referrals: []
        });
      }
    });

    adminData.referrals.forEach((ref: any) => {
      const agg = referrersMap.get(ref.referrerId);
      if (agg) {
        agg.signups += 1;
        if ((ref.amount || 0) > 0) {
          agg.earnings += (ref.amount || 0);
          agg.conversions += 1;
        } else if (ref.status === 'converted') {
          agg.earnings += 30;
          agg.conversions += 1;
        }
        agg.referrals.push(ref);
      }
    });

    return Array.from(referrersMap.values()).filter((agg: any) => agg.signups > 0 || agg.earnings > 0);
  }, [adminData.users, adminData.referrals]);

  if (previewUserId) {
    return (
      <div className="min-h-screen bg-background relative">
        <div className="fixed top-0 left-0 w-full z-[100] bg-primary h-14 flex items-center justify-between px-6 shadow-xl">
          <span className="text-xs font-black uppercase text-primary-foreground">Previewing Trader: {previewUserId}</span>
          <Button variant="secondary" size="sm" onClick={() => setPreviewUserId(null)}><ChevronLeft className="w-3 h-3 mr-1" /> Exit Preview</Button>
        </div>
        <div className="pt-14"><DashboardPage adminViewMode={true} targetUid={previewUserId} /></div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background overflow-hidden relative">
      <Navigation />
      <main className="flex-1 flex flex-col min-h-0">
        <div className="p-8 pb-4 shrink-0">
          <div className="flex flex-col md:flex-row justify-between items-start mb-6 gap-4">
            <div>
              <h1 className="text-4xl font-headline font-bold mb-1 text-white">Administrative Terminal</h1>
              <p className="text-muted-foreground text-sm">Provision institutional nodes and manage trader access.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={refreshData} disabled={isLoading}>
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Database className="w-4 h-4 mr-2" />}
                Refresh Data
              </Button>
            </div>
          </div>
          <Tabs value={activeTab} onValueChange={val => { setActiveTab(val); localStorage.setItem('admin_active_tab', val); }}>
            <TabsList className="bg-secondary/50 h-12 w-full justify-start overflow-x-auto no-scrollbar">
              <TabsTrigger value="overview" className="font-bold">Overview</TabsTrigger>
              <TabsTrigger value="orders" className="font-bold">Order Review</TabsTrigger>
              <TabsTrigger value="payouts" className="font-bold">Payout Hub</TabsTrigger>
              <TabsTrigger value="provisioning" className="font-bold">MT5 Provisioning</TabsTrigger>
              <TabsTrigger value="user_editor" className="font-bold">Profile Editor</TabsTrigger>
              <TabsTrigger value="user_directory" className="font-bold">User Directory</TabsTrigger>
              <TabsTrigger value="kyc" className="font-bold">KYC Hub</TabsTrigger>
              <TabsTrigger value="referrals" className="font-bold">Referral Audit</TabsTrigger>
              <TabsTrigger value="broadcasts" className="font-bold">Broadcasts</TabsTrigger>
              <TabsTrigger value="breaches" className="font-bold">Breaches</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex-1 overflow-y-auto p-8 pt-0 custom-scrollbar">
          {activeTab === 'overview' && (
            <div className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard title="Total Revenue" value={`$${stats.totalRevenue.toLocaleString()}`} icon={<DollarSign />} color="blue" />
                <StatCard title="Total Traders" value={stats.totalTraders} icon={<Users />} color="purple" />
                <StatCard title="Pending Review" value={stats.pendingOrders} icon={<ShoppingCart />} color="amber" />
                <StatCard title="Pending Payouts" value={stats.pendingPayouts} icon={<Wallet />} color="green" />
              </div>

              <div className="grid lg:grid-cols-3 gap-8">
                <Card className="lg:col-span-2 bg-card/30 border-border/50 overflow-hidden">
                  <CardHeader className="flex flex-row items-center justify-between border-b border-white/5 pb-4">
                    <div>
                      <CardTitle className="text-xl font-headline text-white flex items-center gap-2">
                        <Activity className="w-5 h-5 text-primary" /> Platform Activity Feed
                      </CardTitle>
                      <CardDescription>Real-time log of events across the network.</CardDescription>
                    </div>
                    <Badge variant="outline" className="animate-pulse bg-emerald-500/5 text-emerald-500 border-emerald-500/20 uppercase text-[9px] font-black tracking-widest px-3 py-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-2" /> Live
                    </Badge>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="divide-y divide-white/5">
                      {recentActivity.length === 0 ? (
                        <div className="p-20 text-center text-muted-foreground italic text-sm">No recent activity detected.</div>
                      ) : (
                        recentActivity.map((act) => (
                          <div className="p-5 flex items-start gap-4 hover:bg-white/5 transition-colors group">
                            <div className={cn(
                              "p-2.5 rounded-xl border shrink-0 transition-transform group-hover:scale-110",
                              act.color === 'purple' && "bg-purple-500/10 border-purple-500/20",
                              act.color === 'blue' && "bg-primary/10 border-primary/20",
                              act.color === 'green' && "bg-emerald-500/10 border-emerald-500/20",
                              act.color === 'destructive' && "bg-destructive/10 border-destructive/20",
                            )}>
                              {act.icon}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-white line-clamp-1 mb-1">{act.description}</p>
                              <div className="flex items-center gap-3">
                                <span className="text-[10px] uppercase font-black tracking-widest text-muted-foreground flex items-center gap-1.5">
                                  <Clock className="w-3 h-3" /> {formatDistanceToNow(new Date(act.timestamp), { addSuffix: true })}
                                </span>
                                <span className="text-[10px] text-muted-foreground/30">•</span>
                                <span className="text-[10px] uppercase font-bold text-muted-foreground/40">{act.type}</span>
                              </div>
                            </div>
                            <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8">
                              <ArrowRight className="w-4 h-4 text-muted-foreground" />
                            </Button>
                          </div>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>

                <div className="space-y-6">
                  <Card className="bg-primary/5 border-primary/20">
                    <CardHeader>
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Trophy className="w-4 h-4 text-primary" /> Institutional Pulse
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-muted-foreground">Active Sessions</span>
                        <span className="text-white font-bold">{stats.totalTraders}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-muted-foreground">Verified Accounts</span>
                        <span className="text-white font-bold">{stats.verifiedCount}</span>
                      </div>
                      <div className="pt-4 border-t border-white/5">
                        <p className="text-[10px] text-muted-foreground leading-relaxed italic">
                          Market operations are synchronized with the 2:00 AM UTC institutional boundary.
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'orders' && (
            <Card className="bg-card/30 border-border/50">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-black">
                      <tr>
                        <th className="py-4 px-6">Trader / Date</th>
                        <th className="py-4 px-6">Plan Selection</th>
                        <th className="py-4 px-6">Tx Hash / Network</th>
                        <th className="py-4 px-6">Amount Paid</th>
                        <th className="py-4 px-6">Status</th>
                        <th className="py-4 px-6 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {adminData.orders.length === 0 ? (
                        <tr><td colSpan={6} className="py-20 text-center text-muted-foreground italic">No purchase records found.</td></tr>
                      ) : adminData.orders.map((order: any) => (
                        <tr key={order.id} className={cn("hover:bg-primary/5 transition-colors", order.status === 'pending' ? 'bg-amber-500/5' : '')}>
                          <td className="py-4 px-6">
                            <div className="font-bold text-white">{order.email}</div>
                            <div className="text-[10px] text-muted-foreground uppercase tracking-tight">
                              {order.submittedAt ? new Date(order.submittedAt).toLocaleString() : 'N/A'}
                            </div>
                          </td>
                          <td className="py-4 px-6">
                            <div className="text-white font-medium">{order.accountSize} {order.plan}</div>
                            <div className="text-[10px] text-muted-foreground">Original Price: {order.price}</div>
                          </td>
                          <td className="py-4 px-6">
                            <div className="text-[10px] font-mono text-white truncate max-w-[120px] mb-1">{order.txHash}</div>
                            <Badge variant="outline" className="text-[9px] uppercase font-bold border-primary/20 text-primary">{order.network}</Badge>
                          </td>
                          <td className="py-4 px-6">
                            <div className="text-emerald-500 font-bold font-mono text-lg">${parseFloat(order.amountPaid).toFixed(2)}</div>
                          </td>
                          <td className="py-4 px-6">
                            <Badge className={cn(
                              "uppercase text-[10px] font-black",
                              order.status === 'verified' ? "bg-emerald-500 text-black" : 
                              order.status === 'rejected' ? "bg-destructive text-white" : 
                              "bg-amber-500 text-black"
                            )}>
                              {order.status || 'Pending'}
                            </Badge>
                          </td>
                          <td className="py-4 px-6 text-right space-x-2">
                            {order.paymentScreenshot && (
                              <Button variant="ghost" size="sm" onClick={() => setViewProofProofUrl(order.paymentScreenshot)}>
                                <FileImage className="w-4 h-4" />
                              </Button>
                            )}
                            {order.status === 'pending' && (
                              <>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="text-emerald-500 hover:bg-emerald-500/10"
                                  onClick={() => handleUpdateOrderStatus(order.id, 'verified')}
                                  disabled={actionLoading}
                                >
                                  <CheckCircle2 className="w-4 h-4" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="text-destructive hover:bg-destructive/10"
                                  onClick={() => handleUpdateOrderStatus(order.id, 'rejected')}
                                  disabled={actionLoading}
                                >
                                  <XCircle className="w-4 h-4" />
                                </Button>
                              </>
                            )}
                            {order.status === 'verified' && (
                               <Button 
                                variant="outline" 
                                size="sm" 
                                className="text-[9px] uppercase font-black tracking-widest border-primary/20 text-primary hover:bg-primary hover:text-black"
                                onClick={() => {
                                  setProvisionForm({
                                    ...provisionForm,
                                    userId: order.userId,
                                    plan: order.plan.includes('1-Step') ? '1-Step' : order.plan.includes('2-Step') ? '2-Step' : order.plan.includes('3-Step') ? '3-Step' : 'Instant Funded',
                                    size: order.accountSize.replace(/[$,]/g, '').replace('k', '000'),
                                  });
                                  setUserSearchTerm(order.email);
                                  setActiveTab('provisioning');
                                }}
                              >
                                <Terminal className="w-3 h-3 mr-1" /> Provision
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'payouts' && (
            <Card className="bg-card/30 border-border/50">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-black">
                      <tr>
                        <th className="py-4 px-6">Trader Email</th>
                        <th className="py-4 px-6">Requested Amount</th>
                        <th className="py-4 px-6">Live Balance</th>
                        <th className="py-4 px-6">Method / Address</th>
                        <th className="py-4 px-6">Date</th>
                        <th className="py-4 px-6">Status</th>
                        <th className="py-4 px-6 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {adminData.payouts.length === 0 ? (
                        <tr><td colSpan={7} className="py-20 text-center text-muted-foreground italic">No payout requests found.</td></tr>
                      ) : adminData.payouts.map((payout: any) => {
                        const user = adminData.users.find((u: any) => u.id === payout.userId);
                        return (
                          <tr key={payout.id} className="hover:bg-primary/5 transition-colors">
                            <td className="py-4 px-6">
                              <div className="font-bold text-white">{payout.email}</div>
                              <div className="text-[10px] text-muted-foreground uppercase font-mono">{payout.userId?.slice(0, 8)}...</div>
                            </td>
                            <td className="py-4 px-6">
                              <div className="text-emerald-500 font-bold text-lg">${parseFloat(payout.amount).toFixed(2)}</div>
                            </td>
                            <td className="py-4 px-6">
                              <div className="text-white font-medium">${user?.liveBalance?.toLocaleString() || 'N/A'}</div>
                              <div className="text-[10px] text-muted-foreground">Equity: ${user?.liveEquity?.toLocaleString() || 'N/A'}</div>
                            </td>
                            <td className="py-4 px-6">
                              <Badge variant="outline" className="text-[9px] uppercase font-bold mb-1">{payout.method}</Badge>
                              <div className="text-[10px] font-mono text-muted-foreground truncate max-w-[150px]">{payout.address}</div>
                            </td>
                            <td className="py-4 px-6 text-xs text-muted-foreground">
                              {payout.date ? new Date(payout.date).toLocaleDateString() : 'N/A'}
                            </td>
                            <td className="py-4 px-6">
                              <Badge className={cn(
                                "uppercase text-[10px] font-black",
                                payout.status === 'done' ? "bg-emerald-500 text-black" : 
                                payout.status === 'approved' ? "bg-primary text-black" : 
                                payout.status === 'rejected' ? "bg-destructive text-white" : 
                                "bg-amber-500 text-black"
                              )}>
                                {payout.status || 'Pending'}
                              </Badge>
                            </td>
                            <td className="py-4 px-6 text-right space-x-2">
                              {payout.status === 'pending' && (
                                <>
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="text-primary hover:bg-primary/10"
                                    onClick={() => handleUpdatePayoutStatus(payout.id, 'approved')}
                                    disabled={actionLoading}
                                  >
                                    <CheckCircle2 className="w-4 h-4" />
                                  </Button>
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="text-destructive hover:bg-destructive/10"
                                    onClick={() => handleUpdatePayoutStatus(payout.id, 'rejected')}
                                    disabled={actionLoading}
                                  >
                                    <XCircle className="w-4 h-4" />
                                  </Button>
                                </>
                              )}
                              {payout.status === 'approved' && (
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  className="text-[9px] uppercase font-black tracking-widest border-emerald-500/20 text-emerald-500 hover:bg-emerald-500 hover:text-black"
                                  onClick={() => handleUpdatePayoutStatus(payout.id, 'done')}
                                  disabled={actionLoading}
                                >
                                  <CreditCard className="w-3 h-3 mr-1" /> Mark Paid
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
          )}

          {activeTab === 'provisioning' && (
            <div className="grid lg:grid-cols-2 gap-8">
              <Card className="bg-card/40 border-primary/20">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <Terminal className="w-5 h-5 text-primary" /> Register Manual MT5 Account
                  </CardTitle>
                  <CardDescription>Use this to link a manually created broker account to a user.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label className="text-xs uppercase font-bold text-muted-foreground">1. Find Trader</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input 
                        placeholder="Search by email or name..." 
                        className="pl-10 bg-background/50" 
                        value={userSearchTerm}
                        onChange={e => setUserSearchTerm(e.target.value)}
                      />
                    </div>
                    {filteredUsersForSearch.length > 0 && (
                      <div className="p-2 border border-border bg-secondary/30 rounded-lg space-y-1">
                        {filteredUsersForSearch.map((u: any) => (
                          <div 
                            key={u.id} 
                            onClick={() => {
                              setProvisionForm({...provisionForm, userId: u.id});
                              setUserSearchTerm(u.email);
                            }}
                            className={cn(
                              "p-2 rounded cursor-pointer text-sm flex justify-between items-center transition-colors",
                              provisionForm.userId === u.id ? "bg-primary text-black" : "hover:bg-white/5 text-white"
                            )}
                          >
                            <span>{u.name} ({u.email})</span>
                            <span className="text-[10px] font-mono opacity-50">{u.id.slice(0, 8)}...</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-white flex items-center gap-2"><Hash className="w-3 h-3 text-primary" /> MT5 Login</Label>
                      <Input 
                        placeholder="e.g. 756872410" 
                        value={provisionForm.login}
                        onChange={e => setProvisionForm({...provisionForm, login: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-white flex items-center gap-2"><Key className="w-3 h-3 text-primary" /> MT5 Password</Label>
                      <Input 
                        type="password"
                        placeholder="Trader password" 
                        value={provisionForm.password}
                        onChange={e => setProvisionForm({...provisionForm, password: e.target.value})}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-muted-foreground">Display Login (Optional cosmetic ID)</Label>
                    <Input 
                      placeholder="Defaults to MT5 Login if blank"
                      value={provisionForm.displayLogin}
                      onChange={e => setProvisionForm({...provisionForm, displayLogin: e.target.value})}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-white">Plan Type</Label>
                      <Select 
                        value={provisionForm.plan} 
                        onValueChange={v => {
                          let phase = 'evaluation';
                          if (v === 'Instant Funded') phase = 'funded';
                          else if (v === '2-Step' || v === '3-Step') phase = 'phase1';
                          setProvisionForm({...provisionForm, plan: v, phase});
                        }}
                      >
                        <SelectTrigger className="bg-background/50"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {['1-Step', '2-Step', '3-Step', 'Instant Funded'].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-white">Account Size</Label>
                      <Select value={provisionForm.size} onValueChange={v => setProvisionForm({...provisionForm, size: v})}>
                        <SelectTrigger className="bg-background/50"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {[5000, 10000, 25000, 50000, 100000, 200000, 300000].map(s => <SelectItem key={s} value={String(s)}>${s.toLocaleString()}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {provisionForm.plan !== 'Instant Funded' && (
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-white">Initial Phase</Label>
                      <Select value={provisionForm.phase} onValueChange={v => setProvisionForm({...provisionForm, phase: v})}>
                        <SelectTrigger className="bg-background/50"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {provisionForm.plan === '1-Step' && (
                            <SelectItem value="evaluation">Evaluation</SelectItem>
                          )}
                          {provisionForm.plan === '2-Step' && (
                            <>
                              <SelectItem value="phase1">Evaluation - Phase 1</SelectItem>
                              <SelectItem value="phase2">Evaluation - Phase 2</SelectItem>
                            </>
                          )}
                          {provisionForm.plan === '3-Step' && (
                            <>
                              <SelectItem value="phase1">Evaluation - Phase 1</SelectItem>
                              <SelectItem value="phase2">Evaluation - Phase 2</SelectItem>
                              <SelectItem value="phase3">Evaluation - Phase 3</SelectItem>
                            </>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <Button 
                    className="w-full h-12 font-bold cyan-box-glow" 
                    disabled={!provisionForm.login || !provisionForm.userId}
                    onClick={() => setIsConfirmOpen(true)}
                  >
                    Register Account Link
                  </Button>
                </CardContent>
              </Card>

              <div className="space-y-6">
                {provisionResult && (
                  <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
                    <Card className="bg-emerald-500/10 border-emerald-500/30">
                      <CardHeader>
                        <CardTitle className="text-emerald-500 flex items-center gap-2"><CheckCircle2 /> Successfully Created</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2 text-sm">
                        <div className="flex justify-between"><span>Doc ID:</span> <span className="font-mono text-white">{provisionResult.docId}</span></div>
                        <div className="flex justify-between"><span>Login:</span> <span className="font-mono text-white">{provisionResult.login}</span></div>
                        <p className="text-[10px] text-muted-foreground italic mt-4">Verified sync point created in mt5_accounts.</p>
                      </CardContent>
                    </Card>
                  </motion.div>
                )}
                
                <Card className="bg-secondary/20 border-border">
                  <CardHeader><CardTitle className="text-sm">Provisioning Logs</CardTitle></CardHeader>
                  <CardContent className="p-0">
                    <div className="divide-y divide-white/5 max-h-[300px] overflow-y-auto">
                      {adminData.users.filter((u:any) => u.mt5Login).slice(0, 10).map((u:any) => (
                        <div key={u.id} className="p-4 text-xs flex justify-between items-center">
                          <div>
                            <p className="font-bold text-white">{u.mt5Login}</p>
                            <p className="text-muted-foreground opacity-50">{u.email}</p>
                          </div>
                          <Badge variant="outline" className="text-[9px]">{u.accountPlan}</Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {activeTab === 'user_editor' && (
            <div className="grid lg:grid-cols-3 gap-8">
              <div className="lg:col-span-1 space-y-6">
                <Card className="bg-card/40 border-border/50">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2"><Search className="w-4 h-4" /> Locate Trader</CardTitle>
                    <CardDescription>Search by email or name to begin editing.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input 
                        placeholder="trader@example.com" 
                        className="pl-10 bg-background/50" 
                        value={editorSearchTerm}
                        onChange={e => setEditorSearchTerm(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      {filteredUsersForEditor.map((u: any) => (
                        <div 
                          key={u.id} 
                          onClick={() => {
                            setSelectedEditorUser(u);
                            setUserEditForm({
                              name: u.name || '',
                              phone: u.phone || '',
                              country: u.country || '',
                              referralCode: u.referralCode || '',
                              tier: u.tier || 'Bronze',
                              status: u.status || 'active'
                            });
                            setEditorSearchTerm(u.email);
                          }}
                          className={cn(
                            "p-3 rounded-xl cursor-pointer text-sm flex justify-between items-center transition-all border",
                            selectedEditorUser?.id === u.id ? "bg-primary border-primary text-black" : "bg-secondary/30 border-border/50 hover:border-primary/50 text-white"
                          )}
                        >
                          <div>
                            <p className="font-bold">{u.name}</p>
                            <p className="text-[10px] opacity-70">{u.email}</p>
                          </div>
                          <Badge variant="outline" className={cn("text-[9px]", selectedEditorUser?.id === u.id ? "border-black/20" : "")}>{u.status}</Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {selectedEditorUser && (
                  <Card className="bg-primary/5 border-primary/20">
                    <CardHeader><CardTitle className="text-sm flex items-center gap-2 text-primary"><Activity className="w-4 h-4" /> Live Sync Metrics</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <p className="text-[9px] font-black text-muted-foreground uppercase">Live Balance</p>
                          <p className="font-bold text-white text-lg">${selectedEditorUser.liveBalance?.toLocaleString() || '0.00'}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[9px] font-black text-muted-foreground uppercase">Live Equity</p>
                          <p className="font-bold text-white text-lg">${selectedEditorUser.liveEquity?.toLocaleString() || '0.00'}</p>
                        </div>
                      </div>
                      <div className="p-3 bg-background/50 rounded-lg border border-border">
                        <p className="text-[9px] font-black text-muted-foreground uppercase mb-1">Last Update</p>
                        <p className="text-xs text-white font-mono">{selectedEditorUser.lastMT5Update ? new Date(selectedEditorUser.lastMT5Update).toLocaleString() : 'Never Sync'}</p>
                      </div>
                      <p className="text-[10px] text-muted-foreground italic leading-tight">Sync metrics are read-only and managed by the MT5 integration engine.</p>
                    </CardContent>
                  </Card>
                )}
              </div>

              <div className="lg:col-span-2">
                {selectedEditorUser ? (
                  <Card className="bg-card/30 border-border/50">
                    <CardHeader className="flex flex-row items-center justify-between border-b border-white/5 pb-6">
                      <div>
                        <CardTitle className="text-white">Edit Profile: {selectedEditorUser.name}</CardTitle>
                        <CardDescription>Modifying UID: {selectedEditorUser.id}</CardDescription>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => setSelectedEditorUser(null)}><ChevronLeft className="w-3 h-3 mr-1" /> Close</Button>
                    </CardHeader>
                    <CardContent className="pt-8 space-y-8">
                      <div className="grid md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <Label className="text-xs font-bold uppercase text-muted-foreground">Full Name</Label>
                          <Input value={userEditForm.name} onChange={e => setUserEditForm({...userEditForm, name: e.target.value})} />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs font-bold uppercase text-muted-foreground">Account Identity (Email)</Label>
                          <Input value={selectedEditorUser.email} disabled className="bg-secondary/20 opacity-50 cursor-not-allowed" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs font-bold uppercase text-muted-foreground">Phone Number</Label>
                          <Input value={userEditForm.phone} onChange={e => setUserEditForm({...userEditForm, phone: e.target.value})} />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs font-bold uppercase text-muted-foreground">Country</Label>
                          <Input value={userEditForm.country} onChange={e => setUserEditForm({...userEditForm, country: e.target.value})} />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs font-bold uppercase text-muted-foreground">Referral Code</Label>
                          <div className="relative">
                            <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-primary" />
                            <Input className="pl-8 font-mono uppercase" value={userEditForm.referralCode} onChange={e => setUserEditForm({...userEditForm, referralCode: e.target.value.toUpperCase()})} />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs font-bold uppercase text-muted-foreground">Loyalty Tier</Label>
                          <Select value={userEditForm.tier} onValueChange={v => setUserEditForm({...userEditForm, tier: v})}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Bronze">Bronze Tier</SelectItem>
                              <SelectItem value="Silver">Silver Tier</SelectItem>
                              <SelectItem value="Gold">Gold Tier</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="p-6 bg-secondary/20 rounded-2xl border border-border space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-bold text-white">Administrative Status</p>
                            <p className="text-xs text-muted-foreground">Override account access manually.</p>
                          </div>
                          <Select value={userEditForm.status} onValueChange={v => setUserEditForm({...userEditForm, status: v})}>
                            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="active">🟢 Active</SelectItem>
                              <SelectItem value="suspended">🔴 Suspended</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="pt-6 border-t border-white/5">
                        <Button className="w-full h-12 font-bold cyan-box-glow" onClick={() => setIsEditorConfirmOpen(true)}>
                          <Save className="w-4 h-4 mr-2" /> Commit Profile Changes
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center border-2 border-dashed border-border rounded-3xl opacity-20 py-40">
                    <UserCircle className="w-20 h-20 mb-4" />
                    <p className="font-bold text-xl uppercase tracking-widest">No User Selected</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'user_directory' && (
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                <div className="relative w-full max-w-lg">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input 
                    placeholder="Search directory by name, email, or UID..." 
                    className="pl-10 bg-secondary/30 border-white/10" 
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                  />
                </div>
                <Badge variant="outline" className="h-10 px-6 border-white/5 text-muted-foreground font-mono">
                  {filteredUsersForDirectory.length} TRADERS MATCHED
                </Badge>
              </div>

              <Card className="bg-card/30 border-border/50">
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-black">
                        <tr>
                          <th className="py-4 px-6">Trader Identity</th>
                          <th className="py-4 px-6">Institutional ID</th>
                          <th className="py-4 px-6">Contact Details</th>
                          <th className="py-4 px-6 text-center">Plan Status</th>
                          <th className="py-4 px-6">Joined Date</th>
                          <th className="py-4 px-6 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/30">
                        {filteredUsersForDirectory.length === 0 ? (
                          <tr><td colSpan={6} className="py-20 text-center text-muted-foreground italic">No traders matching your criteria.</td></tr>
                        ) : filteredUsersForDirectory.map((u: any) => (
                          <tr key={u.id} className="hover:bg-primary/5 transition-colors group">
                            <td className="py-4 px-6">
                              <div className="flex items-center gap-3">
                                <Avatar className="h-10 w-10 border border-white/10">
                                  <AvatarFallback className="bg-secondary text-xs">{u.name?.slice(0, 2).toUpperCase()}</AvatarFallback>
                                </Avatar>
                                <div>
                                  <div className="font-bold text-white group-hover:text-primary transition-colors">{u.name}</div>
                                  <div className="text-[10px] text-muted-foreground truncate max-w-[150px]">{u.email}</div>
                                </div>
                              </div>
                            </td>
                            <td className="py-4 px-6">
                              <div className="flex items-center gap-2">
                                <code className="text-[10px] bg-background/50 px-2 py-1 rounded border border-white/5 font-mono text-white">
                                  {u.uid || 'NO-ID'}
                                </code>
                                <button onClick={() => copyToClipboard(u.uid || '', "Trader ID")} className="text-muted-foreground hover:text-primary transition-colors">
                                  <Copy className="w-3 h-3" />
                                </button>
                              </div>
                              <div className="text-[8px] text-muted-foreground mt-1 uppercase opacity-40">AUTH: {u.id.slice(0, 8)}...</div>
                            </td>
                            <td className="py-4 px-6">
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-1.5 text-xs text-zinc-300">
                                  <Phone className="w-3 h-3 text-muted-foreground" /> {u.phone || 'No phone'}
                                </div>
                                <div className="text-[10px] text-muted-foreground uppercase">{u.country || 'Global'}</div>
                              </div>
                            </td>
                            <td className="py-4 px-6 text-center">
                              {u.mt5Login ? (
                                <div className="space-y-1">
                                  <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 font-mono text-[10px]">{u.mt5Login}</Badge>
                                  <p className="text-[9px] text-muted-foreground uppercase font-black">{u.accountPlan}</p>
                                </div>
                              ) : (
                                <Badge variant="outline" className="text-[9px] text-muted-foreground opacity-50">UNPROVISIONED</Badge>
                              )}
                            </td>
                            <td className="py-4 px-6">
                              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-mono">
                                <Calendar className="w-3 h-3" /> {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : 'N/A'}
                              </div>
                            </td>
                            <td className="py-4 px-6 text-right space-x-2">
                              <TooltipProvider>
                                <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-primary/20 text-primary" onClick={() => {
                                  setSelectedEditorUser(u);
                                  setUserEditForm({
                                    name: u.name || '',
                                    phone: u.phone || '',
                                    country: u.country || '',
                                    referralCode: u.referralCode || '',
                                    tier: u.tier || 'Bronze',
                                    status: u.status || 'active'
                                  });
                                  setActiveTab('user_editor');
                                }}>
                                  <Edit2 className="w-4 h-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-secondary text-white" onClick={() => setPreviewUserId(u.id)}>
                                  <Eye className="w-4 h-4" />
                                </Button>
                              </TooltipProvider>
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

          {activeTab === 'kyc' && (
            <Card className="bg-card/30 border-border/50">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-black">
                      <tr>
                        <th className="py-4 px-6">Trader Name / Email</th>
                        <th className="py-4 px-6">Submission Date</th>
                        <th className="py-4 px-6">Status</th>
                        <th className="py-4 px-6">Document Inspection</th>
                        <th className="py-4 px-6 text-right">Review Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {adminData.users.filter((u: any) => u.kycStatus === 'pending' || u.kycStatus === 'verified' || u.kycStatus === 'rejected').length === 0 ? (
                        <tr><td colSpan={5} className="py-20 text-center text-muted-foreground italic">No identity applications found.</td></tr>
                      ) : adminData.users.filter((u: any) => u.kycStatus === 'pending' || u.kycStatus === 'verified' || u.kycStatus === 'rejected').map((user: any) => (
                        <tr key={user.id} className={cn("hover:bg-primary/5 transition-colors", user.kycStatus === 'pending' ? 'bg-primary/5' : '')}>
                          <td className="py-4 px-6">
                            <div className="font-bold text-white">{user.name}</div>
                            <div className="text-[10px] text-muted-foreground uppercase tracking-tight">{user.email}</div>
                          </td>
                          <td className="py-4 px-6">
                            <div className="text-white text-xs">
                              {user.kycSubmittedAt ? new Date(user.kycSubmittedAt).toLocaleString() : 'N/A'}
                            </div>
                          </td>
                          <td className="py-4 px-6">
                            <Badge className={cn(
                              "uppercase text-[10px] font-black",
                              user.kycStatus === 'verified' ? "bg-emerald-500 text-black" : 
                              user.kycStatus === 'rejected' ? "bg-destructive text-white" : 
                              "bg-primary text-black"
                            )}>
                              {user.kycStatus || 'None'}
                            </Badge>
                          </td>
                          <td className="py-4 px-6">
                            <div className="flex items-center gap-2">
                              {user.idProofUrl && (
                                <Button variant="outline" size="sm" className="h-8 text-[10px] font-black uppercase tracking-tight gap-1.5" onClick={() => setViewProofProofUrl(user.idProofUrl)}>
                                  <Fingerprint className="w-3 h-3" /> ID Proof
                                </Button>
                              )}
                              {user.addressProofUrl && (
                                <Button variant="outline" size="sm" className="h-8 text-[10px] font-black uppercase tracking-tight gap-1.5" onClick={() => setViewProofProofUrl(user.addressProofUrl)}>
                                  <Landmark className="w-3 h-3" /> Address
                                </Button>
                              )}
                            </div>
                          </td>
                          <td className="py-4 px-6 text-right space-x-2">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className={cn(
                                "text-emerald-500 hover:bg-emerald-500/10",
                                user.kycStatus === 'verified' && "bg-emerald-500/20"
                              )}
                              onClick={() => handleUpdateKycStatus(user.id, 'verified')}
                              disabled={actionLoading || user.kycStatus === 'verified'}
                              title="Approve KYC"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className={cn(
                                "text-destructive hover:bg-destructive/10",
                                user.kycStatus === 'rejected' && "bg-destructive/20"
                              )}
                              onClick={() => handleUpdateKycStatus(user.id, 'rejected')}
                              disabled={actionLoading || user.kycStatus === 'rejected'}
                              title="Reject KYC"
                            >
                              <XCircle className="w-4 h-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'referrals' && (
            <Card className="bg-card/30 border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <Share2 className="w-5 h-5 text-primary" /> Affiliate Reporting
                </CardTitle>
                <CardDescription>Aggregate performance of all referrers and unique codes.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-black">
                      <tr>
                        <th className="py-4 px-6">Referrer Name / Email</th>
                        <th className="py-4 px-6">Active Code</th>
                        <th className="py-4 px-6 text-center">Total Signups</th>
                        <th className="py-4 px-6 text-center">Conversions</th>
                        <th className="py-4 px-6 text-right">Commission Earned</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {referrerAggregates.length === 0 ? (
                        <tr><td colSpan={5} className="py-20 text-center text-muted-foreground italic">No referral data found in the ledger.</td></tr>
                      ) : referrerAggregates.map((agg: any) => (
                        <tr key={agg.id} className="hover:bg-primary/5 transition-colors">
                          <td className="py-4 px-6">
                            <div className="font-bold text-white">{agg.name || 'Unknown'}</div>
                            <div className="text-[10px] text-muted-foreground uppercase tracking-tight">{agg.email}</div>
                          </td>
                          <td className="py-4 px-6">
                            <Badge variant="outline" className="font-mono text-[10px] uppercase border-primary/20 text-primary">{agg.code}</Badge>
                          </td>
                          <td className="py-4 px-6 text-center">
                            <div className="text-white font-medium">{agg.signups}</div>
                          </td>
                          <td className="py-4 px-6 text-center">
                            <div className="text-emerald-500 font-bold">{agg.conversions}</div>
                          </td>
                          <td className="py-4 px-6 text-right">
                            <div className="text-accent font-bold text-lg">${agg.earnings.toFixed(2)}</div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'broadcasts' && (
            <div className="grid lg:grid-cols-3 gap-8">
              <div className="lg:col-span-1 space-y-6">
                <Card className="bg-card/40 border-primary/20">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-white">
                      <Megaphone className="w-5 h-5 text-primary" /> Send Global Broadcast
                    </CardTitle>
                    <CardDescription>Dispatch a message to all active trader terminals.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleSendBroadcast} className="space-y-4">
                      <div className="space-y-2">
                        <Label className="text-xs font-bold uppercase text-muted-foreground">Subject Header</Label>
                        <Input 
                          placeholder="e.g. Scheduled Maintenance" 
                          value={broadcastForm.title}
                          onChange={e => setBroadcastForm({ ...broadcastForm, title: e.target.value })}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-bold uppercase text-muted-foreground">Announcement Message</Label>
                        <Textarea 
                          placeholder="Enter broadcast content..." 
                          className="min-h-[150px] resize-none"
                          value={broadcastForm.message}
                          onChange={e => setBroadcastForm({ ...broadcastForm, message: e.target.value })}
                          required
                        />
                      </div>
                      <Button type="submit" className="w-full h-12 font-bold cyan-box-glow" disabled={actionLoading}>
                        {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
                        Distribute Broadcast
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              </div>
              
              <div className="lg:col-span-2">
                <Card className="bg-card/30 border-border/50">
                  <CardHeader>
                    <CardTitle className="text-white">Active Announcements</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-black">
                          <tr>
                            <th className="py-4 px-6">Header / Content</th>
                            <th className="py-4 px-6">Sent At</th>
                            <th className="py-4 px-6 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/30">
                          {adminData.broadcasts.length === 0 ? (
                            <tr><td colSpan={3} className="py-20 text-center text-muted-foreground italic">No broadcasts sent yet.</td></tr>
                          ) : adminData.broadcasts.map((b: any) => (
                            <tr key={b.id} className="hover:bg-primary/5">
                              <td className="py-4 px-6">
                                <div className="font-bold text-white mb-1">{b.title}</div>
                                <div className="text-xs text-muted-foreground line-clamp-2">{b.message}</div>
                              </td>
                              <td className="py-4 px-6 text-xs text-muted-foreground whitespace-nowrap">
                                {b.sentAt ? new Date(b.sentAt).toLocaleString() : 'N/A'}
                              </td>
                              <td className="py-4 px-6 text-right">
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="text-destructive hover:bg-destructive/10"
                                  onClick={() => handleDeleteBroadcast(b.id)}
                                  disabled={actionLoading}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {activeTab === 'breaches' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
               <Card className="bg-destructive/5 border-destructive/20 h-fit">
                  <CardHeader><CardTitle className="text-destructive flex items-center gap-2">🔴 HARD BREACH - Account Terminated</CardTitle></CardHeader>
                  <CardContent className="p-0">
                     <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                           <thead className="bg-destructive/10 text-destructive uppercase text-[10px] font-black"><tr><th className="py-3 px-4">Trader</th><th className="py-3 px-4">Reason</th><th className="py-3 px-4 text-right">Date</th></tr></thead>
                           <tbody className="divide-y divide-white/5">
                              {adminData.breaches.filter((b: any) => b.breachType === 'hard').map((b: any) => (
                                 <tr key={b.id} className="hover:bg-destructive/5">
                                    <td className="py-3 px-4 font-bold text-white">{b.userName || b.userEmail}</td>
                                    <td className="py-3 px-4 text-xs text-muted-foreground">{b.breachReason}</td>
                                    <td className="py-3 px-4 text-right text-[10px] text-muted-foreground">{b.breachedAt ? new Date(b.breachedAt).toLocaleDateString() : 'N/A'}</td>
                                 </tr>
                              ))}
                           </tbody>
                        </table>
                        {adminData.breaches.filter((b: any) => b.breachType === 'hard').length === 0 && <div className="p-10 text-center text-muted-foreground italic text-xs">No hard breaches logged.</div>}
                     </div>
                  </CardContent>
               </Card>
            </div>
          )}
        </div>
      </main>

      {/* Proof Preview Modal */}
      <Dialog open={!!viewProofUrl} onOpenChange={() => setViewProofProofUrl(null)}>
        <DialogContent className="max-w-4xl bg-card border-border p-0 overflow-hidden">
          <DialogHeader className="p-4 border-b border-white/5">
            <DialogTitle className="text-white">Document Inspection</DialogTitle>
          </DialogHeader>
          <div className="relative w-full aspect-video bg-black/50">
            {viewProofUrl && (
              <Image 
                src={viewProofUrl} 
                alt="Verification Proof" 
                fill 
                className="object-contain"
                unoptimized
              />
            )}
          </div>
          <DialogFooter className="p-4 bg-secondary/20">
            <Button onClick={() => setViewProofProofUrl(null)}>Close Terminal</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Provision Confirmation Modal */}
      <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <DialogContent className="bg-card border-primary/50">
          <DialogHeader>
            <DialogTitle className="text-primary">Confirm Provisioning</DialogTitle>
            <DialogDescription>Please verify these institutional details carefully.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4 text-sm p-4 bg-secondary/30 rounded-xl">
              <div className="space-y-1"><p className="text-[10px] uppercase text-muted-foreground font-bold">MT5 Login</p><p className="text-lg font-mono font-bold text-white">{provisionForm.login}</p></div>
              <div className="space-y-1"><p className="text-[10px] uppercase text-muted-foreground font-bold">Trader Email</p><p className="text-white truncate">{userSearchTerm}</p></div>
              <div className="space-y-1"><p className="text-[10px] uppercase text-muted-foreground font-bold">Plan</p><p className="text-white">{provisionForm.plan}</p></div>
              <div className="space-y-1"><p className="text-[10px] uppercase text-muted-foreground font-bold">Balance</p><p className="text-white">${Number(provisionForm.size).toLocaleString()}</p></div>
            </div>
            <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg flex gap-3 items-center">
              <AlertTriangle className="text-destructive w-5 h-5 shrink-0" />
              <p className="text-[10px] text-destructive-foreground font-bold leading-tight uppercase">This will immediately update the user's profile and enable the broker sync API for this Login ID.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsConfirmOpen(false)}>Cancel</Button>
            <Button className="bg-primary text-black font-bold px-8" onClick={handleProvisionSubmit} disabled={actionLoading}>
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Finalize Provisioning
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Editor Confirmation Modal */}
      <Dialog open={isEditorConfirmOpen} onOpenChange={setIsEditorConfirmOpen}>
        <DialogContent className="bg-card border-accent/50">
          <DialogHeader>
            <DialogTitle className="text-accent flex items-center gap-2"><AlertTriangle className="w-5 h-5" /> Confirm Profile Update</DialogTitle>
            <DialogDescription>You are about to modify core profile data for <span className="text-white font-bold">{selectedEditorUser?.email}</span>.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-4 bg-secondary/30 rounded-xl space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">New Tier:</span>
                <span className="text-white font-bold">{userEditForm.tier}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">New Status:</span>
                <span className="text-white font-bold uppercase">{userEditForm.status}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Referral Code:</span>
                <span className="text-white font-mono">{userEditForm.referralCode}</span>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground italic">Live sync trading metrics will remain untouched by this operation.</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsEditorConfirmOpen(false)}>Cancel</Button>
            <Button className="bg-accent text-black font-bold px-8" onClick={handleUserEditSubmit} disabled={actionLoading}>
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Commit Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Admin Login Modal */}
      <Dialog open={showAdminModal} onOpenChange={() => {}}>
        <DialogContent className="bg-[#0a0f1e] border-[#00d4ff] text-white sm:max-w-[400px]">
          <DialogHeader className="text-center"><DialogTitle className="text-2xl font-bold text-[#00d4ff]">🔐 Admin Login</DialogTitle></DialogHeader>
          <form onSubmit={handleAdminAuth} className="space-y-6 pt-4">
            <div className="space-y-2"><Label className="text-[10px] font-bold uppercase tracking-widest text-[#00d4ff]">Security Protocol</Label><Input type="password" value={adminPasswordInput} onChange={e => setAdminPasswordInput(e.target.value)} className="bg-background/50 border-white/10 text-center font-mono" autoFocus />{adminError && <p className="text-[10px] text-destructive text-center">{adminError}</p>}</div>
            <Button type="submit" className="w-full bg-[#00d4ff] text-[#0a0f1e] font-bold">Unlock Terminal</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
