
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
  const [provisionForm, setProvisionForm] = useState({ login: '', password: '', displayLogin: '', plan: '1-Step', size: '100000', userId: '', phase: 'evaluation' });
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
    return adminData.users.filter((u: any) => u.name?.toLowerCase().includes(lowerSearch) || u.email?.toLowerCase().includes(lowerSearch) || u.id?.toLowerCase().includes(lowerSearch) || (u.uid && u.uid.toString().toLowerCase().includes(lowerSearch)));
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
              <div className="grid lg:grid-cols-3 gap-8">
                <Card className="lg:col-span-2 bg-card/30 border-border/50 overflow-hidden">
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
          {/* Other tabs OMITTED for brevity as no logic changed there */}
        </div>
      </main>

      {/* Admin Login Modal OMITTED */}
    </div>
  );
}
