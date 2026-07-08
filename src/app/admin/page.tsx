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
  Users, Activity, Search, Loader2, DollarSign, ChevronLeft, Terminal, Database, ShieldCheck, Wand2, RefreshCw, BarChart2, Monitor, Clock, AlertOctagon, Trophy, CreditCard, Send, Fingerprint, Skull, Filter, ExternalLink, CheckCircle2, XCircle, Eye, Phone, Globe, Mail, User, AlertCircle, RotateCcw, Zap, Trash2, LogOut, Gift, Image as ImageIcon, Copy, ChevronRight, History, Megaphone, Landmark, Share2, Info, ArrowUpRight, Wallet, TrendingUp, AlertTriangle
} from 'lucide-react';
import { updateOrderStatusAction, processKycAction, resetDemoAccountAction, sendGlobalBroadcastAction, fetchUserDetailAction, cleanupDemoAccountsAction, manualBreachAccountAction, auditAndResetFridayBreachesAction, approveManualOrderAction } from './actions';
import { cn } from '@/lib/utils';
import { format, isValid, differenceInHours } from 'date-fns';
import { getTradeDate } from '@/lib/tradeUtils';
import Link from 'next/link';
import Image from 'next/image';
import { db, auth as clientAuth } from '@/lib/firebase';
import { collection, getDocs, query, orderBy, limit, where, getCountFromServer } from 'firebase/firestore';
import { useAuth } from '@/context/AuthContext';
import { firebaseConfig } from '@/firebase/config';
import { isValidTxHash, EXPLORERS } from '@/lib/onChainVerification';

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

      const [usersSnap, accountsSnap, ordersSnap, payoutsSnap, referralsSnap, broadcastsSnap, breachesSnap] = await Promise.all([
        getDocs(query(collection(db, 'users'), limit(500), orderBy('createdAt', 'desc'))),
        getDocs(query(collection(db, 'demoAccounts'), limit(500), orderBy('createdAt', 'desc'))),
        getDocs(query(collection(db, 'orders'), limit(500), orderBy('createdAt', 'desc'))),
        getDocs(query(collection(db, 'payouts'), limit(500), orderBy('createdAt', 'desc'))),
        getDocs(query(collection(db, 'referrals'), limit(500), orderBy('createdAt', 'desc'))),
        getDocs(query(collection(db, 'broadcasts'), limit(100), orderBy('sentAt', 'desc'))),
        getDocs(query(collection(db, 'breaches'), limit(500), orderBy('breachedAt', 'desc'))),
      ]);
      
      setAdminData({
        users: usersSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })),
        demoAccounts: accountsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })),
        orders: ordersSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })),
        payouts: payoutsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })),
        referrals: referralsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })),
        broadcasts: broadcastsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })),
        breaches: breachesSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })),
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
    const email = localStorage.getItem('adminEmail');
    if (isVerified && email) {
      setIsAuthenticated(true);
      setLoggedInAdmin(email);
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
      localStorage.setItem('adminEmail', adminEmailInput.toLowerCase());
      setIsAuthenticated(true);
      setLoggedInAdmin(adminEmailInput.toLowerCase());
      setShowAdminModal(false);
      refreshData();
    } else {
      setAdminError('❌ Invalid credentials');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('adminVerified');
    localStorage.removeItem('adminEmail');
    window.location.reload();
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
      return o.email?.toLowerCase().includes(term) || o.id?.toLowerCase().includes(term) || o.status?.toLowerCase().includes(term);
    })
  , [adminData.orders, searchTerm]);

  return (
    <div className="flex min-h-screen bg-background text-white">
      <Navigation />
      <main className="flex-1 p-8 overflow-y-auto">
        <header className="flex justify-between items-center mb-10">
          <div>
            <h1 className="text-4xl font-headline font-bold">Admin Terminal</h1>
            <p className="text-muted-foreground">Compliance & Network Oversight</p>
          </div>
          <div className="flex gap-4">
             <Button variant="outline" onClick={refreshData} disabled={isLoading}><RefreshCw className={cn("w-4 h-4 mr-2", isLoading && "animate-spin")} /> Sync</Button>
             <Button variant="ghost" onClick={handleLogout}><LogOut size={16} /></Button>
          </div>
        </header>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
          <TabsList className="bg-secondary/50 border border-white/5 p-1 h-12 w-full justify-start overflow-x-auto no-scrollbar">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="orders">Orders ({adminData.orders.filter((o:any)=>o.status !== 'completed').length})</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="nodes">Nodes</TabsTrigger>
            <TabsTrigger value="breaches">Breaches</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard title="Total Traders" value={adminData.totalUsersCount} icon={<Users />} color="blue" />
                <StatCard title="Active Nodes" value={adminData.totalNodesCount} icon={<Activity />} color="green" />
                <StatCard title="Pending Review" value={adminData.orders.filter((o:any)=>o.status === 'manual_review').length} icon={<AlertCircle />} color="amber" />
                <StatCard title="Total Volume" value={`$${(adminData.demoAccounts.reduce((a:any,c:any)=>a+(c.balance||0),0)/1e6).toFixed(1)}M`} icon={<DollarSign />} color="purple" />
             </div>
          </TabsContent>

          <TabsContent value="orders">
             <Card className="bg-card/40 border-border/50">
               <CardContent className="p-0">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-bold tracking-widest">
                      <tr>
                        <th className="p-4">Trader / Plan</th>
                        <th className="p-4">TX Hash / Explorer</th>
                        <th className="p-4">Proof</th>
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
                            <td className="p-4 font-mono text-[10px]">
                               <div className="flex flex-col gap-1">
                                 {isValidHash ? (
                                   <a 
                                    href={`${explorerBase}${o.txHash}`} 
                                    target="_blank" 
                                    className="flex items-center gap-1 text-primary hover:underline group"
                                  >
                                    {o.txHash?.slice(0,12)}... <ExternalLink size={10} className="group-hover:translate-x-0.5 transition-transform" />
                                  </a>
                                 ) : (
                                   <div className="flex items-center gap-1 text-destructive font-black">
                                      <AlertTriangle size={10} /> INVALID HASH: {o.txHash?.slice(0, 10)}...
                                   </div>
                                 )}
                                 <span className="text-[8px] text-muted-foreground uppercase font-black">{o.network || 'Polygon'}</span>
                               </div>
                            </td>
                            <td className="p-4">
                               {o.paymentScreenshot && <Button variant="outline" size="sm" className="h-7 text-[9px]" onClick={()=>{setPreviewImage(o.paymentScreenshot); setIsImageModalOpen(true);}}>View Image</Button>}
                            </td>
                            <td className="p-4">
                               <Badge className={cn(
                                 "uppercase text-[8px] font-black", 
                                 o.status === 'completed' || o.status === 'approved' ? 'bg-emerald-500' : 
                                 o.status === 'rejected' ? 'bg-destructive' : 'bg-amber-500'
                                )}>
                                  {o.status}
                                </Badge>
                            </td>
                            <td className="p-4 text-right">
                               {o.status !== 'completed' && o.status !== 'approved' && (
                                 <div className="flex justify-end gap-2">
                                    <Button 
                                      size="sm" 
                                      className="h-8 bg-emerald-600 hover:bg-emerald-500 text-white font-bold" 
                                      onClick={() => handleApproveOrder(o.id)} 
                                      disabled={actionLoading || !isValidHash}
                                    >
                                      Verify & Provision
                                    </Button>
                                    <Button 
                                      size="sm" 
                                      variant="destructive" 
                                      className="h-8 font-bold"
                                      onClick={() => updateOrderStatusAction(o.id, 'rejected', 'Invalid transaction hash provided.')}
                                    >
                                      Reject
                                    </Button>
                                 </div>
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
        </Tabs>
      </main>

      {/* Image Preview Modal */}
      <Dialog open={isImageModalOpen} onOpenChange={setIsImageModalOpen}>
        <DialogContent className="max-w-4xl p-2 bg-zinc-950 border-white/10">
           <div className="relative aspect-video w-full">
              {previewImage && <Image src={previewImage} alt="Proof" fill className="object-contain" unoptimized />}
           </div>
        </DialogContent>
      </Dialog>

      {/* Admin Auth Modal */}
      <Dialog open={showAdminModal} onOpenChange={setShowAdminModal}>
        <DialogContent className="bg-black/95 border-primary/30 text-white">
          <DialogHeader><DialogTitle className="text-center">Admin Authorization</DialogTitle></DialogHeader>
          <form onSubmit={handleAdminAuth} className="space-y-6 pt-4">
            <div className="space-y-4">
              <Input type="email" value={adminEmailInput} onChange={(e) => setAdminEmailInput(e.target.value)} placeholder="Admin Email" className="bg-secondary/50" required />
              <Input type="password" value={adminPasswordInput} onChange={(e) => setAdminPasswordInput(e.target.value)} placeholder="Master Password" required />
            </div>
            {adminError && <p className="text-center text-xs text-destructive">{adminError}</p>}
            <Button type="submit" className="w-full h-12 font-black cyan-box-glow">AUTHENTICATE</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}