
"use client";

import { useState, useMemo, useEffect, memo, useCallback } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { 
  Users, Activity, Search, Loader2, DollarSign, ChevronLeft, Terminal, Database, ShieldCheck, RefreshCw, BarChart2, Monitor, Clock, AlertOctagon, Trophy, CreditCard, Send, Fingerprint, Skull, Filter, ExternalLink, CheckCircle2, XCircle, Eye, LogOut, Gift, Image as ImageIcon, ChevronRight, History, Megaphone, AlertTriangle
} from 'lucide-react';
import { updateOrderStatusAction, resetDemoAccountAction, sendGlobalBroadcastAction, fetchUserDetailAction, manualBreachAccountAction, approveManualOrderAction } from './actions';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import Image from 'next/image';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, orderBy, limit, where, getCountFromServer } from 'firebase/firestore';
import { useAuth } from '@/context/AuthContext';
import { ADMIN_EMAILS } from '@/lib/admin';
import { isValidTxHash, EXPLORERS } from '@/lib/onChainVerification';

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

export default function AdminPage() {
  const { user } = useAuth();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [adminError, setAdminError] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [adminData, setAdminData] = useState<any>({ 
    users: [], orders: [], payouts: [], referrals: [], broadcasts: [], breaches: [], demoAccounts: [],
    totalUsersCount: 0, totalNodesCount: 0
  });
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const { toast } = useToast();

  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);

  const refreshData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [usersTotal, nodesTotal] = await Promise.all([
        getCountFromServer(collection(db, 'users')),
        getCountFromServer(collection(db, 'demoAccounts'))
      ]);

      const [usersSnap, accountsSnap, ordersSnap, payoutsSnap, referralsSnap, broadcastsSnap] = await Promise.all([
        getDocs(query(collection(db, 'users'), limit(500), orderBy('createdAt', 'desc'))),
        getDocs(query(collection(db, 'demoAccounts'), limit(500), orderBy('createdAt', 'desc'))),
        getDocs(query(collection(db, 'orders'), limit(500), orderBy('createdAt', 'desc'))),
        getDocs(query(collection(db, 'payouts'), limit(200), orderBy('createdAt', 'desc'))),
        getDocs(query(collection(db, 'referrals'), limit(500), orderBy('createdAt', 'desc'))),
        getDocs(query(collection(db, 'broadcasts'), limit(100), orderBy('sentAt', 'desc'))),
      ]);
      
      setAdminData({
        users: usersSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })),
        demoAccounts: accountsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })),
        orders: ordersSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })),
        payouts: payoutsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })),
        referrals: referralsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })),
        broadcasts: broadcastsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })),
        totalUsersCount: usersTotal.data().count,
        totalNodesCount: nodesTotal.data().count
      });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Sync Error", description: err.message });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    const isVerified = localStorage.getItem('adminVerified') === 'true';
    if (isVerified) {
      setIsAuthenticated(true);
      refreshData();
    } else {
      setShowAdminModal(true);
    }
  }, [refreshData]);

  const handleAdminAuth = (e: React.FormEvent) => {
    e.preventDefault();
    const MASTER_PASSWORD = '93463962569392846256';
    if (adminPasswordInput === MASTER_PASSWORD) {
      localStorage.setItem('adminVerified', 'true');
      setIsAuthenticated(true);
      setShowAdminModal(false);
      refreshData();
    } else {
      setAdminError('❌ Invalid credentials');
    }
  };

  const handleApproveOrder = async (id: string) => {
    setActionLoading(true);
    try {
      const res = await approveManualOrderAction(id);
      if (res.success) {
        toast({ title: "Order Verified & Account Provisioned" });
        refreshData();
      } else throw new Error(res.error);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Approval Failed", description: e.message });
    } finally {
      setActionLoading(false);
    }
  };

  const filteredOrders = useMemo(() => 
    adminData.orders.filter((o: any) => {
      const term = searchTerm.toLowerCase();
      return o.email?.toLowerCase().includes(term) || o.id?.toLowerCase().includes(term);
    })
  , [adminData.orders, searchTerm]);

  return (
    <div className="flex min-h-screen bg-background text-white">
      <Navigation />
      <main className="flex-1 p-8 overflow-y-auto">
        <header className="flex justify-between items-center mb-10">
          <div>
            <h1 className="text-4xl font-headline font-bold">Institutional Terminal</h1>
            <p className="text-muted-foreground">Master Oversight & Risk Protocols</p>
          </div>
          <div className="flex gap-4">
             <Button variant="outline" onClick={refreshData} disabled={isLoading} className="rounded-xl font-bold">
               <RefreshCw className={cn("w-4 h-4 mr-2", isLoading && "animate-spin")} /> Refresh Master Sync
             </Button>
          </div>
        </header>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
          <TabsList className="bg-secondary/50 border border-white/5 p-1 h-12 w-full justify-start overflow-x-auto no-scrollbar">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="orders">Orders ({adminData.orders.filter((o:any)=>o.status !== 'completed' && o.status !== 'approved').length})</TabsTrigger>
            <TabsTrigger value="kyc">KYC Hub ({adminData.users.filter((u:any)=>u.kycStatus === 'pending').length})</TabsTrigger>
            <TabsTrigger value="payouts">Payout Hub</TabsTrigger>
            <TabsTrigger value="nodes">Trading Nodes</TabsTrigger>
            <TabsTrigger value="breaches">Breaches</TabsTrigger>
            <TabsTrigger value="users">User Directory</TabsTrigger>
            <TabsTrigger value="referrals">Referral Audit</TabsTrigger>
            <TabsTrigger value="broadcasts">Broadcasts</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard title="Active Traders" value={adminData.totalUsersCount} icon={<Users />} color="blue" />
                <StatCard title="Total Nodes" value={adminData.totalNodesCount} icon={<Activity />} color="green" />
                <StatCard title="Pending Review" value={adminData.orders.filter((o:any)=>o.status === 'manual_review' || o.status === 'pending').length} icon={<Clock />} color="amber" />
                <StatCard title="Total AUM" value={`$${(adminData.demoAccounts.reduce((a:any,c:any)=>a+(c.startBalance||0),0)/1e6).toFixed(1)}M`} icon={<DollarSign />} color="purple" />
             </div>
          </TabsContent>

          <TabsContent value="orders">
             <div className="mb-6">
                <Input 
                  placeholder="Filter by email or order ID..." 
                  value={searchTerm} 
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="max-w-md bg-secondary/30"
                />
             </div>
             <Card className="bg-card/40 border-border/50">
               <CardContent className="p-0">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-bold tracking-widest">
                      <tr>
                        <th className="p-4">Trader / Plan</th>
                        <th className="p-4">TX Hash / Explorer</th>
                        <th className="p-4">Status</th>
                        <th className="p-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {filteredOrders.map((o: any) => {
                        const isValidHash = isValidTxHash(o.txHash, o.network || "Polygon");
                        const explorerBase = EXPLORERS[o.network || "Polygon"] || EXPLORERS["Polygon"];
                        return (
                          <tr key={o.id} className="hover:bg-white/5 transition-colors">
                            <td className="p-4">
                              <p className="font-bold">{o.email}</p>
                              <p className="text-[10px] text-primary">{o.accountSize} {o.plan}</p>
                            </td>
                            <td className="p-4">
                               <div className="flex flex-col gap-1">
                                 {isValidHash ? (
                                   <a href={`${explorerBase}${o.txHash}`} target="_blank" className="text-primary hover:underline flex items-center gap-1 text-[10px] font-mono">
                                     {o.txHash?.slice(0,12)}... <ExternalLink size={10} />
                                   </a>
                                 ) : (
                                   <Badge variant="destructive" className="w-fit text-[8px] font-black uppercase tracking-widest">INVALID HASH: {o.txHash?.slice(0, 10)}</Badge>
                                 )}
                                 <span className="text-[8px] text-muted-foreground uppercase font-black">{o.network || 'Polygon'}</span>
                               </div>
                            </td>
                            <td className="p-4">
                               <Badge className={cn(
                                 "uppercase text-[8px] font-black", 
                                 o.status === 'completed' || o.status === 'approved' ? 'bg-emerald-500' : 'bg-amber-500'
                                )}>
                                  {o.status}
                                </Badge>
                            </td>
                            <td className="p-4 text-right">
                               {o.status !== 'completed' && o.status !== 'approved' && (
                                 <Button 
                                  size="sm" 
                                  className="h-8 bg-emerald-600 hover:bg-emerald-500 font-bold" 
                                  onClick={() => handleApproveOrder(o.id)}
                                  disabled={actionLoading || !isValidHash}
                                 >
                                   Provision Node
                                 </Button>
                               )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
               </CardContent>
             </Card>
          </TabsContent>

          <TabsContent value="kyc">
            <Card className="bg-card/40 border-border/50">
              <CardContent className="p-0">
                 <table className="w-full text-sm text-left">
                    <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-bold tracking-widest">
                      <tr>
                        <th className="p-4">User</th>
                        <th className="p-4">Submission Date</th>
                        <th className="p-4">Docs</th>
                        <th className="p-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {adminData.users.filter((u:any)=>u.kycStatus === 'pending').map((u: any) => (
                        <tr key={u.id} className="hover:bg-white/5 transition-colors">
                          <td className="p-4">
                            <p className="font-bold">{u.name}</p>
                            <p className="text-[10px] text-muted-foreground">{u.email}</p>
                          </td>
                          <td className="p-4 text-[10px] font-mono">
                            {u.kycSubmittedAt ? format(new Date(u.kycSubmittedAt), 'MMM d, HH:mm') : '—'}
                          </td>
                          <td className="p-4">
                             <div className="flex gap-2">
                               {u.idProofUrl && <Button variant="outline" size="sm" className="h-7 text-[9px]" onClick={()=>{setPreviewImage(u.idProofUrl); setIsImageModalOpen(true);}}>Front</Button>}
                               {u.idBackProofUrl && <Button variant="outline" size="sm" className="h-7 text-[9px]" onClick={()=>{setPreviewImage(u.idBackProofUrl); setIsImageModalOpen(true);}}>Back</Button>}
                               {u.selfieProofUrl && <Button variant="outline" size="sm" className="h-7 text-[9px]" onClick={()=>{setPreviewImage(u.selfieProofUrl); setIsImageModalOpen(true);}}>Selfie</Button>}
                             </div>
                          </td>
                          <td className="p-4 text-right">
                             <div className="flex justify-end gap-2">
                                <Button size="sm" variant="default" className="h-8 bg-emerald-600 hover:bg-emerald-500">Approve</Button>
                                <Button size="sm" variant="destructive" className="h-8">Reject</Button>
                             </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                 </table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Additional tab contents follows same pattern... */}
        </Tabs>
      </main>

      {/* Image Preview Modal */}
      <Dialog open={isImageModalOpen} onOpenChange={setIsImageModalOpen}>
        <DialogContent className="max-w-4xl p-2 bg-zinc-950 border-white/10">
           <div className="relative aspect-video w-full">
              {previewImage && <Image src={previewImage} alt="Verification" fill className="object-contain" unoptimized />}
           </div>
        </DialogContent>
      </Dialog>

      {/* Admin Auth Modal */}
      <Dialog open={showAdminModal} onOpenChange={setShowAdminModal}>
        <DialogContent className="bg-black/95 border-primary/30 text-white">
          <DialogHeader><DialogTitle className="text-center">Admin Access Restricted</DialogTitle></DialogHeader>
          <form onSubmit={handleAdminAuth} className="space-y-6 pt-4">
            <div className="space-y-2">
              <Label className="uppercase text-[10px] font-black tracking-widest text-zinc-500">Master Secret Key</Label>
              <Input type="password" value={adminPasswordInput} onChange={(e) => setAdminPasswordInput(e.target.value)} placeholder="••••••••" required />
            </div>
            {adminError && <p className="text-center text-xs text-destructive">{adminError}</p>}
            <Button type="submit" className="w-full h-12 font-black cyan-box-glow">AUTHENTICATE SESSION</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

