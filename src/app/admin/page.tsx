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
  Users, Activity, Search, Loader2, DollarSign, ChevronLeft, Terminal, Database, ShieldCheck, Wand2, RefreshCw, BarChart2, Monitor, Clock, AlertOctagon, Trophy, CreditCard, Send, Fingerprint, Skull, Filter, ExternalLink, CheckCircle2, XCircle, Eye, Phone, Globe, Mail, User, AlertCircle, RotateCcw, Zap, Trash2, LogOut, Gift, Image as ImageIcon
} from 'lucide-react';
import { updateOrderStatusAction, processKycAction, resetDemoAccountAction, sendGlobalBroadcastAction, fetchUserDetailAction, cleanupDemoAccountsAction, giftAccountAction } from './actions';
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
  const [giftForm, setGiftForm] = useState({ userId: '', optionId: '' });

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
    document.cookie = 'admin_master=93463962569392846256; path=/; max-age=86400';
    setIsAuthenticated(true);
    setLoggedInAdmin(adminEmailInput.toLowerCase());
    setShowAdminModal(false);
    refreshData();
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

  const kycApplications = useMemo(() => 
    adminData.users.filter((u: any) => u.kycStatus === 'pending' || u.kycStatus === 'verified' || u.kycStatus === 'rejected')
  , [adminData.users]);

  return (
    <div className="flex min-h-screen bg-background">
      <Navigation />
      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="p-8 shrink-0 border-b border-white/5">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h1 className="text-4xl font-headline font-bold mb-1 text-white">Administrative Terminal</h1>
              <p className="text-muted-foreground text-sm">Institutional Node Control & Compliance Hub.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={refreshData} disabled={isLoading}>
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                Sync Network
              </Button>
            </div>
          </div>
          
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="bg-secondary/50 h-11 p-1 rounded-xl">
              <TabsTrigger value="overview" className="px-6 font-bold">Overview</TabsTrigger>
              <TabsTrigger value="orders" className="px-6 font-bold">Order Review</TabsTrigger>
              <TabsTrigger value="kyc" className="px-6 font-bold">KYC Hub</TabsTrigger>
              <TabsTrigger value="referrals" className="px-6 font-bold">Referral Audit</TabsTrigger>
              <TabsTrigger value="users" className="px-6 font-bold">User Directory</TabsTrigger>
              <TabsTrigger value="breaches" className="px-6 font-bold">Breaches</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <StatCard title="Active Traders" value={adminData.users.length} icon={<Users />} color="blue" />
              <StatCard title="Pending Orders" value={adminData.orders.filter((o: any) => o.status === 'pending').length} icon={<CreditCard />} color="amber" />
              <StatCard title="KYC Requests" value={adminData.users.filter((u: any) => u.kycStatus === 'pending').length} icon={<Fingerprint />} color="purple" />
              <StatCard title="Hard Breaches" value={adminData.breaches.length} icon={<Skull />} color="red" />
            </div>
          )}

          {activeTab === 'orders' && (
            <Card className="bg-card/40 border-border/50">
              <CardContent className="p-0">
                <table className="w-full text-sm text-left">
                  <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-bold tracking-widest">
                    <tr>
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
                        <td className="p-4">
                          <p className="font-bold text-white">{o.email}</p>
                          <p className="text-[10px] text-primary">{o.plan} {o.accountSize}</p>
                        </td>
                        <td className="p-4 font-mono">${o.amountPaid}</td>
                        <td className="p-4 font-mono text-[10px] max-w-[100px] truncate">{o.txHash}</td>
                        <td className="p-4">
                          {o.paymentScreenshot ? (
                            <a href={o.paymentScreenshot} target="_blank" className="text-primary hover:underline flex items-center gap-1 text-xs">
                              <ImageIcon className="w-3 h-3" /> View
                            </a>
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
                          {u.idProofUrl && <a href={u.idProofUrl} target="_blank" className="text-xs text-primary hover:underline">ID Proof</a>}
                          {u.addressProofUrl && <a href={u.addressProofUrl} target="_blank" className="text-xs text-primary hover:underline">Address Proof</a>}
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
        </div>
      </main>

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
    </div>
  );
}