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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { 
  Eye, Users, ShoppingCart, Wallet, Activity, Search, Loader2, DollarSign, ChevronLeft, Gift, Skull, AlertTriangle, CheckCircle2, ShieldEllipsis, Trophy, Landmark, Terminal, Key, Database, Hash, FileImage, XCircle, CreditCard, Banknote, ShieldCheck, FileText, Fingerprint, RefreshCw, Megaphone, Share2, Trash2, Send, UserCircle, Save, Copy, Edit2, Phone, Calendar, UserPlus, ShoppingBag, AlertOctagon, Clock, ArrowRight, RotateCcw
} from 'lucide-react';
import { fetchAdminTerminalData, registerMt5AccountAction, updateOrderStatusAction, updatePayoutStatusAction, processKycAction, createBroadcastAction, deleteBroadcastAction, updateUserProfileAction, logSoftBreachAction, resetPhaseProgressAction } from './actions';
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
  const [provisionForm, setProvisionForm] = useState({ login: '', password: '', displayLogin: '', plan: '1-Step Pro', size: '100000', userId: '', phase: 'evaluation' });
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [provisionResult, setProvisionResult] = useState<{ docId: string, login: string } | null>(null);

  // User Editor State
  const [editorSearchTerm, setEditorSearchTerm] = useState('');
  const [selectedEditorUser, setSelectedEditorUser] = useState<any>(null);
  const [userEditForm, setUserEditForm] = useState({ name: '', phone: '', country: '', referralCode: '', tier: 'Bronze', status: 'active' });
  const [isEditorConfirmOpen, setIsEditorConfirmOpen] = useState(false);

  // Soft Breach State
  const [isSoftBreachOpen, setIsSoftBreachOpen] = useState(false);
  const [softBreachForm, setSoftBreachForm] = useState({ reason: 'Holding over the weekend', note: '' });

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

  const handleLogSoftBreach = async () => {
    if (!previewUserId) return;
    setActionLoading(true);
    const res = await logSoftBreachAction(previewUserId, softBreachForm.reason, softBreachForm.note);
    if (res.success) {
      toast({ title: "Soft Breach Recorded", description: "Trader notified and flagged for phase reset." });
      setIsSoftBreachOpen(false);
      refreshData();
    } else {
      toast({ variant: "destructive", title: "Action Failed", description: res.error });
    }
    setActionLoading(false);
  };

  const handleResetPhase = async (userId: string) => {
    if (!confirm("Confirm phase reset? This will wipe current progress and return trader to starting balance.")) return;
    setActionLoading(true);
    const res = await resetPhaseProgressAction(userId);
    if (res.success) {
      toast({ title: "Phase Reset Successful" });
      refreshData();
    } else {
      toast({ variant: "destructive", title: "Reset Failed", description: res.error });
    }
    setActionLoading(false);
  };

  const handleUpdateOrderStatus = async (orderId: string, status: 'verified' | 'rejected', reason?: string) => {
    setActionLoading(true);
    const res = await updateOrderStatusAction(orderId, status);
    if (res.success) { toast({ title: `Order ${status.toUpperCase()}` }); refreshData(); }
    else { toast({ variant: "destructive", title: "Action Failed", description: res.error }); }
    setActionLoading(false);
  };

  const handleUpdatePayoutStatus = async (payoutId: string, status: 'approved' | 'rejected' | 'done', reason?: string) => {
    setActionLoading(true);
    const res = await updatePayoutStatusAction(payoutId, status);
    if (res.success) { toast({ title: `Payout ${status.toUpperCase()}` }); refreshData(); }
    else { toast({ variant: "destructive", title: "Action Failed", description: res.error }); }
    setActionLoading(false);
  };

  const handleUpdateKycStatus = async (userId: string, status: 'verified' | 'rejected') => {
    let reason = "";
    if (status === 'rejected') reason = window.prompt("Enter rejection reason:") || "Documents do not meet institutional requirements.";
    setActionLoading(true);
    const res = await processKycAction(userId, status, reason);
    if (res.success) { toast({ title: `KYC ${status === 'verified' ? 'Approved' : 'Rejected'}` }); refreshData(); }
    else { toast({ variant: "destructive", title: "KYC Update Failed", description: res.error }); }
    setActionLoading(false);
  };

  const handleSendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastForm.title || !broadcastForm.message) return;
    setActionLoading(true);
    const res = await createBroadcastAction(broadcastForm.title, broadcastForm.message);
    if (res.success) { toast({ title: "Broadcast Published" }); setBroadcastForm({ title: '', message: '' }); refreshData(); }
    else { toast({ variant: "destructive", title: "Publish Error", description: res.error }); }
    setActionLoading(false);
  };

  const handleDeleteBroadcast = async (id: string) => {
    if (!confirm("Permanently delete this broadcast?")) return;
    setActionLoading(true);
    const res = await deleteBroadcastAction(id);
    if (res.success) { toast({ title: "Broadcast Deleted" }); refreshData(); }
    else { toast({ variant: "destructive", title: "Delete Error", description: res.error }); }
    setActionLoading(false);
  };

  const handleUserEditSubmit = async () => {
    if (!selectedEditorUser) return;
    setActionLoading(true);
    const res = await updateUserProfileAction(selectedEditorUser.id, userEditForm);
    if (res.success) { toast({ title: "Profile Synchronized" }); setIsEditorConfirmOpen(false); refreshData(); }
    else { toast({ variant: "destructive", title: "Update Failed", description: res.error }); }
    setActionLoading(false);
  };

  const filteredUsersForSearch = useMemo(() => {
    if (!userSearchTerm) return [];
    return adminData.users.filter((u: any) => u.email?.toLowerCase().includes(userSearchTerm.toLowerCase()) || u.name?.toLowerCase().includes(userSearchTerm.toLowerCase())).slice(0, 5);
  }, [adminData.users, userSearchTerm]);

  const filteredUsersForEditor = useMemo(() => {
    if (!editorSearchTerm) return [];
    return adminData.users.filter((u: any) => u.email?.toLowerCase().includes(editorSearchTerm.toLowerCase()) || u.name?.toLowerCase().includes(editorSearchTerm.toLowerCase())).slice(0, 5);
  }, [adminData.users, editorSearchTerm]);

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
    const verifiedOrders = adminData.orders.filter((o: any) => o.status === 'verified');
    const totalRevenue = verifiedOrders.reduce((acc: number, o: any) => acc + (parseFloat(o.amountPaid) || 0), 0);
    const pendingPayouts = adminData.payouts.filter((p: any) => p.status === 'pending').length;
    return { totalRevenue, totalTraders: adminData.users.length, verifiedCount: verifiedOrders.length, pendingOrders: adminData.orders.filter((o: any) => o.status === 'pending').length, pendingPayouts };
  }, [adminData]);

  const recentActivity = useMemo(() => {
    const activities: any[] = [];
    adminData.users.forEach((u: any) => activities.push({ id: `signup-${u.id}`, type: 'signup', description: `New trader: ${u.name || u.email}`, timestamp: u.createdAt || u.joinDate, icon: <UserPlus className="w-4 h-4 text-purple-500" />, color: 'purple' }));
    adminData.orders.forEach((o: any) => activities.push({ id: `order-${o.id}`, type: 'order', description: `Order submitted: ${o.accountSize} ${o.plan} by ${o.userName || o.email}`, timestamp: o.submittedAt || o.date, icon: <ShoppingBag className="w-4 h-4 text-primary" />, color: 'blue' }));
    adminData.payouts.forEach((p: any) => activities.push({ id: `payout-${p.id}`, type: 'payout', description: `Payout requested: $${p.amount} by ${p.email}`, timestamp: p.createdAt || p.date, icon: <Banknote className="w-4 h-4 text-emerald-500" />, color: 'green' }));
    adminData.breaches.forEach((b: any) => activities.push({ id: `breach-${b.id}`, type: 'breach', description: `Breach detected: ${b.breachReason} on account ${b.login || b.userId}`, timestamp: b.breachedAt, icon: <AlertOctagon className="w-4 h-4 text-destructive" />, color: 'destructive' }));
    return activities.filter(a => a.timestamp).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 20);
  }, [adminData]);

  const referrerAggregates = useMemo(() => {
    const referrersMap = new Map();
    adminData.users.forEach((u: any) => { if (u.referralCode) referrersMap.set(u.id, { id: u.id, email: u.email, name: u.name, code: u.referralCode, signups: 0, earnings: 0, conversions: 0, referrals: [] }); });
    adminData.referrals.forEach((ref: any) => {
      const agg = referrersMap.get(ref.referrerId);
      if (agg) {
        agg.signups += 1;
        if ((ref.amount || 0) > 0) { agg.earnings += (ref.amount || 0); agg.conversions += 1; }
        else if (ref.status === 'converted') { agg.earnings += 30; agg.conversions += 1; }
        agg.referrals.push(ref);
      }
    });
    return Array.from(referrersMap.values()).filter((agg: any) => agg.signups > 0 || agg.earnings > 0);
  }, [adminData.users, adminData.referrals]);

  // Dynamic Phase Logic for MT5 Provisioning
  const availablePhases = useMemo(() => {
    const p = provisionForm.plan.toLowerCase();
    if (p.includes('1-step')) return [{ label: "Evaluation Phase", value: "evaluation" }, { label: "Funded", value: "funded" }];
    if (p.includes('2-step')) return [{ label: "Phase 1: Evaluation", value: "phase1" }, { label: "Phase 2: Verification", value: "phase2" }, { label: "Funded", value: "funded" }];
    if (p.includes('3-step')) return [{ label: "Phase 1", value: "phase1" }, { label: "Phase 2", value: "phase2" }, { label: "Phase 3", value: "phase3" }, { label: "Funded", value: "funded" }];
    return [{ label: "Funded", value: "funded" }];
  }, [provisionForm.plan]);

  useEffect(() => {
    if (provisionForm.plan.toLowerCase().includes('instant')) {
      setProvisionForm(prev => ({ ...prev, phase: 'funded' }));
    } else {
      setProvisionForm(prev => ({ ...prev, phase: availablePhases[0]?.value || 'evaluation' }));
    }
  }, [provisionForm.plan, availablePhases]);

  if (previewUserId) {
    return (
      <div className="min-h-screen bg-background relative">
        <div className="fixed top-0 left-0 w-full z-[100] bg-primary h-14 flex items-center justify-between px-6 shadow-xl">
          <div className="flex items-center gap-4">
            <span className="text-xs font-black uppercase text-primary-foreground">Previewing Trader: {previewUserId}</span>
            <Button variant="secondary" size="sm" className="bg-destructive hover:bg-destructive/90 text-white font-bold h-8" onClick={() => setIsSoftBreachOpen(true)}>Log Soft Breach</Button>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setPreviewUserId(null)}><ChevronLeft className="w-3 h-3 mr-1" /> Exit Preview</Button>
        </div>
        <div className="pt-14"><DashboardPage adminViewMode={true} targetUid={previewUserId} /></div>

        <Dialog open={isSoftBreachOpen} onOpenChange={setIsSoftBreachOpen}>
          <DialogContent className="bg-card border-amber-500/50">
            <DialogHeader><DialogTitle className="text-amber-500">Manual Soft Breach Logging</DialogTitle><DialogDescription>Issue a warning or phase reset requirement to this trader.</DialogDescription></DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Violation Reason</Label>
                <Select value={softBreachForm.reason} onValueChange={v => setSoftBreachForm({...softBreachForm, reason: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Holding over the weekend">Holding over the weekend</SelectItem>
                    <SelectItem value="Copying unauthorized external signals">Copying signals</SelectItem>
                    <SelectItem value="Inconsistent execution patterns">Inconsistent patterns</SelectItem>
                    <SelectItem value="Other">Other Violation</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Administrative Note</Label><Textarea placeholder="Details for trader/ledger..." value={softBreachForm.note} onChange={e => setSoftBreachForm({...softBreachForm, note: e.target.value})} /></div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setIsSoftBreachOpen(false)}>Cancel</Button>
              <Button className="bg-amber-500 text-black font-bold" onClick={handleLogSoftBreach} disabled={actionLoading}>Commit Soft Breach</Button>
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
            <div className="flex gap-2"><Button variant="outline" size="sm" onClick={refreshData} disabled={isLoading}>{isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Database className="w-4 h-4 mr-2" />}Refresh Data</Button></div>
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
                        <div className="flex-1 min-w-0"><p className="text-sm font-bold text-white line-clamp-1 mb-1">{act.description}</p><div className="flex items-center gap-3"><span className="text-[10px] uppercase font-black tracking-widest text-muted-foreground flex items-center gap-1.5"><Clock className="w-3 h-3" /> {formatDistanceToNow(new Date(act.timestamp), { addSuffix: true })}</span><span className="text-[10px] text-muted-foreground/30">•</span><span className="text-[10px] uppercase font-bold text-muted-foreground/40">{act.type}</span></div></div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === 'breaches' && (
            <div className="space-y-8">
               <Card className="bg-destructive/5 border-destructive/20 h-fit">
                  <CardHeader><CardTitle className="text-destructive flex items-center gap-2">🔴 HARD BREACH - Account Terminated</CardTitle><CardDescription>Immediate liquidation triggered by mathematical drawdown or lot scaling violation.</CardDescription></CardHeader>
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

               <Card className="bg-amber-500/5 border-amber-500/20 h-fit">
                  <CardHeader><CardTitle className="text-amber-500 flex items-center gap-2">⚠️ SOFT BREACH - Warning / Reset Issued</CardTitle><CardDescription>Violations requiring a phase reset rather than termination.</CardDescription></CardHeader>
                  <CardContent className="p-0">
                     <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                           <thead className="bg-amber-500/10 text-amber-500 uppercase text-[10px] font-black"><tr><th className="py-3 px-4">Trader</th><th className="py-3 px-4">Reason</th><th className="py-3 px-4">Date</th><th className="py-3 px-4 text-right">Actions</th></tr></thead>
                           <tbody className="divide-y divide-white/5">
                              {adminData.breaches.filter((b: any) => b.breachType === 'soft').map((b: any) => (
                                 <tr key={b.id} className="hover:bg-amber-500/5">
                                    <td className="py-3 px-4 font-bold text-white">{b.userName || b.userEmail}</td>
                                    <td className="py-3 px-4 text-xs text-muted-foreground">{b.breachReason}</td>
                                    <td className="py-3 px-4 text-[10px] text-muted-foreground">{b.breachedAt ? new Date(b.breachedAt).toLocaleDateString() : 'N/A'}</td>
                                    <td className="py-3 px-4 text-right">
                                       <Button variant="outline" size="sm" className="h-8 text-[10px] font-black uppercase border-amber-500/20 text-amber-500 hover:bg-amber-500 hover:text-black" onClick={() => handleResetPhase(b.userId)}>
                                          <RotateCcw className="w-3 h-3 mr-1" /> Reset Progress
                                       </Button>
                                    </td>
                                 </tr>
                              ))}
                           </tbody>
                        </table>
                        {adminData.breaches.filter((b: any) => b.breachType === 'soft').length === 0 && <div className="p-10 text-center text-muted-foreground italic text-xs">No soft breaches logged.</div>}
                     </div>
                  </CardContent>
               </Card>
            </div>
          )}

          {activeTab === 'orders' && (
            <div className="space-y-6">
              <Card className="bg-card/30 border-border/50">
                <CardHeader><CardTitle className="text-white">Pending Verification</CardTitle><CardDescription>Manual review of blockchain proofs required.</CardDescription></CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-black tracking-widest"><tr><th className="py-4 px-6">Trader</th><th className="py-4 px-4">Plan & Size</th><th className="py-4 px-4">Amount</th><th className="py-4 px-4">Network</th><th className="py-4 px-4">TX Hash</th><th className="py-4 px-6 text-right">Actions</th></tr></thead>
                      <tbody className="divide-y divide-border/50">
                        {adminData.orders.filter((o: any) => o.status === 'pending').map((order: any) => (
                          <tr key={order.id} className="hover:bg-primary/5 group">
                            <td className="py-4 px-6"><p className="font-bold text-white">{order.userName || 'Unknown'}</p><p className="text-[10px] text-muted-foreground">{order.email}</p></td>
                            <td className="py-4 px-4"><Badge className="bg-primary/10 text-primary border-primary/20">{order.plan} {order.accountSize}</Badge></td>
                            <td className="py-4 px-4 font-bold text-white">${order.amountPaid}</td>
                            <td className="py-4 px-4 text-xs">{order.network}</td>
                            <td className="py-4 px-4"><TooltipProvider><Tooltip><TooltipTrigger className="font-mono text-[9px] text-primary truncate max-w-[100px] block cursor-help">{order.txHash}</TooltipTrigger><TooltipContent className="bg-black text-white border-primary/20 max-w-xs break-all p-2 font-mono text-[10px]">{order.txHash}</TooltipContent></Tooltip></TooltipProvider></td>
                            <td className="py-4 px-6 text-right flex justify-end gap-2">
                              {order.paymentScreenshot && <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => setViewProofProofUrl(order.paymentScreenshot)}><FileImage className="w-4 h-4" /></Button>}
                              <Button className="bg-emerald-500 text-black font-bold h-8 text-[10px] uppercase" onClick={() => handleUpdateOrderStatus(order.id, 'verified')}>Approve</Button>
                              <Button variant="destructive" className="h-8 text-[10px] font-bold uppercase" onClick={() => handleUpdateOrderStatus(order.id, 'rejected')}>Reject</Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {adminData.orders.filter((o: any) => o.status === 'pending').length === 0 && <div className="p-20 text-center text-muted-foreground italic">No pending orders.</div>}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === 'payouts' && (
            <div className="space-y-6">
              <Card className="bg-card/30 border-border/50">
                <CardHeader><CardTitle className="text-white">Active Withdrawal Requests</CardTitle><CardDescription>Institutional profit distributions awaiting dispatch.</CardDescription></CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-black tracking-widest"><tr><th className="py-4 px-6">Trader</th><th className="py-4 px-4">Amount</th><th className="py-4 px-4">Method</th><th className="py-4 px-4">Address</th><th className="py-4 px-4">Date</th><th className="py-4 px-6 text-right">Actions</th></tr></thead>
                      <tbody className="divide-y divide-border/50">
                        {adminData.payouts.filter((p: any) => p.status === 'pending').map((payout: any) => (
                          <tr key={payout.id} className="hover:bg-primary/5">
                            <td className="py-4 px-6"><p className="font-bold text-white">{payout.email}</p><p className="text-[10px] text-muted-foreground">UID: {payout.userId?.slice(-6)}</p></td>
                            <td className="py-4 px-4 font-bold text-emerald-500">${payout.amount}</td>
                            <td className="py-4 px-4 font-black uppercase text-[10px]">{payout.method}</td>
                            <td className="py-4 px-4 font-mono text-[9px] text-muted-foreground">{payout.address}</td>
                            <td className="py-4 px-4 text-xs">{payout.date ? new Date(payout.date).toLocaleDateString() : 'N/A'}</td>
                            <td className="py-4 px-6 text-right flex justify-end gap-2">
                              <Button className="bg-primary text-black font-bold h-8 text-[10px] uppercase" onClick={() => handleUpdatePayoutStatus(payout.id, 'done')}>Mark Paid</Button>
                              <Button variant="outline" className="h-8 text-[10px] font-bold uppercase border-destructive/30 text-destructive" onClick={() => handleUpdatePayoutStatus(payout.id, 'rejected')}>Deny</Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {adminData.payouts.filter((p: any) => p.status === 'pending').length === 0 && <div className="p-20 text-center text-muted-foreground italic">Zero active withdrawal requests.</div>}
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
                    <div className="space-y-2"><Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Initial Balance ($)</Label><Select value={provisionForm.size} onValueChange={val => setProvisionForm({...provisionForm, size: val})}><SelectTrigger className="h-11 bg-background border-border"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="5000">5,000</SelectItem><SelectItem value="10000">10,000</SelectItem><SelectItem value="25000">25,000</SelectItem><SelectItem value="50000">50,000</SelectItem><SelectItem value="100000">10,0000</SelectItem><SelectItem value="200000">200,000</SelectItem><SelectItem value="300000">300,000</SelectItem></SelectContent></Select></div>
                    {!provisionForm.plan.toLowerCase().includes('instant') && (
                      <div className="space-y-2">
                        <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Initial Phase</Label>
                        <Select value={provisionForm.phase} onValueChange={val => setProvisionForm({...provisionForm, phase: val})}>
                          <SelectTrigger className="h-11 bg-background border-border"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {availablePhases.map(p => (
                              <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div className="space-y-2"><Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">MT5 Login ID</Label><Input value={provisionForm.login} onChange={e => setProvisionForm({...provisionForm, login: e.target.value})} placeholder="e.g. 505183..." className="h-11 bg-background border-border" /></div>
                    <div className="space-y-2"><Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">MT5 Master Password</Label><Input value={provisionForm.password} onChange={e => setProvisionForm({...provisionForm, password: e.target.value})} placeholder="Master key..." className="h-11 bg-background border-border" /></div>
                    <div className="space-y-2"><Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Display Login (Optional)</Label><Input value={provisionForm.displayLogin} onChange={e => setProvisionForm({...provisionForm, displayLogin: e.target.value})} placeholder="PF-Login-ID..." className="h-11 bg-background border-border" /></div>
                  </div>
                </CardContent>
                <CardFooter className="bg-secondary/20 p-6 flex justify-end"><Button className="h-12 px-10 font-bold text-lg cyan-box-glow" disabled={actionLoading || !provisionForm.userId || !provisionForm.login} onClick={() => setIsConfirmOpen(true)}>{actionLoading ? <Loader2 className="animate-spin mr-2" /> : <ShieldCheck className="mr-2 w-5 h-5" />}Authorize Node Provisioning</Button></CardFooter>
              </Card>

              <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}><DialogContent className="bg-black border-primary/20 text-white"><DialogHeader><DialogTitle>Verify Provisioning Details</DialogTitle><DialogDescription className="text-muted-foreground">This action will grant institutional capital access and notify the trader via secure channel.</DialogDescription></DialogHeader><div className="p-6 bg-secondary/30 rounded-2xl border border-white/5 space-y-3"><div className="flex justify-between"><span className="text-muted-foreground">Recipient</span><span className="font-bold">{userSearchTerm}</span></div><div className="flex justify-between"><span className="text-muted-foreground">Plan Configuration</span><span className="font-bold text-primary">{provisionForm.size} {provisionForm.plan}</span></div><div className="flex justify-between"><span className="text-muted-foreground">MT5 ID</span><span className="font-bold font-mono">{provisionForm.login}</span></div></div><DialogFooter><Button variant="ghost" onClick={() => setIsConfirmOpen(false)}>Abort</Button><Button className="bg-primary text-black font-bold" onClick={async () => { setActionLoading(true); const res = await registerMt5AccountAction({...provisionForm, size: Number(provisionForm.size)}); if (res.success) { setProvisionResult({ docId: res.docId!, login: provisionForm.login }); toast({ title: "Node Provisioned", description: "MT5 credentials linked successfully." }); setProvisionForm({ login: '', password: '', displayLogin: '', plan: '1-Step Pro', size: '100000', userId: '', phase: 'evaluation' }); setUserSearchTerm(''); } else { toast({ variant: "destructive", title: "Provisioning Error", description: res.error }); } setActionLoading(false); setIsConfirmOpen(false); }}>Confirm Activation</Button></DialogFooter></DialogContent></Dialog>
            </div>
          )}

          {activeTab === 'user_editor' && (
            <div className="max-w-4xl mx-auto space-y-8">
              <Card className="bg-card/40 border-border/50 overflow-hidden">
                <CardHeader><CardTitle className="text-white flex items-center gap-2"><Edit2 className="w-5 h-5 text-primary" /> Institutional Profile Editor</CardTitle><CardDescription>Directly modify core user data and account tiering.</CardDescription></CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase text-muted-foreground">1. Find Trader</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input placeholder="Enter name or email..." className="pl-10" value={editorSearchTerm} onChange={e => setEditorSearchTerm(e.target.value)} />
                      {filteredUsersForEditor.length > 0 && (
                        <div className="absolute top-full left-0 w-full z-20 mt-1 bg-secondary border border-border rounded-lg shadow-2xl overflow-hidden">
                          {filteredUsersForEditor.map((u: any) => (
                            <button key={u.id} className="w-full px-4 py-3 flex items-center justify-between hover:bg-primary/10 text-left border-b border-white/5 last:border-none" onClick={() => { setSelectedEditorUser(u); setUserEditForm({ name: u.name || '', phone: u.phone || '', country: u.country || '', referralCode: u.referralCode || '', tier: u.tier || 'Bronze', status: u.status || 'active' }); setEditorSearchTerm(''); }}>
                              <div><p className="font-bold text-white">{u.name}</p><p className="text-[10px] text-muted-foreground">{u.email}</p></div>
                              <ArrowRight className="w-4 h-4 text-muted-foreground" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {selectedEditorUser && (
                    <div className="space-y-6 pt-6 border-t border-white/5">
                       <div className="grid md:grid-cols-2 gap-6">
                          <div className="space-y-2"><Label>Full Name</Label><Input value={userEditForm.name} onChange={e => setUserEditForm({...userEditForm, name: e.target.value})} /></div>
                          <div className="space-y-2"><Label>Phone</Label><Input value={userEditForm.phone} onChange={e => setUserEditForm({...userEditForm, phone: e.target.value})} /></div>
                          <div className="space-y-2"><Label>Country</Label><Input value={userEditForm.country} onChange={e => setUserEditForm({...userEditForm, country: e.target.value})} /></div>
                          <div className="space-y-2"><Label>Referral Code</Label><Input value={userEditForm.referralCode} onChange={e => setUserEditForm({...userEditForm, referralCode: e.target.value})} /></div>
                          <div className="space-y-2"><Label>Account Tier</Label><Select value={userEditForm.tier} onValueChange={v => setUserEditForm({...userEditForm, tier: v})}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Bronze">Bronze</SelectItem><SelectItem value="Silver">Silver</SelectItem><SelectItem value="Gold">Gold</SelectItem></SelectContent></Select></div>
                          <div className="space-y-2"><Label>Platform Status</Label><Select value={userEditForm.status} onValueChange={v => setUserEditForm({...userEditForm, status: v})}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="suspended">Suspended</SelectItem></SelectContent></Select></div>
                       </div>
                       <div className="p-4 bg-primary/5 rounded-xl border border-primary/20"><p className="text-[10px] font-black uppercase text-primary mb-2">Immutable MT5 Metrics</p><div className="grid grid-cols-3 gap-4 text-xs"><div><p className="text-muted-foreground">Live Balance</p><p className="font-bold text-white">${selectedEditorUser.liveBalance?.toLocaleString() || '0'}</p></div><div><p className="text-muted-foreground">Live Equity</p><p className="font-bold text-white">${selectedEditorUser.liveEquity?.toLocaleString() || '0'}</p></div><div><p className="text-muted-foreground">Last Sync</p><p className="font-bold text-white">{selectedEditorUser.lastMT5Update ? new Date(selectedEditorUser.lastMT5Update).toLocaleTimeString() : 'N/A'}</p></div></div></div>
                       <Button className="w-full h-12 font-bold cyan-box-glow" onClick={() => setIsEditorConfirmOpen(true)} disabled={actionLoading}>Update Profile Information</Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Dialog open={isEditorConfirmOpen} onOpenChange={setIsEditorConfirmOpen}><DialogContent><DialogHeader><DialogTitle>Verify Administrative Override</DialogTitle><DialogDescription>You are about to modify core profile records for {selectedEditorUser?.email}. This action is logged for compliance audit.</DialogDescription></DialogHeader><DialogFooter><Button variant="ghost" onClick={() => setIsEditorConfirmOpen(false)}>Cancel</Button><Button onClick={handleUserEditSubmit} disabled={actionLoading}>Confirm Override</Button></DialogFooter></DialogContent></Dialog>
            </div>
          )}

          {activeTab === 'user_directory' && (
            <div className="space-y-6">
              <div className="relative mb-6">
                 <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                 <Input placeholder="Search directory by name, email, or UID..." className="pl-10 h-12 bg-secondary/30 border-border/50 text-white rounded-xl focus:border-primary/50" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
              </div>
              <Card className="bg-card/30 border-border/50 overflow-hidden">
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-black tracking-widest"><tr><th className="py-4 px-6">Trader</th><th className="py-4 px-4">Contact</th><th className="py-4 px-4">Identity (Trader ID)</th><th className="py-4 px-4">Tier / Status</th><th className="py-4 px-4">Joined</th><th className="py-4 px-6 text-right">Action</th></tr></thead>
                      <tbody className="divide-y divide-border/50">
                        {filteredUsersForDirectory.map((u: any) => (
                          <tr key={u.id} className="hover:bg-primary/5 transition-colors">
                            <td className="py-4 px-6 font-bold text-white">{u.name || 'Anonymous'}</td>
                            <td className="py-4 px-4"><div><p className="text-white">{u.email}</p><p className="text-[10px] text-muted-foreground">{u.phone || 'No phone'}</p></div></td>
                            <td className="py-4 px-4">
                               <div className="flex items-center gap-2 group">
                                  <div className="space-y-1">
                                     <p className="font-mono text-sm font-bold text-primary">{u.uid || '--------'}</p>
                                     <p className="text-[8px] text-muted-foreground uppercase opacity-40">{u.id}</p>
                                  </div>
                                  <TooltipProvider>
                                     <Tooltip>
                                        <TooltipTrigger asChild>
                                           <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={() => { navigator.clipboard.writeText(u.uid || u.id); toast({ title: "Copied ID" }); }}><Copy className="w-3" /></Button>
                                        </TooltipTrigger>
                                        <TooltipContent>Copy Trader ID</TooltipContent>
                                     </Tooltip>
                                  </TooltipProvider>
                               </div>
                            </td>
                            <td className="py-4 px-4"><Badge className={cn("text-[10px] uppercase font-black mr-2", u.status === 'active' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-destructive/10 text-destructive')}>{u.status || 'active'}</Badge><Badge variant="outline" className="text-[10px] uppercase font-bold">{u.tier || 'Bronze'}</Badge></td>
                            <td className="py-4 px-4 text-xs text-muted-foreground">{u.createdAt ? new Date(u.createdAt).toLocaleDateString() : u.joinDate ? new Date(u.joinDate).toLocaleDateString() : 'N/A'}</td>
                            <td className="py-4 px-6 text-right">
                               <div className="flex justify-end gap-2">
                                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setPreviewUserId(u.id)}><Eye className="w-4 h-4" /></Button>
                                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => { setSelectedEditorUser(u); setUserEditForm({ name: u.name || '', phone: u.phone || '', country: u.country || '', referralCode: u.referralCode || '', tier: u.tier || 'Bronze', status: u.status || 'active' }); setActiveTab('user_editor'); }}><Edit2 className="w-4 h-4" /></Button>
                               </div>
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
            <div className="space-y-6">
              <Card className="bg-card/30 border-border/50">
                <CardHeader><CardTitle className="text-white">KYC Review Desk</CardTitle><CardDescription>Approve identities for high-volume withdrawals.</CardDescription></CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-black tracking-widest"><tr><th className="py-4 px-6">Trader</th><th className="py-4 px-4">Documents</th><th className="py-4 px-4">Submitted</th><th className="py-4 px-4">Identity Status</th><th className="py-4 px-6 text-right">Validation</th></tr></thead>
                      <tbody className="divide-y divide-border/50">
                        {adminData.users.filter((u: any) => u.kycStatus === 'pending' || u.kycStatus === 'verified' || u.kycStatus === 'rejected').map((user: any) => (
                          <tr key={user.id} className="hover:bg-primary/5">
                            <td className="py-4 px-6 font-bold text-white">{user.name || user.email}</td>
                            <td className="py-4 px-4"><div className="flex gap-2">{user.idProofUrl && <Button variant="outline" size="sm" onClick={() => setViewProofProofUrl(user.idProofUrl)} className="h-7 text-[9px] uppercase font-bold">ID Proof</Button>}{user.addressProofUrl && <Button variant="outline" size="sm" onClick={() => setViewProofProofUrl(user.addressProofUrl)} className="h-7 text-[9px] uppercase font-bold">Address</Button>}</div></td>
                            <td className="py-4 px-4 text-xs">{user.kycSubmittedAt ? new Date(user.kycSubmittedAt).toLocaleDateString() : 'Recent'}</td>
                            <td className="py-4 px-4"><Badge className={cn("text-[9px] font-black uppercase", user.kycStatus === 'verified' ? 'bg-emerald-500/10 text-emerald-500' : user.kycStatus === 'rejected' ? 'bg-destructive/10 text-destructive' : 'bg-amber-500/10 text-amber-500')}>{user.kycStatus || 'pending'}</Badge></td>
                            <td className="py-4 px-6 text-right">
                               <div className="flex justify-end gap-2">
                                  <Button size="sm" className="h-8 text-[10px] font-black uppercase bg-emerald-500 hover:bg-emerald-600 text-black disabled:opacity-50" onClick={() => handleUpdateKycStatus(user.id, 'verified')} disabled={user.kycStatus === 'verified' || actionLoading}><CheckCircle2 className="w-3 h-3 mr-1" /> Approve</Button>
                                  <Button size="sm" variant="destructive" className="h-8 text-[10px] font-black uppercase disabled:opacity-50" onClick={() => handleUpdateKycStatus(user.id, 'rejected')} disabled={user.kycStatus === 'rejected' || actionLoading}><XCircle className="w-3 h-3 mr-1" /> Reject</Button>
                               </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {adminData.users.filter((u: any) => u.kycStatus === 'pending').length === 0 && <div className="p-20 text-center text-muted-foreground italic">No identities awaiting validation.</div>}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === 'referrals' && (
            <div className="space-y-8">
               <Card className="bg-card/30 border-border/50">
                  <CardHeader><CardTitle className="text-white flex items-center gap-2"><Share2 className="w-5 h-5 text-primary" /> Institutional Affiliate Audit</CardTitle><CardDescription>Comprehensive ledger of referral code performance and commissions.</CardDescription></CardHeader>
                  <CardContent className="p-0">
                     <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                           <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-black tracking-widest"><tr><th className="py-4 px-6">Referrer</th><th className="py-4 px-4">Code</th><th className="py-4 px-4">Total Signups</th><th className="py-4 px-4">Conversions</th><th className="py-4 px-4">Total Commissions</th><th className="py-4 px-6 text-right">Status</th></tr></thead>
                           <tbody className="divide-y divide-border/50">
                              {referrerAggregates.map((agg: any) => (
                                 <tr key={agg.id} className="hover:bg-primary/5 group transition-colors">
                                    <td className="py-4 px-6"><p className="font-bold text-white">{agg.name || 'Anonymous'}</p><p className="text-[10px] text-muted-foreground">{agg.email}</p></td>
                                    <td className="py-4 px-4 font-mono font-bold text-primary tracking-widest">{agg.code}</td>
                                    <td className="py-4 px-4 font-bold text-white">{agg.signups}</td>
                                    <td className="py-4 px-4 text-emerald-500 font-bold">{agg.conversions}</td>
                                    <td className="py-4 px-4 font-bold text-white">${agg.earnings.toFixed(2)}</td>
                                    <td className="py-4 px-6 text-right"><Badge variant="outline" className="text-[9px] font-black border-white/10 uppercase">Verified Ledger</Badge></td>
                                 </tr>
                              ))}
                           </tbody>
                        </table>
                        {referrerAggregates.length === 0 && <div className="p-20 text-center text-muted-foreground italic">No referral data recorded in ledger.</div>}
                     </div>
                  </CardContent>
               </Card>
            </div>
          )}

          {activeTab === 'broadcasts' && (
            <div className="max-w-4xl mx-auto space-y-8">
              <Card className="bg-card/40 border-primary/20">
                <CardHeader><CardTitle className="text-white flex items-center gap-2"><Megaphone className="text-primary w-5 h-5" /> Global Announcement Node</CardTitle><CardDescription>Publish messages to all active trading terminals instantly.</CardDescription></CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2"><Label>Broadcast Title</Label><Input placeholder="e.g. System Maintenance Update" value={broadcastForm.title} onChange={e => setBroadcastForm({...broadcastForm, title: e.target.value})} /></div>
                  <div className="space-y-2"><Label>Message Content</Label><Textarea placeholder="Type your global announcement here..." className="min-h-[120px]" value={broadcastForm.message} onChange={e => setBroadcastForm({...broadcastForm, message: e.target.value})} /></div>
                  <Button className="w-full font-bold h-12 cyan-box-glow" onClick={handleSendBroadcast} disabled={actionLoading || !broadcastForm.title || !broadcastForm.message}>{actionLoading ? <Loader2 className="animate-spin mr-2" /> : <Send className="mr-2 w-4 h-4" />}Transmit Global Broadcast</Button>
                </CardContent>
              </Card>

              <Card className="bg-card/30 border-border/50">
                <CardHeader><CardTitle className="text-white text-lg">Active Broadcast History</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-black tracking-widest"><tr><th className="py-4 px-6">Message</th><th className="py-4 px-4">Transmitted</th><th className="py-4 px-4">Status</th><th className="py-4 px-6 text-right">Actions</th></tr></thead>
                      <tbody className="divide-y divide-border/50">
                        {adminData.broadcasts.map((b: any) => (
                          <tr key={b.id} className="hover:bg-primary/5">
                            <td className="py-4 px-6"><p className="font-bold text-white">{b.title}</p><p className="text-[10px] text-muted-foreground line-clamp-1">{b.message}</p></td>
                            <td className="py-4 px-4 text-xs">{b.sentAt ? new Date(b.sentAt).toLocaleDateString() : 'Recently'}</td>
                            <td className="py-4 px-4"><Badge className="bg-emerald-500/10 text-emerald-500 text-[9px] uppercase font-black">ACTIVE</Badge></td>
                            <td className="py-4 px-6 text-right"><Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10" onClick={() => handleDeleteBroadcast(b.id)}><Trash2 className="w-4 h-4" /></Button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </main>

      <Dialog open={!!viewProofUrl} onOpenChange={() => setViewProofProofUrl(null)}>
        <DialogContent className="max-w-4xl bg-black border-primary/20">
          <DialogHeader><DialogTitle className="text-white">Institutional Document Viewer</DialogTitle></DialogHeader>
          <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-white/10 bg-secondary/20">
            {viewProofUrl && <Image src={viewProofUrl} alt="Institutional Proof" fill className="object-contain" />}
          </div>
          <DialogFooter><Button variant="outline" className="font-bold" onClick={() => { const link = document.createElement('a'); link.href = viewProofUrl!; link.download = 'PF-Proof-Audit.png'; link.click(); }}>Download for Ledger</Button><Button onClick={() => setViewProofProofUrl(null)}>Close Window</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAdminModal} onOpenChange={setShowAdminModal}>
        <DialogContent className="bg-black/95 backdrop-blur-2xl border-primary/30 text-white shadow-2xl">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-50" />
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
            <p className="text-[8px] text-center text-muted-foreground/30 uppercase tracking-widest">Unauthorized access to institutional capital systems is strictly prohibited.</p>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
