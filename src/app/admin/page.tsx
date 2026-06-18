"use client";

import { useState, useMemo, useEffect, memo } from 'react';
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { 
  Eye, Users, ShoppingCart, Wallet, Activity, Search, Loader2, DollarSign, ChevronLeft, Gift, Skull, AlertTriangle, CheckCircle2, ShieldEllipsis, Trophy, Landmark, Terminal, Key, Database, Hash, FileImage, XCircle, CreditCard, Banknote, ShieldCheck, FileText, Fingerprint, RefreshCw, Megaphone, Share2, Trash2, Send, UserCircle, Save, Copy, Edit2, Phone, Calendar, UserPlus, ShoppingBag, AlertOctagon, Clock, ArrowRight, RotateCcw, ShieldAlert, Wifi, Award
} from 'lucide-react';
import { fetchAdminTerminalData, registerMt5AccountAction, advanceTraderPhaseAction, updateOrderStatusAction, updatePayoutStatusAction, processKycAction, forceBreachAccountAction, runRetroactiveRiskAuditAction, sendGlobalBroadcastAction } from './actions';
import DashboardPage from '@/app/dashboard/page';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { formatDistanceToNow, format } from 'date-fns';
import { getTradeDate } from '@/lib/tradeUtils';

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
  const [adminData, setAdminData] = useState<any>({ users: [], orders: [], payouts: [], referrals: [], broadcasts: [], breaches: [], accounts: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const { toast } = useToast();

  // Provisioning Form State
  const [provisionForm, setProvisionForm] = useState({ login: '', password: '', displayLogin: '', plan: '1-Step Pro', size: '100000', userId: '', phase: 'evaluation' });
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  // Broadcast Form State
  const [broadcastForm, setBroadcastForm] = useState({ title: '', message: '', type: 'info' });

  // Force Breach State
  const [isForceBreachOpen, setIsForceBreachOpen] = useState(false);
  const [forceBreachReason, setForceBreachReason] = useState('');

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
      toast({ variant: "destructive", title: "Sync Error", description: "Failed to fetch terminal data." });
    }
    setIsLoading(false);
  };

  useEffect(() => { if (isAuthenticated) refreshData(); }, [isAuthenticated]);

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

  const handleProbeConnection = async () => {
    toast({ title: "Probing Node...", description: "Testing latency to institutional terminals." });
    try {
      const start = Date.now();
      const res = await fetch('/api/health');
      const latency = Date.now() - start;
      if (res.ok) {
        toast({ title: "Node Online", description: `Latency: ${latency}ms. Connection stable.` });
      } else {
        toast({ variant: "destructive", title: "Node Offline", description: "Terminal heartbeat failed." });
      }
    } catch (err) {
      toast({ variant: "destructive", title: "Probe Failed", description: "Network error." });
    }
  };

  const handleRiskAudit = async () => {
    if (!confirm("Run retroactive audit on all active MT5 nodes? This may terminate accounts found in breach.")) return;
    setActionLoading(true);
    try {
      const res = await runRetroactiveRiskAuditAction();
      if (res.success) {
        toast({ title: "Audit Complete", description: `Detected ${res.breachCount} retroactive breaches.` });
        refreshData();
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Audit Failed", description: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleForceBreach = async () => {
    if (!previewUserId || !forceBreachReason) return;
    const targetUser = adminData.users.find((u: any) => u.id === previewUserId);
    const login = targetUser?.mt5Login || 'N/A';
    
    setActionLoading(true);
    try {
      const res = await forceBreachAccountAction(previewUserId, login, forceBreachReason);
      if (res.success) {
        toast({ title: "Account manually breached" });
        setIsForceBreachOpen(false);
        setForceBreachReason('');
        refreshData();
      } else {
        toast({ variant: "destructive", title: "Action Failed", description: "Terminal error during breach execution." });
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fatal Error", description: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleAdvancePhase = async (userId: string) => {
    if (!confirm("Confirm administrative advancement to the next phase?")) return;
    setActionLoading(true);
    const res = await advanceTraderPhaseAction(userId);
    if (res.success) {
      toast({ title: "Phase Advanced Successfully", description: `Trader moved to: ${res.nextPhase?.toUpperCase()}` });
      refreshData();
    } else {
      toast({ variant: "destructive", title: "Advancement Failed" });
    }
    setActionLoading(false);
  };

  const handleUpdateOrderStatus = async (orderId: string, status: string, orderData?: any) => {
    setActionLoading(true);
    const res = await updateOrderStatusAction(orderId, status);
    if (res.success) { 
      toast({ title: `Order ${status.toUpperCase()}` }); 
      
      if (status === 'approved' && orderData) {
        const rawSize = orderData.accountSize || '';
        const numericSize = rawSize.replace(/[$,]/g, '').replace(/k/i, '000');
        
        setProvisionForm(prev => ({
          ...prev,
          userId: orderData.userId,
          plan: orderData.plan,
          size: numericSize
        }));
        setUserSearchTerm(orderData.email);
        setActiveTab('provisioning');
        localStorage.setItem('admin_active_tab', 'provisioning');
      }
      refreshData(); 
    }
    else { toast({ variant: "destructive", title: "Action Failed" }); }
    setActionLoading(false);
  };

  const handleUpdatePayoutStatus = async (payoutId: string, status: 'approved' | 'rejected' | 'done') => {
    setActionLoading(true);
    const res = await updatePayoutStatusAction(payoutId, status);
    if (res.success) { toast({ title: `Payout ${status.toUpperCase()}` }); refreshData(); }
    else { toast({ variant: "destructive", title: "Action Failed" }); }
    setActionLoading(false);
  };

  const handleUpdateKycStatus = async (userId: string, status: 'verified' | 'rejected') => {
    let reason = "";
    if (status === 'rejected') reason = window.prompt("Enter rejection reason:") || "Documents do not meet institutional requirements.";
    setActionLoading(true);
    const res = await processKycAction(userId, status, reason);
    if (res.success) { toast({ title: `KYC ${status === 'verified' ? 'Approved' : 'Rejected'}` }); refreshData(); }
    else { toast({ variant: "destructive", title: "KYC Update Failed" }); }
    setActionLoading(false);
  };

  const handleSendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastForm.title || !broadcastForm.message) return;
    setActionLoading(true);
    try {
      const res = await sendGlobalBroadcastAction(broadcastForm);
      if (res.success) {
        toast({ title: "Broadcast Sent", description: "Annoucement delivered to all nodes." });
        setBroadcastForm({ title: '', message: '', type: 'info' });
        refreshData();
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Broadcast Failed", description: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const filteredUsersForSearch = useMemo(() => {
    if (!userSearchTerm) return [];
    return adminData.users.filter((u: any) => u.email?.toLowerCase().includes(userSearchTerm.toLowerCase()) || u.name?.toLowerCase().includes(userSearchTerm.toLowerCase())).slice(0, 5);
  }, [adminData.users, userSearchTerm]);

  const filteredUsersForDirectory = useMemo(() => {
    if (!searchTerm) return adminData.users;
    const lowerSearch = searchTerm.toLowerCase();
    return adminData.users.filter((u: any) => 
      u.name?.toLowerCase().includes(lowerSearch) || 
      u.email?.toLowerCase().includes(lowerSearch) || 
      u.id?.toLowerCase().includes(lowerSearch) || 
      (u.uid && u.uid.toString().toLowerCase().includes(lowerSearch))
    );
  }, [adminData.users, searchTerm]);

  const stats = useMemo(() => {
    const verifiedOrders = adminData.orders.filter((o: any) => o.status === 'verified' || o.status === 'approved');
    const totalRevenue = verifiedOrders.reduce((acc: number, o: any) => acc + (parseFloat(o.amountPaid) || 0), 0);
    const pendingPayouts = adminData.payouts.filter((p: any) => p.status === 'pending').length;
    return { 
      totalRevenue, 
      totalTraders: adminData.users.length, 
      activeAccounts: adminData.accounts?.filter((a: any) => a.status === 'active').length || 0,
      pendingOrders: adminData.orders.filter((o: any) => o.status === 'pending').length, 
      pendingPayouts 
    };
  }, [adminData]);

  const recentActivity = useMemo(() => {
    const activities: any[] = [];
    adminData.users.forEach((u: any) => activities.push({ id: `signup-${u.id}`, type: 'signup', description: `New trader: ${u.name || u.email}`, timestamp: u.createdAt || u.joinDate, icon: <UserPlus className="w-4 h-4 text-purple-500" />, color: 'purple' }));
    adminData.orders.forEach((o: any) => activities.push({ id: `order-${o.id}`, type: 'order', description: `Order submitted: ${o.accountSize} ${o.plan} by ${o.userName || o.email}`, timestamp: o.submittedAt || o.date, icon: <ShoppingBag className="w-4 h-4 text-primary" />, color: 'blue' }));
    adminData.payouts.forEach((p: any) => activities.push({ id: `payout-${p.id}`, type: 'payout', description: `Payout requested: $${p.amount} by ${p.email}`, timestamp: p.createdAt || p.date, icon: <Banknote className="w-4 h-4 text-emerald-500" />, color: 'green' }));
    adminData.breaches.forEach((b: any) => activities.push({ id: `breach-${b.id}`, type: 'breach', description: `Breach detected: ${b.breachReason} on account ${b.login || b.userId}`, timestamp: b.breachedAt, icon: <AlertOctagon className="w-4 h-4 text-destructive" />, color: 'destructive' }));
    return activities.filter(a => a.timestamp).sort((a, b) => {
      const dateA = getTradeDate(a.timestamp);
      const dateB = getTradeDate(b.timestamp);
      return (dateB?.getTime() || 0) - (dateA?.getTime() || 0);
    }).slice(0, 20);
  }, [adminData]);

  if (previewUserId) {
    const targetUser = adminData.users.find((u: any) => u.id === previewUserId);
    return (
      <div className="min-h-screen bg-background relative">
        <div className="fixed top-0 left-0 w-full z-[100] bg-primary h-14 flex items-center justify-between px-6 shadow-xl">
          <div className="flex items-center gap-4">
            <span className="text-xs font-black uppercase text-primary-foreground">Previewing Trader: {targetUser?.name || previewUserId}</span>
            {targetUser?.readyForNextPhase && (
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white font-black h-8 px-4" onClick={() => handleAdvancePhase(previewUserId)} disabled={actionLoading}>
                {actionLoading ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : <Trophy className="w-3 h-3 mr-2" />}
                Provision Next Phase
              </Button>
            )}
            <Button variant="destructive" size="sm" className="bg-black hover:bg-black/80 text-destructive border border-destructive font-black h-8" onClick={() => setIsForceBreachOpen(true)}>Force Breach Account</Button>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setPreviewUserId(null)}><ChevronLeft className="w-3 h-3 mr-1" /> Exit Preview</Button>
        </div>
        <div className="pt-14"><DashboardPage adminViewMode={true} targetUid={previewUserId} /></div>

        <Dialog open={isForceBreachOpen} onOpenChange={setIsForceBreachOpen}>
          <DialogContent className="bg-card border-destructive">
            <DialogHeader>
              <DialogTitle className="text-destructive flex items-center gap-2"><Skull className="w-5 h-5" /> Manual Account Liquidation</DialogTitle>
              <DialogDescription>Are you sure you want to manually breach this account? This action is immutable.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Breach Reason (For Ledger)</Label>
                <Input 
                  placeholder="e.g. Risk protocol violation detected..." 
                  value={forceBreachReason} 
                  onChange={e => setForceBreachReason(e.target.value)} 
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setIsForceBreachOpen(false)}>Cancel</Button>
              <Button variant="destructive" className="font-bold" onClick={handleForceBreach} disabled={actionLoading || !forceBreachReason}>
                Confirm Manual Breach
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background overflow-hidden relative">
      <Navigation />
      <main className="flex-1 flex flex-col min-h-0">
        <div className="p-8 pb-4 shrink-0">
          <div className="flex flex-col md:flex-row justify-between items-start mb-6 gap-4">
            <div><h1 className="text-4xl font-headline font-bold mb-1 text-white">Administrative Terminal</h1><p className="text-muted-foreground text-sm">Provision institutional nodes and manage trader access.</p></div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleProbeConnection} disabled={actionLoading}><Wifi className="w-4 h-4 mr-2" /> Probe Connection</Button>
              <Button variant="destructive" size="sm" onClick={handleRiskAudit} disabled={actionLoading}><ShieldCheck className="w-4 h-4 mr-2" /> Risk Audit All Accounts</Button>
              <Button variant="outline" size="sm" onClick={refreshData} disabled={isLoading}>{isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Database className="w-4 h-4 mr-2" />}Refresh Data</Button>
            </div>
          </div>
          <Tabs value={activeTab} onValueChange={val => { setActiveTab(val); localStorage.setItem('admin_active_tab', val); }}>
            <TabsList className="bg-secondary/50 h-12 w-full justify-start overflow-x-auto no-scrollbar">
              <TabsTrigger value="overview" className="font-bold">Overview</TabsTrigger>
              <TabsTrigger value="phase_passers" className="font-bold">Phase Passers</TabsTrigger>
              <TabsTrigger value="orders" className="font-bold">Order Review</TabsTrigger>
              <TabsTrigger value="payouts" className="font-bold">Payout Hub</TabsTrigger>
              <TabsTrigger value="provisioning" className="font-bold">MT5 Provisioning</TabsTrigger>
              <TabsTrigger value="user_directory" className="font-bold">User Directory</TabsTrigger>
              <TabsTrigger value="profile_editor" className="font-bold">Profile Editor</TabsTrigger>
              <TabsTrigger value="referral_audit" className="font-bold">Referral Audit</TabsTrigger>
              <TabsTrigger value="broadcasts" className="font-bold">Broadcasts</TabsTrigger>
              <TabsTrigger value="kyc" className="font-bold">KYC Hub</TabsTrigger>
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
              
              <Card className="bg-card/30 border-border/50 overflow-hidden">
                <CardHeader className="flex flex-row items-center justify-between border-b border-white/5 pb-4">
                  <div><CardTitle className="text-xl font-headline text-white flex items-center gap-2"><Activity className="w-5 h-5 text-primary" /> Platform Activity Feed</CardTitle><CardDescription>Real-time log of events across the network.</CardDescription></div>
                  <Badge variant="outline" className="animate-pulse bg-emerald-500/5 text-emerald-500 border-emerald-500/20 uppercase text-[9px] font-black tracking-widest px-3 py-1"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-2" /> Live</Badge>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y divide-white/5">
                    {recentActivity.length === 0 ? <div className="p-20 text-center text-muted-foreground italic text-sm">No recent activity detected.</div> : recentActivity.map((act) => (
                      <div key={act.id} className="p-5 flex items-start gap-4 hover:bg-white/5 transition-colors group">
                        <div className={cn("p-2.5 rounded-xl border shrink-0 transition-transform group-hover:scale-110", act.color === 'purple' && "bg-purple-500/10 border-purple-500/20", act.color === 'blue' && "bg-primary/10 border-primary/20", act.color === 'green' && "bg-emerald-500/10 border-emerald-500/20", act.color === 'destructive' && "bg-destructive/10 border-destructive/20")}>{act.icon}</div>
                        <div className="flex-1 min-w-0"><p className="text-sm font-bold text-white line-clamp-1 mb-1">{act.description}</p><div className="flex items-center gap-3"><span className="text-[10px] uppercase font-black tracking-widest text-muted-foreground flex items-center gap-1.5"><Clock className="w-3 h-3" /> {(() => { const d = getTradeDate(act.timestamp); return d ? formatDistanceToNow(d, { addSuffix: true }) : 'Recently'; })()}</span><span className="text-[10px] text-muted-foreground/30">•</span><span className="text-[10px] uppercase font-bold text-muted-foreground/40">{act.type}</span></div></div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === 'phase_passers' && (
            <div className="space-y-6">
              <Card className="bg-card/30 border-border/50">
                <CardHeader>
                  <CardTitle className="text-white">Phase Passers</CardTitle>
                  <CardDescription>Traders ready for advancement.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                   <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-black tracking-widest">
                        <tr>
                          <th className="py-4 px-6">Trader</th>
                          <th className="py-4 px-4">Plan</th>
                          <th className="py-4 px-4">Phase</th>
                          <th className="py-4 px-4">Login</th>
                          <th className="py-4 px-6 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {adminData.users.filter((u: any) => u.readyForNextPhase).map((u: any) => (
                          <tr key={u.id} className="hover:bg-primary/5 transition-colors">
                            <td className="py-4 px-6 font-bold text-white">{u.name}</td>
                            <td className="py-4 px-4 text-white">{u.accountPlan}</td>
                            <td className="py-4 px-4 uppercase text-xs font-bold text-primary">{u.currentPhase}</td>
                            <td className="py-4 px-4 font-mono text-xs">{u.mt5Login}</td>
                            <td className="py-4 px-6 text-right">
                              <Button size="sm" onClick={() => handleAdvancePhase(u.id)} disabled={actionLoading}>
                                Advance Phase
                              </Button>
                            </td>
                          </tr>
                        ))}
                        {adminData.users.filter((u: any) => u.readyForNextPhase).length === 0 && (
                          <tr><td colSpan={5} className="py-20 text-center text-muted-foreground italic">No traders currently awaiting phase advancement.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === 'orders' && (
            <div className="space-y-6">
              <Card className="bg-card/30 border-border/50">
                <CardHeader><CardTitle className="text-white">Order Review Desk</CardTitle><CardDescription>Manual verification of payments.</CardDescription></CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-black tracking-widest"><tr><th className="py-4 px-6">Trader</th><th className="py-4 px-4">Plan & Size</th><th className="py-4 px-4">Amount</th><th className="py-4 px-4">Network</th><th className="py-4 px-6 text-right">Actions</th></tr></thead>
                      <tbody className="divide-y divide-border/50">
                        {adminData.orders.map((order: any) => (
                          <tr key={order.id} className="hover:bg-primary/5 group">
                            <td className="py-4 px-6"><p className="font-bold text-white">{order.userName || 'Unknown'}</p><p className="text-[10px] text-muted-foreground">{order.email}</p></td>
                            <td className="py-4 px-4"><Badge className="bg-primary/10 text-primary border-primary/20">{order.plan} {order.accountSize}</Badge></td>
                            <td className="py-4 px-4 font-bold text-white">${order.amountPaid}</td>
                            <td className="py-4 px-4 text-xs">{order.network}</td>
                            <td className="py-4 px-6 text-right flex justify-end gap-2">
                              {order.status === 'pending' && (
                                <>
                                  <Button className="bg-emerald-500 text-black font-bold h-8 text-[10px] uppercase" onClick={() => handleUpdateOrderStatus(order.id, 'approved', order)}>Approve</Button>
                                  <Button variant="destructive" className="h-8 text-[10px] font-bold uppercase" onClick={() => handleUpdateOrderStatus(order.id, 'rejected')}>Reject</Button>
                                </>
                              )}
                              {order.status !== 'pending' && <Badge variant="outline" className="uppercase text-[9px]">{order.status}</Badge>}
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

          {activeTab === 'provisioning' && (
            <div className="max-w-4xl mx-auto space-y-8">
              <Card className="bg-card/40 border-primary/20 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-primary" />
                <CardHeader><CardTitle className="text-2xl font-headline text-white flex items-center gap-3"><Terminal className="text-primary w-6 h-6" /> Node Provisioning Terminal</CardTitle><CardDescription>Generate and link official MetaTrader 5 institutional credentials.</CardDescription></CardHeader>
                <CardContent className="space-y-6 pt-6">
                  <div className="space-y-4">
                    <Label className="text-xs uppercase font-black tracking-widest text-primary">1. Locate Recipient</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input placeholder="Search trader by name or email..." className="pl-10 h-12 bg-background border-border" value={userSearchTerm} onChange={e => setUserSearchTerm(e.target.value)} />
                      {filteredUsersForSearch.length > 0 && (
                        <Card className="absolute top-full left-0 w-full z-10 mt-1 border-primary/30 bg-black/90 backdrop-blur-xl">
                          <CardContent className="p-0">
                            {filteredUsersForSearch.map((u: any) => (
                              <button key={u.id} className="w-full px-4 py-3 flex items-center justify-between hover:bg-primary/10 text-left border-b border-white/5 last:border-none group" onClick={() => { setProvisionForm({ ...provisionForm, userId: u.id }); setUserSearchTerm(u.email); }}>
                                <div><p className="font-bold text-white group-hover:text-primary">{u.name}</p><p className="text-[10px] text-muted-foreground">{u.email}</p></div>
                                <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-all" />
                              </button>
                            ))}
                          </CardContent>
                        </Card>
                      )}
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-2"><Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Plan Type</Label><Select value={provisionForm.plan} onValueChange={val => setProvisionForm({...provisionForm, plan: val})}><SelectTrigger className="h-11 bg-background border-border"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="1-Step Pro">1-Step Pro</SelectItem><SelectItem value="2-Step Classic">2-Step Classic</SelectItem><SelectItem value="3-Step Classic">3-Step Classic</SelectItem><SelectItem value="Instant Funding">Instant Funding</SelectItem></SelectContent></Select></div>
                    <div className="space-y-2"><Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Initial Balance ($)</Label><Input value={provisionForm.size} onChange={e => setProvisionForm({...provisionForm, size: e.target.value})} placeholder="e.g. 100000" className="h-11 bg-background border-border" /></div>
                    <div className="space-y-2"><Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">MT5 Login ID</Label><Input value={provisionForm.login} onChange={e => setProvisionForm({...provisionForm, login: e.target.value})} placeholder="e.g. 505183..." className="h-11 bg-background border-border" /></div>
                    <div className="space-y-2"><Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">MT5 Master Password</Label><Input value={provisionForm.password} onChange={e => setProvisionForm({...provisionForm, password: e.target.value})} placeholder="Master key..." className="h-11 bg-background border-border" /></div>
                  </div>
                </CardContent>
                <CardFooter className="bg-secondary/20 p-6 flex justify-end"><Button className="h-12 px-10 font-bold text-lg cyan-box-glow" disabled={actionLoading || !provisionForm.userId || !provisionForm.login} onClick={() => setIsConfirmOpen(true)}>{actionLoading ? <Loader2 className="animate-spin mr-2" /> : <ShieldCheck className="mr-2 w-5 h-5" />}Authorize Node Provisioning</Button></CardFooter>
              </Card>

              <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
                <DialogContent className="bg-black border-primary/20 text-white">
                  <DialogHeader><DialogTitle>Verify Provisioning Details</DialogTitle><DialogDescription>Provision institutional capital access for {userSearchTerm}.</DialogDescription></DialogHeader>
                  <DialogFooter><Button variant="ghost" onClick={() => setIsConfirmOpen(false)}>Abort</Button><Button className="bg-primary text-black font-bold" onClick={async () => { setActionLoading(true); const res = await registerMt5AccountAction({...provisionForm, size: Number(provisionForm.size)}); if (res.success) { toast({ title: "Node Provisioned" }); setProvisionForm({ login: '', password: '', displayLogin: '', plan: '1-Step Pro', size: '100000', userId: '', phase: 'evaluation' }); setUserSearchTerm(''); refreshData(); } setActionLoading(false); setIsConfirmOpen(false); }}>Confirm Activation</Button></DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          )}

          {activeTab === 'user_directory' && (
            <div className="space-y-6">
              <div className="relative mb-6">
                 <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                 <Input placeholder="Search directory..." className="pl-10 h-12 bg-secondary/30 border-border/50 text-white rounded-xl" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
              </div>
              <Card className="bg-card/30 border-border/50 overflow-hidden">
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-black tracking-widest">
                        <tr>
                          <th className="py-4 px-6">Trader</th>
                          <th className="py-4 px-4">Email</th>
                          <th className="py-4 px-4">Phone</th>
                          <th className="py-4 px-4">UID</th>
                          <th className="py-4 px-4">Status</th>
                          <th className="py-4 px-6 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {filteredUsersForDirectory.map((u: any) => (
                          <tr key={u.id} className="hover:bg-primary/5 transition-colors">
                            <td className="py-4 px-6 font-bold text-white">{u.name || 'Anonymous'}</td>
                            <td className="py-4 px-4 text-white">{u.email}</td>
                            <td className="py-4 px-4 text-white">{u.phone || '—'}</td>
                            <td className="py-4 px-4 font-mono text-xs text-primary">{u.uid || '--------'}</td>
                            <td className="py-4 px-4"><Badge className={cn("text-[10px] uppercase font-black", u.status === 'active' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-destructive/10 text-destructive')}>{u.status || 'active'}</Badge></td>
                            <td className="py-4 px-6 text-right"><button onClick={() => setPreviewUserId(u.id)} className="p-2 hover:bg-white/5 rounded-lg transition-colors"><Eye className="w-4 h-4 text-muted-foreground hover:text-white" /></button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === 'profile_editor' && (
            <div className="space-y-6">
              <Card className="bg-card/30 border-border/50">
                <CardHeader>
                  <CardTitle className="text-white">Profile Editor</CardTitle>
                  <CardDescription>Administrative control over user institutional records.</CardDescription>
                </CardHeader>
                <CardContent className="p-20 text-center text-muted-foreground italic">
                  Select a user from the directory to manually override profile fields.
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === 'referral_audit' && (
            <div className="space-y-6">
              <Card className="bg-card/30 border-border/50">
                <CardHeader>
                  <CardTitle className="text-white">Referral Audit</CardTitle>
                  <CardDescription>Commission verification and multi-tier network analysis.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                   <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-black tracking-widest">
                        <tr>
                          <th className="py-4 px-6">Referrer ID</th>
                          <th className="py-4 px-4">Referred User</th>
                          <th className="py-4 px-4">Signup Date</th>
                          <th className="py-4 px-6 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {adminData.referrals.map((ref: any) => (
                          <tr key={ref.id} className="hover:bg-primary/5 transition-colors">
                            <td className="py-4 px-6 font-mono text-xs text-white">{ref.referrerId}</td>
                            <td className="py-4 px-4">
                              <p className="text-white font-bold">{ref.referredUserEmail}</p>
                              <p className="text-[10px] text-muted-foreground">{ref.referredUserId}</p>
                            </td>
                            <td className="py-4 px-4 text-muted-foreground">{ref.createdAt ? format(new Date(ref.createdAt.seconds * 1000), 'yyyy-MM-dd') : 'N/A'}</td>
                            <td className="py-4 px-6 text-right">
                              <Badge className={cn("uppercase text-[10px]", ref.status === 'paid' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500')}>
                                {ref.status}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                        {adminData.referrals.length === 0 && (
                           <tr><td colSpan={4} className="py-20 text-center text-muted-foreground italic">No referral records detected.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === 'broadcasts' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-1 space-y-6">
                <Card className="bg-card/40 border-primary/20">
                  <CardHeader><CardTitle className="text-white">New Broadcast</CardTitle><CardDescription>Send a platform-wide alert.</CardDescription></CardHeader>
                  <CardContent>
                    <form onSubmit={handleSendBroadcast} className="space-y-4">
                      <div className="space-y-2"><Label>Title</Label><Input value={broadcastForm.title} onChange={e => setBroadcastForm({...broadcastForm, title: e.target.value})} placeholder="e.g. System Maintenance" /></div>
                      <div className="space-y-2"><Label>Message</Label><Textarea value={broadcastForm.message} onChange={e => setBroadcastForm({...broadcastForm, message: e.target.value})} placeholder="Announcement details..." rows={5} /></div>
                      <div className="space-y-2"><Label>Type</Label><Select value={broadcastForm.type} onValueChange={v => setBroadcastForm({...broadcastForm, type: v})}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="info">Information</SelectItem><SelectItem value="success">Success</SelectItem><SelectItem value="warning">Warning</SelectItem><SelectItem value="alert">Alert</SelectItem></SelectContent></Select></div>
                      <Button className="w-full font-bold" disabled={actionLoading || !broadcastForm.title}><Send className="w-4 h-4 mr-2" /> Send Broadcast</Button>
                    </form>
                  </CardContent>
                </Card>
              </div>
              <div className="lg:col-span-2">
                <Card className="bg-card/30 border-border/50">
                  <CardHeader><CardTitle className="text-white">Broadcast History</CardTitle></CardHeader>
                  <CardContent className="p-0">
                    <div className="divide-y divide-white/5">
                      {adminData.broadcasts.sort((a:any, b:any) => (b.sentAt?.seconds || 0) - (a.sentAt?.seconds || 0)).map((b: any) => (
                        <div key={b.id} className="p-6 space-y-2 hover:bg-white/5 transition-colors">
                          <div className="flex justify-between items-start">
                             <Badge variant="outline" className="uppercase text-[9px]">{b.type}</Badge>
                             <span className="text-[10px] text-muted-foreground uppercase font-black">{b.sentAt ? formatDistanceToNow(new Date(b.sentAt.seconds * 1000), { addSuffix: true }) : 'Recently'}</span>
                          </div>
                          <h4 className="font-bold text-white">{b.title}</h4>
                          <p className="text-sm text-muted-foreground line-clamp-2">{b.message}</p>
                        </div>
                      ))}
                      {adminData.broadcasts.length === 0 && (
                        <div className="p-20 text-center text-muted-foreground italic text-sm">No previous broadcasts recorded.</div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {activeTab === 'kyc' && (
             <div className="space-y-6">
              <Card className="bg-card/30 border-border/50">
                <CardHeader>
                  <CardTitle className="text-white">KYC Review Hub</CardTitle>
                  <CardDescription>Manage identity verification requests.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                   <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-black tracking-widest">
                        <tr>
                          <th className="py-4 px-6">Trader</th>
                          <th className="py-4 px-4">Email</th>
                          <th className="py-4 px-4">Submitted At</th>
                          <th className="py-4 px-4">Status</th>
                          <th className="py-4 px-6 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {adminData.users.filter((u: any) => u.kycStatus && u.kycStatus !== 'none').map((u: any) => (
                          <tr key={u.id} className="hover:bg-primary/5 transition-colors">
                            <td className="py-4 px-6 font-bold text-white">{u.name}</td>
                            <td className="py-4 px-4 text-muted-foreground">{u.email}</td>
                            <td className="py-4 px-4 text-xs">{u.kycSubmittedAt ? format(new Date(u.kycSubmittedAt), 'yyyy-MM-dd HH:mm') : 'N/A'}</td>
                            <td className="py-4 px-4">
                              <Badge className={cn("uppercase text-[9px]", u.kycStatus === 'verified' ? 'bg-emerald-500/10 text-emerald-500' : u.kycStatus === 'pending' ? 'bg-amber-500/10 text-amber-500' : 'bg-destructive/10 text-destructive')}>
                                {u.kycStatus}
                              </Badge>
                            </td>
                            <td className="py-4 px-6 text-right flex justify-end gap-2">
                               <button onClick={() => setPreviewUserId(u.id)} className="p-2 hover:bg-white/5 rounded-lg text-primary"><Eye className="w-4 h-4" /></button>
                               {u.kycStatus === 'pending' && (
                                 <>
                                   <Button className="h-8 text-[10px] bg-emerald-500 text-black font-bold uppercase" onClick={() => handleUpdateKycStatus(u.id, 'verified')}>Approve</Button>
                                   <Button variant="destructive" className="h-8 text-[10px] font-bold uppercase" onClick={() => handleUpdateKycStatus(u.id, 'rejected')}>Reject</Button>
                                 </>
                               )}
                            </td>
                          </tr>
                        ))}
                        {adminData.users.filter((u: any) => u.kycStatus && u.kycStatus !== 'none').length === 0 && (
                          <tr><td colSpan={5} className="py-20 text-center text-muted-foreground italic">No KYC submissions found.</td></tr>
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
              <Card className="bg-card/30 border-border/50">
                <CardHeader>
                  <CardTitle className="text-white">Risk Breach Ledger</CardTitle>
                  <CardDescription>History of liquidated accounts across the network.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                   <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-black tracking-widest">
                        <tr>
                          <th className="py-4 px-6">Trader</th>
                          <th className="py-4 px-4">Account ID</th>
                          <th className="py-4 px-4">Breach Type</th>
                          <th className="py-4 px-4">Date</th>
                          <th className="py-4 px-6 text-right">Reason</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {adminData.breaches.sort((a: any, b: any) => (b.breachedAt?.seconds || 0) - (a.breachedAt?.seconds || 0)).map((b: any) => (
                          <tr key={b.id} className="hover:bg-destructive/5 transition-colors">
                            <td className="py-4 px-6 font-bold text-white">{b.userName || 'N/A'}</td>
                            <td className="py-4 px-4 font-mono text-xs">{b.login || 'N/A'}</td>
                            <td className="py-4 px-4 uppercase text-[10px] font-black text-destructive">{b.breachType || 'Hard'}</td>
                            <td className="py-4 px-4 text-xs text-muted-foreground">{b.breachedAt ? format(new Date(b.breachedAt.seconds * 1000), 'yyyy-MM-dd HH:mm') : 'N/A'}</td>
                            <td className="py-4 px-6 text-right text-xs text-muted-foreground truncate max-w-[200px]">{b.breachReason || b.reason}</td>
                          </tr>
                        ))}
                        {adminData.breaches.length === 0 && (
                           <tr><td colSpan={5} className="py-20 text-center text-muted-foreground italic">Zero records found in the risk ledger.</td></tr>
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
        <DialogContent className="bg-black/95 backdrop-blur-2xl border-primary/30 text-white shadow-2xl">
          <DialogHeader className="space-y-4 pt-4">
             <div className="flex justify-center"><div className="p-4 bg-primary/10 rounded-[2rem] border border-primary/20 shadow-[0_0_30px_rgba(17,179,245,0.2)]"><Terminal className="w-12 h-12 text-primary" /></div></div>
             <DialogTitle className="text-4xl font-headline font-bold text-center">PrimeFunded Terminal</DialogTitle>
             <DialogDescription className="text-center text-muted-foreground uppercase text-[10px] font-black tracking-[0.4em]">Administrative Level Access Required</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAdminAuth} className="space-y-6 pt-6">
            <div className="space-y-3">
              <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest pl-1">Protocol Master Key</Label>
              <Input type="password" value={adminPasswordInput} onChange={(e) => setAdminPasswordInput(e.target.value)} placeholder="••••••••••••••••••••" className="h-14 bg-white/5 border-white/10 text-center text-xl tracking-[0.5em] focus:border-primary/50 transition-all font-mono" autoFocus />
              {adminError && <p className="text-destructive text-center text-xs font-bold uppercase animate-shake">{adminError}</p>}
            </div>
            <Button type="submit" className="w-full h-14 font-black text-lg cyan-box-glow">AUTHENTICATE SESSION</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
