
"use client";

import React, { useState, useMemo, useEffect, memo, useCallback, useRef } from 'react';
import { Navigation } from '@/components/Navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  Users, Activity, Search, Loader2, Database, ShieldCheck, RefreshCw, BarChart2, Monitor, Clock, Trophy, Skull, Megaphone, RotateCcw, Zap, Link as LinkIcon, Plus, Eye, Check, XCircle, Gift, History, ShieldAlert, CheckCircle2, Trash2, Settings2, Save, Network, BarChart3, Info, Wallet, User, TrendingUp, LogOut, ChevronLeft, ChevronRight, Upload, DollarSign, Globe, ChevronsUpDown, HeartPulse, AlertCircle, ArrowRight, Lock
} from 'lucide-react';
import { 
  updateOrderStatusAction, 
  resetSingleAccountAction, 
  sendGlobalBroadcastAction, 
  approveManualOrderAction, 
  resetAllHistoryAction, 
  giftAccountAction, 
  updateKycStatusAction, 
  updatePayoutStatusAction, 
  cleanupDuplicateOrdersAction 
} from '@/app/admin/actions';
import { cn, sanitizeInput } from '@/lib/utils';
import { format } from 'date-fns';
import { getTradeDate, formatDuration, calculateHoldingTimeSeconds } from '@/lib/tradeUtils';
import { db, storage } from '@/lib/firebase';
import { collection, query, orderBy, where, getCountFromServer, doc, onSnapshot, getAggregateFromServer, sum, getDoc, getDocs, addDoc, setDoc, deleteDoc, serverTimestamp, limit } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAuth } from '@/context/AuthContext';
import { ADMIN_EMAILS } from '@/lib/admin';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

// Static Country List
const COUNTRIES = [
  { name: "Afghanistan", code: "AF" }, { name: "Albania", code: "AL" }, { name: "Algeria", code: "DZ" }, { name: "Andorra", code: "AD" }, { name: "Angola", code: "AO" },
  { name: "Argentina", code: "AR" }, { name: "Armenia", code: "AM" }, { name: "Australia", code: "AU" }, { name: "Austria", code: "AT" }, { name: "Azerbaijan", code: "AZ" },
  { name: "Bahamas", code: "BS" }, { name: "Bahrain", code: "BH" }, { name: "Bangladesh", code: "BD" }, { name: "Barbados", code: "BB" }, { name: "Belarus", code: "BY" },
  { name: "Belgium", code: "BE" }, { name: "Belize", code: "BZ" }, { name: "Benin", code: "BJ" }, { name: "Bermuda", code: "BM" }, { name: "Bhutan", code: "BT" },
  { name: "Bolivia", code: "BO" }, { name: "Bosnia and Herzegovina", code: "BA" }, { name: "Botswana", code: "BW" }, { name: "Brazil", code: "BR" }, { name: "Brunei", code: "BN" },
  { name: "Bulgaria", code: "BG" }, { name: "Burkina Faso", code: "BF" }, { name: "Burundi", code: "BI" }, { name: "Cambodia", code: "KH" }, { name: "Cameroon", code: "CM" },
  { name: "Canada", code: "CA" }, { name: "Cape Verde", code: "CV" }, { name: "Central African Republic", code: "CF" }, { name: "Chad", code: "TD" }, { name: "Chile", code: "CL" },
  { name: "China", code: "CN" }, { name: "Colombia", code: "CO" }, { name: "Comoros", code: "KM" }, { name: "Congo", code: "CG" }, { name: "Costa Rica", code: "CR" },
  { name: "Croatia", code: "HR" }, { name: "Cuba", code: "CU" }, { name: "Cyprus", code: "CY" }, { name: "Czech Republic", code: "CZ" }, { name: "Denmark", code: "DK" },
  { name: "Djibouti", code: "DJ" }, { name: "Dominica", code: "DM" }, { name: "Dominican Republic", code: "DO" }, { name: "Ecuador", code: "EC" }, { name: "Egypt", code: "EG" },
  { name: "El Salvador", code: "SV" }, { name: "Equatorial Guinea", code: "GQ" }, { name: "Eritrea", code: "ER" }, { name: "Estonia", code: "EE" }, { name: "Eswatini", code: "SZ" },
  { name: "Ethiopia", code: "ET" }, { name: "Fiji", code: "FJ" }, { name: "Finland", code: "FI" }, { name: "France", code: "FR" }, { name: "Gabon", code: "GA" },
  { name: "Gambia", code: "GM" }, { name: "Georgia", code: "GE" }, { name: "Germany", code: "DE" }, { name: "Ghana", code: "GH" }, { name: "Greece", code: "GR" },
  { name: "Grenada", code: "GD" }, { name: "Guatemala", code: "GT" }, { name: "Guinea", code: "GN" }, { name: "Guinea-Bissau", code: "GW" }, { name: "Guyana", code: "GY" },
  { name: "Haiti", code: "HT" }, { name: "Honduras", code: "HN" }, { name: "Hungary", code: "HU" }, { name: "Iceland", code: "IS" }, { name: "India", code: "IN" },
  { name: "Indonesia", code: "ID" }, { name: "Iran", code: "IR" }, { name: "Iraq", code: "IQ" }, { name: "Ireland", code: "IE" }, { name: "Israel", code: "IL" },
  { name: "Italy", code: "IT" }, { name: "Jamaica", code: "JM" }, { name: "Japan", code: "JP" }, { name: "Jordan", code: "JO" }, { name: "Kazakhstan", code: "KZ" },
  { name: "Kenya", code: "KE" }, { name: "Kiribati", code: "KI" }, { name: "Korea, North", code: "KP" }, { name: "Korea, South", code: "KR" }, { name: "Kuwait", code: "KW" },
  { name: "Kyrgyzstan", code: "KG" }, { name: "Laos", code: "LA" }, { name: "Latvia", code: "LV" }, { name: "Lebanon", code: "LB" }, { name: "Lesotho", code: "LS" },
  { name: "Liberia", code: "LR" }, { name: "Libya", code: "LY" }, { name: "Liechtenstein", code: "LI" }, { name: "Lithuania", code: "LT" }, { name: "Luxembourg", code: "LU" },
  { name: "Madagascar", code: "MG" }, { name: "Malawi", code: "MW" }, { name: "Malaysia", code: "MY" }, { name: "Maldives", code: "MV" }, { name: "Mali", code: "ML" },
  { name: "Malta", code: "MT" }, { name: "Marshall Islands", code: "MH" }, { name: "Mauritania", code: "MR" }, { name: "Mauritius", code: "MU" }, { name: "Mexico", code: "MX" },
  { name: "Micronesia", code: "FM" }, { name: "Moldova", code: "MD" }, { name: "Monaco", code: "MC" }, { name: "Mongolia", code: "MN" }, { name: "Montenegro", code: "ME" },
  { name: "Morocco", code: "MA" }, { name: "Mozambique", code: "MZ" }, { name: "Myanmar", code: "MM" }, { name: "Namibia", code: "NA" }, { name: "Nauru", code: "NR" },
  { name: "Nepal", code: "NP" }, { name: "Netherlands", code: "NL" }, { name: "New Zealand", code: "NZ" }, { name: "Nicaragua", code: "NI" }, { name: "Niger", code: "NE" },
  { name: "Nigeria", code: "NG" }, { name: "North Macedonia", code: "MK" }, { name: "Norway", code: "NO" }, { name: "Oman", code: "OM" }, { name: "Pakistan", code: "PK" },
  { name: "Palau", code: "PW" }, { name: "Panama", code: "PA" }, { name: "Papua New Guinea", code: "PG" }, { name: "Paraguay", code: "PY" }, { name: "Peru", code: "PE" },
  { name: "Philippines", code: "PH" }, { name: "Poland", code: "PL" }, { name: "Portugal", code: "PT" }, { name: "Qatar", code: "QA" }, { name: "Romania", code: "RO" },
  { name: "Russia", code: "RU" }, { name: "Rwanda", code: "RW" }, { name: "Saint Kitts and Nevis", code: "KN" }, { name: "Saint Lucia", code: "LC" }, { name: "Saint Vincent and the Grenadines", code: "VC" },
  { name: "Samoa", code: "WS" }, { name: "San Marino", code: "SM" }, { name: "Sao Tome and Principe", code: "ST" }, { name: "Saudi Arabia", code: "SA" }, { name: "Senegal", code: "SN" },
  { name: "Serbia", code: "RS" }, { name: "Seychelles", code: "SC" }, { name: "Sierra Leone", code: "SL" }, { name: "Singapore", code: "SG" }, { name: "Slovakia", code: "SK" },
  { name: "Slovenia", code: "SI" }, { name: "Solomon Islands", code: "SB" }, { name: "Somalia", code: "SO" }, { name: "South Africa", code: "ZA" }, { name: "South Sudan", code: "SS" },
  { name: "Spain", code: "ES" }, { name: "Sri Lanka", code: "LK" }, { name: "Sudan", code: "SD" }, { name: "Suriname", code: "SR" }, { name: "Sweden", code: "SE" },
  { name: "Switzerland", code: "CH" }, { name: "Syria", code: "SY" }, { name: "Taiwan", code: "TW" }, { name: "Tajikistan", code: "TJ" }, { name: "Tanzania", code: "TZ" },
  { name: "Thailand", code: "TH" }, { name: "Timor-Leste", code: "TL" }, { name: "Togo", code: "TG" }, { name: "Tonga", code: "TO" }, { name: "Trinidad and Tobago", code: "TT" },
  { name: "Tunisia", code: "TN" }, { name: "Turkey", code: "TR" }, { name: "Turkmenistan", code: "TM" }, { name: "Tuvalu", code: "TV" }, { name: "Uganda", code: "UG" },
  { name: "Ukraine", code: "UA" }, { name: "United Arab Emirates", code: "AE" }, { name: "United Kingdom", code: "GB" }, { name: "United States", code: "US" }, { name: "Uruguay", code: "UY" },
  { name: "Uzbekistan", code: "UZ" }, { name: "Vanuatu", code: "VU" }, { name: "Vatican City", code: "VA" }, { name: "Venezuela", code: "VE" }, { name: "Vietnam", code: "VN" },
  { name: "Yemen", code: "YE" }, { name: "Zambia", code: "ZM" }, { name: "Zimbabwe", code: "ZW" }
].map(c => {
  const codePoints = c.code.toUpperCase().split("").map(char => 127397 + char.charCodeAt(0));
  return { ...c, flag: String.fromCodePoint(...codePoints) };
});

const StatCard = memo(function StatCard({ title, value, icon, color }: { title: string, value: string | number, icon: any, color: string }) {
  const colorMap: any = {
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
          <div className={cn("p-2 rounded-lg border", colorMap[color])}>{icon}</div>
          <Badge variant="outline" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground border-white/10">LIVE</Badge>
        </div>
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">{title}</p>
        <h3 className="text-2xl font-headline font-bold text-white group-hover:text-primary transition-colors">
          {value === -1 ? '...' : value}
        </h3>
      </CardContent>
    </Card>
  );
});

const DataTable = memo(function DataTable({ loading, data, columns, renderRow }: { loading: boolean, data: any[], columns: string[], renderRow: (item: any, index: number) => React.ReactNode }) {
  if (loading) {
    return (
      <Card className="bg-card/40 border-border/50">
        <CardContent className="p-0 space-y-4 py-8">
          {[1, 2, 3].map(i => <div key={i} className="h-12 mx-4 bg-white/5 animate-pulse rounded-lg" />)}
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card className="bg-card/40 border-border/50 border-dashed border-2 py-20 text-center flex flex-col items-center justify-center opacity-40">
        <Info className="w-12 h-12 mb-4" />
        <p className="text-sm font-black uppercase tracking-widest">No matching records found.</p>
      </Card>
    );
  }

  return (
    <Card className="bg-card/40 border-border/50 overflow-hidden shadow-2xl">
      <CardContent className="p-0 overflow-x-auto custom-scrollbar">
        <table className="w-full text-sm text-left">
          <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-black tracking-widest border-b border-white/5">
            <tr>{columns.map(c => <th key={c} className="p-4">{c}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {data.map((item, index) => renderRow(item, index))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
});

const AdminSummaryTable = memo(function AdminSummaryTable({ title, data, columns, onViewAll }: { title: string, data: any[], columns: string[], onViewAll: () => void }) {
  return (
    <Card className="bg-card/30 border-border/50">
      <CardHeader className="flex flex-row items-center justify-between border-b border-white/5 pb-4">
        <CardTitle className="text-sm font-headline font-bold uppercase tracking-tight">{title}</CardTitle>
        <button onClick={onViewAll} className="text-[10px] font-black uppercase text-primary hover:text-white transition-colors">View All</button>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-sm text-left">
          <tbody className="divide-y divide-border/50">
            {!data || data.length === 0 ? (
              <tr><td colSpan={3} className="py-10 text-center text-[10px] text-zinc-600 font-bold uppercase">No data found.</td></tr>
            ) : data.slice(0, 5).map((item, i) => (
              <tr key={i} className="hover:bg-white/5 transition-colors">
                <td className="py-3 px-4 font-bold text-xs truncate max-w-[120px]">{item[columns[0]]}</td>
                <td className="py-3 px-4 text-[10px] text-muted-foreground uppercase truncate max-w-[100px]">{item[columns[1]]}</td>
                <td className="py-3 px-4 text-right">
                   {columns[2] === 'status' ? (
                     <Badge className={cn("text-[8px] font-black uppercase", (item.status === 'completed' || item.status === 'approved') ? 'bg-emerald-500/20 text-emerald-500' : 'bg-amber-500/20 text-amber-500')}>{item.status}</Badge>
                   ) : (
                     <span className="text-[10px] font-mono text-zinc-500">{item.createdAt?.toDate ? format(item.createdAt.toDate(), 'MMM d') : '—'}</span>
                   )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
});

const OverviewTab = memo(({ stats, tabData, onActiveTabChange }: { stats: any, tabData: any, onActiveTabChange: (tab: string) => void }) => (
  <div className="space-y-8">
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-7 gap-4">
      <StatCard title="Active Traders" value={stats.totalUsersCount} icon={<Users />} color="blue" />
      <StatCard title="Total Volume" value={stats.totalAum === -1 ? '...' : `$${(stats.totalAum / 1e6).toFixed(2)}M`} icon={<BarChart2 />} color="green" />
      <StatCard title="Registered Nodes" value={stats.totalNodesCount} icon={<Monitor />} color="purple" />
      <StatCard title="Pending Orders" value={stats.pendingOrdersCount} icon={<Clock />} color="amber" />
      <StatCard title="Phase Passers" value={stats.phasePassersCount} icon={<Trophy />} color="blue" />
      <StatCard title="Total Liquidation" value={stats.totalLiquidationCount} icon={<Skull />} color="red" />
      <StatCard title="KYC Records" value={stats.totalKycCount} icon={<CheckCircle2 />} color="green" />
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <AdminSummaryTable title="Recent Orders" data={tabData.orders} columns={['email', 'plan', 'status']} onViewAll={() => onActiveTabChange('order-review')} />
      <AdminSummaryTable title="Recent Users" data={tabData.users} columns={['name', 'email', 'createdAt']} onViewAll={() => onActiveTabChange('user-directory')} />
    </div>
  </div>
));

const PhasePassersTab = memo(({ data, isLoading, onInspect }: { data: any[], isLoading: boolean, onInspect: (userId: string) => void }) => (
  <div className="space-y-6">
    <TabHeader title="Elite Performance: Phase Passers" count={data.length} />
    <DataTable loading={isLoading} data={data} columns={['Trader', 'Account ID', 'Plan / Phase', 'Pass Date', 'Actions']} renderRow={(acc) => (
      <tr key={acc.id} className="hover:bg-white/5 transition-colors">
        <td className="p-4 font-bold text-xs">{acc.email || 'Trader'}</td>
        <td className="p-4 font-mono text-[10px] text-zinc-400">{acc.id}</td>
        <td className="p-4 text-[10px] uppercase font-bold text-zinc-300">{acc.planType || acc.plan} · {acc.phase}</td>
        <td className="p-4 text-xs text-muted-foreground">{acc.passedAt?.toDate ? format(acc.passedAt.toDate(), 'MMM d, yyyy') : 'Recently'}</td>
        <td className="p-4 text-right"><Button variant="outline" size="sm" onClick={() => onInspect(acc.userId)}><Eye className="w-3 h-3 mr-2" /> Inspect</Button></td>
      </tr>
    )} />
  </div>
));

const KycHubTab = memo(({ users, isLoading, onApprove, onReject, approvingUserId, stats }: { users: any[], isLoading: boolean, onApprove: (id: string) => void, onReject: (id: string) => void, approvingUserId: string | null, stats: any }) => (
  <div className="space-y-6">
    <TabHeader title="Compliance: Identity Review" count={stats.totalKycCount === -1 ? '...' : stats.totalKycCount} />
    <DataTable loading={isLoading} data={users} columns={['Trader', 'Submission Date', 'Proof Front', 'Proof Back', 'Selfie', 'Actions']} renderRow={(u) => (
      <tr key={u.id} className="hover:bg-white/5 transition-colors">
        <td className="p-4 font-bold text-xs">{u.email}</td>
        <td className="p-4 text-xs text-muted-foreground">{u.kycSubmittedAt ? format(new Date(u.kycSubmittedAt), 'MMM d, HH:mm') : 'Recently'}</td>
        <td className="p-4 text-center">{u.idProofUrl && <a href={u.idProofUrl} target="_blank" className="text-primary hover:underline text-[9px] font-black uppercase">View Front</a>}</td>
        <td className="p-4 text-center">{u.idBackProofUrl && <a href={u.idBackProofUrl} target="_blank" className="text-primary hover:underline text-[9px] font-black uppercase">View Back</a>}</td>
        <td className="p-4 text-center">{u.selfieProofUrl && <a href={u.selfieProofUrl} target="_blank" className="text-primary hover:underline text-[9px] font-black uppercase">View Selfie</a>}</td>
        <td className="p-4 text-right space-x-2">
          <Button size="sm" className="h-7 text-[8px] bg-emerald-600" onClick={() => onApprove(u.id)} disabled={approvingUserId === u.id}>{approvingUserId === u.id ? <Loader2 className="w-3 h-3 animate-spin" /> : "Approve"}</Button>
          <Button size="sm" variant="destructive" className="h-7 text-[8px]" onClick={() => onReject(u.id)}>Reject</Button>
        </td>
      </tr>
    )} />
  </div>
));

export default function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [adminError, setAdminError] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [isQuotaExhausted, setIsQuotaExhausted] = useState(false);
  
  const [stats, setStats] = useState({ 
    totalUsersCount: -1, totalNodesCount: -1, totalAum: -1, pendingOrdersCount: -1, phasePassersCount: -1, totalLiquidationCount: -1, totalKycCount: -1 
  });

  const lastRefreshTimeRef = useRef(0);

  const [tabData, setTabData] = useState<any>({
    users: [], orders: [], payouts: [], referrals: [], broadcasts: [], demoAccounts: [], breaches: [], passers: [], featuredPayouts: []
  });

  const [isLoading, setIsLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [approvingOrderId, setApprovingOrderId] = useState<string | null>(null);
  const [approvingKycUserId, setApprovingKycUserId] = useState<string | null>(null);
  const { toast } = useToast();

  const [isUserManagementOpen, setIsUserManagementOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [inspectionTab, setInspectionTab] = useState('overview');
  const [nodeFilterId, setNodeFilterId] = useState<string | null>(null);
  
  const [userTrades, setUserTrades] = useState<any[]>([]);
  const [tradesLoading, setTradesLoading] = useState(false);

  const [isGiftModalOpen, setIsGiftModalOpen] = useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectingOrderId, setRejectingOrderId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [giftForm, setGiftForm] = useState({ traderId: '', email: '', plan: '1-step-pro', size: 100000 });

  const [isKycRejectModalOpen, setIsKycRejectModalOpen] = useState(false);
  const [kycRejectingUserId, setKycRejectingUserId] = useState<string | null>(null);
  const [kycRejectReason, setKycRejectReason] = useState('');

  const [isFeaturedPayoutModalOpen, setIsFeaturedPayoutModalOpen] = useState(false);
  const [isCountryAutocompleteOpen, setIsCountryAutocompleteOpen] = useState(false);
  const [payoutForm, setPayoutForm] = useState({ id: '', name: '', country: '', countryFlag: '', paidOut: '', payoutsCount: '' });
  const [payoutProofFile, setPayoutProofFile] = useState<File | null>(null);
  const [countrySearchTerm, setCountrySearchTerm] = useState('');

  const instanceId = "Studio-8383940162";

  const isAuthorized = useMemo(() => {
    if (!user || !user.email) return false;
    const adminList = ADMIN_EMAILS.map(e => e.toLowerCase());
    return adminList.includes(user.email.toLowerCase());
  }, [user]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchTerm(searchTerm), 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const refreshStats = useCallback(async (force = false) => {
    if (!isAuthenticated || !isAuthorized || authLoading || isQuotaExhausted) return;
    const now = Date.now();
    if (!force && now - lastRefreshTimeRef.current < 10000) return;

    try {
      const fetchCount = async (collName: string, q: any) => {
        try {
          const count = (await getCountFromServer(q)).data().count;
          return count;
        } catch (e: any) {
          if (e.code === 'resource-exhausted') setIsQuotaExhausted(true);
          return null;
        }
      };

      const results = await Promise.allSettled([
        fetchCount('users', collection(db, 'users')),
        fetchCount('demoAccounts', collection(db, 'demoAccounts')),
        fetchCount('breaches', query(collection(db, 'demoAccounts'), where('status', 'in', ['blown', 'breach', 'terminated']))),
        fetchCount('passers', query(collection(db, 'demoAccounts'), where('status', '==', 'passed'))),
        fetchCount('orders', query(collection(db, 'orders'), where('status', 'in', ['manual_review', 'completed', 'approved', 'rejected']))),
        getAggregateFromServer(query(collection(db, 'orders'), where('status', 'in', ['completed', 'approved'])), { totalVolume: sum('amountPaid') }),
        fetchCount('kyc', query(collection(db, 'users'), where('kycStatus', 'in', ['pending', 'verified', 'rejected'])))
      ]);

      const statsPayload: any = {};
      results.forEach((r, i) => {
        const val = r.status === 'fulfilled' ? r.value : null;
        if (val !== null) {
          if (i === 0) statsPayload.totalUsersCount = val;
          if (i === 1) statsPayload.totalNodesCount = val;
          if (i === 2) statsPayload.totalLiquidationCount = val;
          if (i === 3) statsPayload.phasePassersCount = val;
          if (i === 4) statsPayload.pendingOrdersCount = val;
          if (i === 5) statsPayload.totalAum = (val as any)?.data?.()?.totalVolume || 0;
          if (i === 6) statsPayload.totalKycCount = val;
        }
      });

      if (Object.keys(statsPayload).length > 0) {
        setStats(prev => ({ ...prev, ...statsPayload }));
      }
      lastRefreshTimeRef.current = now;
    } catch (err: any) { 
      console.error('[Admin-Stats] Refresh fault:', err.message); 
    }
  }, [isAuthenticated, isAuthorized, authLoading, isQuotaExhausted]);

  useEffect(() => {
    if (!isAuthenticated || !isAuthorized || authLoading || isQuotaExhausted) return;
    setIsLoading(true);
    let unsub: () => void = () => {};
    const term = debouncedSearchTerm.toLowerCase().trim();

    if (term && (activeTab === 'user-directory' || activeTab === 'trading-nodes')) {
      const path = activeTab === 'user-directory' ? 'users' : 'demoAccounts';
      const q = query(collection(db, path), where('email', '>=', term), where('email', '<=', term + '\uf8ff'), limit(100));
      unsub = onSnapshot(q, (snap) => {
        setTabData((prev: any) => ({ ...prev, [activeTab === 'user-directory' ? 'users' : 'demoAccounts']: snap.docs.map(d => ({ id: d.id, ...d.data() })) }));
        setIsLoading(false);
      }, (err: any) => {
        if (err.code === 'resource-exhausted') setIsQuotaExhausted(true);
      });
      return () => unsub();
    }

    switch (activeTab) {
      case 'overview':
        refreshStats();
        {
          const uO = onSnapshot(query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(10)), (snap) => {
            setTabData((prev: any) => ({ ...prev, users: snap.docs.map(d => ({ id: d.id, ...d.data() })) }));
            setIsLoading(false);
          }, (err: any) => { if (err.code === 'resource-exhausted') setIsQuotaExhausted(true); });

          const oO = onSnapshot(query(collection(db, 'orders'), orderBy('submittedAt', 'desc'), limit(10)), (snap) => {
            setTabData((prev: any) => ({ ...prev, orders: snap.docs.map(d => ({ id: d.id, ...d.data() })) }));
          }, (err: any) => { if (err.code === 'resource-exhausted') setIsQuotaExhausted(true); });
          
          unsub = () => { uO(); oO(); };
        }
        break;
      case 'user-directory':
        unsub = onSnapshot(query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(100)), (snap) => {
          setTabData((prev: any) => ({ ...prev, users: snap.docs.map(d => ({ id: d.id, ...d.data() })) }));
          setIsLoading(false);
        }, (err: any) => { if (err.code === 'resource-exhausted') setIsQuotaExhausted(true); });
        break;
      case 'trading-nodes':
        unsub = onSnapshot(query(collection(db, 'demoAccounts'), orderBy('updatedAt', 'desc'), limit(100)), (snap) => {
          setTabData((prev: any) => ({ ...prev, demoAccounts: snap.docs.map(d => ({ id: d.id, ...d.data() })) }));
          setIsLoading(false);
        }, (err: any) => { if (err.code === 'resource-exhausted') setIsQuotaExhausted(true); });
        break;
      case 'breaches':
        unsub = onSnapshot(query(collection(db, 'demoAccounts'), where('status', 'in', ['blown', 'breach', 'terminated'])), (snap) => {
          const docs = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => { 
            const at = a.updatedAt?.toDate?.()?.getTime() || 0; 
            const bt = b.updatedAt?.toDate?.()?.getTime() || 0; 
            return bt - at; 
          }).slice(0, 100);
          setTabData((prev: any) => ({ ...prev, breaches: docs }));
          setIsLoading(false);
        }, (err: any) => { if (err.code === 'resource-exhausted') setIsQuotaExhausted(true); });
        break;
      case 'phase-passers':
        unsub = onSnapshot(query(collection(db, 'demoAccounts'), where('status', '==', 'passed')), (snap) => {
          const docs = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => { 
            const at = a.updatedAt?.toDate?.()?.getTime() || 0; 
            const bt = b.updatedAt?.toDate?.()?.getTime() || 0; 
            return bt - at; 
          }).slice(0, 100);
          setTabData((prev: any) => ({ ...prev, passers: docs }));
          setIsLoading(false);
        }, (err: any) => { if (err.code === 'resource-exhausted') setIsQuotaExhausted(true); });
        break;
      case 'order-review':
        unsub = onSnapshot(query(collection(db, 'orders'), where('status', 'in', ['manual_review', 'completed', 'approved', 'rejected'])), (snap) => {
          const docs = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => { 
            const at = a.submittedAt?.toDate?.()?.getTime() || 0; 
            const bt = b.submittedAt?.toDate?.()?.getTime() || 0; 
            return bt - at; 
          }).slice(0, 100);
          setTabData((prev: any) => ({ ...prev, orders: docs }));
          setIsLoading(false);
        }, (err: any) => { if (err.code === 'resource-exhausted') setIsQuotaExhausted(true); });
        break;
      case 'payout-hub':
        unsub = onSnapshot(query(collection(db, 'payouts'), orderBy('createdAt', 'desc'), limit(100)), (snap) => {
          setTabData((prev: any) => ({ ...prev, payouts: snap.docs.map(d => ({ id: d.id, ...d.data() })) }));
          setIsLoading(false);
        }, (err: any) => { if (err.code === 'resource-exhausted') setIsQuotaExhausted(true); });
        break;
      case 'trades-payouts':
        unsub = onSnapshot(query(collection(db, 'featured_payouts'), orderBy('paidOut', 'desc'), limit(100)), (snap) => {
          setTabData((prev: any) => ({ ...prev, featuredPayouts: snap.docs.map(d => ({ id: d.id, ...d.data() })) }));
          setIsLoading(false);
        }, (err: any) => { if (err.code === 'resource-exhausted') setIsQuotaExhausted(true); });
        break;
      case 'referral-audit':
        unsub = onSnapshot(query(collection(db, 'referrals'), orderBy('createdAt', 'desc'), limit(100)), (snap) => {
          setTabData((prev: any) => ({ ...prev, referrals: snap.docs.map(d => ({ id: d.id, ...d.data() })) }));
          setIsLoading(false);
        }, (err: any) => { if (err.code === 'resource-exhausted') setIsQuotaExhausted(true); });
        break;
      case 'kyc-hub':
        unsub = onSnapshot(query(collection(db, 'users'), where('kycStatus', 'in', ['pending', 'verified', 'rejected']), limit(100)), (snap) => {
          setTabData((prev: any) => ({ ...prev, users: snap.docs.map(d => ({ id: d.id, ...d.data() })) }));
          setIsLoading(false);
        }, (err: any) => { if (err.code === 'resource-exhausted') setIsQuotaExhausted(true); });
        break;
      case 'broadcasts':
        unsub = onSnapshot(query(collection(db, 'broadcasts'), orderBy('sentAt', 'desc'), limit(50)), (snap) => {
          const docs = snap.docs.map(d => {
            const data = d.data();
            return { id: d.id, ...data };
          });
          setTabData((prev: any) => ({ ...prev, broadcasts: docs }));
          setIsLoading(false);
        }, (err: any) => { if (err.code === 'resource-exhausted') setIsQuotaExhausted(true); });
        break;
      default:
        refreshStats();
        setIsLoading(false);
    }

    return () => unsub();
  }, [isAuthenticated, isAuthorized, authLoading, activeTab, debouncedSearchTerm, refreshStats, isQuotaExhausted]);

  useEffect(() => {
    if (isQuotaExhausted) {
      toast({ 
        variant: "destructive", 
        title: "Firestore Quota Exceeded", 
        description: "The administrative data stream has been suspended to protect project limits. Some data may be stale." 
      });
    }
  }, [isQuotaExhausted, toast]);

  useEffect(() => {
    const isVerified = localStorage.getItem('adminVerified') === 'true';
    const masterToken = document.cookie.includes('admin_master=93463962569392846256');
    if (isVerified || masterToken) setIsAuthenticated(true);
    else setShowAdminModal(true);
  }, []);

  const handleAdminAuth = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPasswordInput === '93463962569392846256') {
      localStorage.setItem('adminVerified', 'true');
      document.cookie = "admin_master=93463962569392846256; path=/; max-age=604800";
      setIsAuthenticated(true);
      setShowAdminModal(false);
      setAdminError('');
    } else setAdminError('❌ Invalid credentials');
  };

  const handleApproveOrder = useCallback(async (orderId: string) => {
    setApprovingOrderId(orderId);
    try {
      const res = await approveManualOrderAction(orderId);
      if (res.success) { toast({ title: "Order Approved" }); refreshStats(true); }
      else toast({ variant: "destructive", title: "Approval Failed", description: res.error });
    } finally { setApprovingOrderId(null); }
  }, [refreshStats, toast]);

  const handleApproveKyc = useCallback(async (userId: string) => {
    setApprovingKycUserId(userId);
    try {
      const res = await updateKycStatusAction(userId, 'verified');
      if (res.success) { 
        toast({ title: "KYC Verified", description: "Trader identity has been approved." }); 
        refreshStats(true); 
      }
      else toast({ variant: "destructive", title: "Failed", description: res.error });
    } finally { setApprovingKycUserId(null); }
  }, [refreshStats, toast]);

  const handleRejectKyc = async () => {
    if (!kycRejectingUserId || !kycRejectReason.trim()) {
      toast({ variant: "destructive", title: "Reason Required" });
      return;
    }
    setActionLoading(true);
    try {
      const res = await updateKycStatusAction(kycRejectingUserId, 'rejected', kycRejectReason.trim());
      if (res.success) {
        toast({ title: "KYC Rejected", description: "Trader has been notified with the reason." });
        setIsKycRejectModalOpen(false);
        setKycRejectingUserId(null);
        setKycRejectReason('');
        refreshStats(true);
      } else {
        throw new Error(res.error || "Rejection failed");
      }
    } catch (e: any) {
      toast({ variant: "destructive", title: "Failed", description: e.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveFeaturedPayout = async () => {
    if (!payoutForm.name || !payoutForm.country || !payoutForm.paidOut) return;
    setActionLoading(true);
    try {
      let proofUrl = (tabData.featuredPayouts.find((p: any) => p.id === payoutForm.id))?.proofUrl || '';
      if (payoutProofFile) {
        const storageRef = ref(storage, `featured-payout-proofs/${Date.now()}_${payoutProofFile.name}`);
        const snap = await uploadBytes(storageRef, payoutProofFile);
        proofUrl = await getDownloadURL(snap.ref);
      }
      const data = { name: payoutForm.name, country: payoutForm.country, countryFlag: payoutForm.countryFlag, paidOut: parseFloat(payoutForm.paidOut), payoutsCount: parseInt(payoutForm.payoutsCount || '1'), proofUrl, updatedAt: serverTimestamp() };
      if (payoutForm.id) await setDoc(doc(db, 'featured_payouts', payoutForm.id), data, { merge: true });
      else await addDoc(collection(db, 'featured_payouts'), { ...data, createdAt: serverTimestamp() });
      setIsFeaturedPayoutModalOpen(false);
      toast({ title: "Featured payout saved." });
    } finally { setActionLoading(false); }
  };

  const handleViewUserByAccount = useCallback(async (userIdOrAccountId: string) => {
    setActionLoading(true);
    try {
      let accountSnap = await getDoc(doc(db, 'demoAccounts', userIdOrAccountId));
      let userSnap;
      let uid = '';

      if (accountSnap.exists()) {
        const accData = accountSnap.data();
        uid = accData.userId;
        userSnap = await getDoc(doc(db, 'users', uid));
      } else {
        uid = userIdOrAccountId;
        userSnap = await getDoc(doc(db, 'users', uid));
        const accQuery = query(collection(db, 'demoAccounts'), where('userId', '==', uid), limit(1));
        const accsSnap = await getDocs(accQuery);
        if (!accsSnap.empty) {
          const sorted = accsSnap.docs.sort((a, b) => 
            (b.data().updatedAt?.toMillis() || 0) - (a.data().updatedAt?.toMillis() || 0)
          );
          accountSnap = sorted[0] as any;
        }
      }

      const userData = userSnap?.exists() ? { id: userSnap.id, ...userSnap.data() } : { id: uid, email: '—' };
      const accountData = accountSnap?.exists() ? { id: accountSnap.id, ...accountSnap.data() } : null;

      const merged = {
        ...userData,
        ...accountData,
        accountStatus: accountData ? (accountData.status || "active") : "No Account Node",
        globalLiquidity: accountData ? (accountData.balance || 0) : null,
        id: userData.id
      };

      setSelectedUser(merged);
      setNodeFilterId(accountData ? accountData.id : null);
      setInspectionTab('overview');
      setIsUserManagementOpen(true);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Inspection Failed", description: e.message });
    } finally { setActionLoading(false); }
  }, [toast]);

  const handleResetHistory = useCallback(async () => {
    if (!confirm('CRITICAL: This will PERMANENTLY DELETE all trade history for all users. Continue?')) return;
    setActionLoading(true);
    try {
      const res = await resetAllHistoryAction();
      if (res.success) {
        toast({ title: `Reset Complete: ${res.count} trades archived.` });
        refreshStats(true);
      }
    } catch (e: any) {
      toast({ variant: "destructive", title: "Reset Failed", description: e.message });
    } finally { setActionLoading(false); }
  }, [refreshStats, toast]);

  const handleGiftAccount = async () => {
    if (!giftForm.traderId && !giftForm.email) {
      toast({ variant: "destructive", title: "Input Required", description: "Please enter a Trader ID or Email." });
      return;
    }

    setActionLoading(true);
    try {
      const res = await giftAccountAction(
        giftForm.email || giftForm.traderId,
        `$${(giftForm.size / 1000).toLocaleString()}k`,
        giftForm.plan
      );

      if (res.success) {
        toast({ title: "🎁 Success", description: "The trading node has been provisioned." });
        setIsGiftModalOpen(false);
        setGiftForm({ traderId: '', email: '', plan: '1-step-pro', size: 100000 });
        refreshStats(true);
      } else {
        throw new Error(res.error);
      }
    } catch (e: any) {
      toast({ variant: "destructive", title: "Grant Failed", description: e.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectOrder = async () => {
    if (!rejectingOrderId || !rejectReason.trim()) {
      toast({ variant: "destructive", title: "Reason Required" });
      return;
    }
    setActionLoading(true);
    try {
      const res = await updateOrderStatusAction(rejectingOrderId, 'rejected', rejectReason.trim());
      if (res.success) {
        toast({ title: "Order Rejected" });
        setIsRejectModalOpen(false);
        setRejectingOrderId(null);
        setRejectReason('');
        refreshStats(true);
      }
    } catch (e: any) {
      toast({ variant: "destructive", title: "Rejection Failed", description: e.message });
    } finally {
      setActionLoading(false);
    }
  };

  const filteredFeaturedPayouts = useMemo(() => {
    return [...(tabData.featuredPayouts || [])].sort((a, b) => (parseFloat(b.paidOut) || 0) - (parseFloat(a.paidOut) || 0));
  }, [tabData.featuredPayouts]);

  const filteredCountries = useMemo(() => {
    const term = payoutForm.country.toLowerCase().trim();
    if (!term) return COUNTRIES.slice(0, 100);
    return COUNTRIES.filter(c => 
      c.name.toLowerCase().includes(term) || 
      c.code.toLowerCase().includes(term)
    );
  }, [payoutForm.country]);

  if (authLoading) return null;

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <ShieldAlert className="w-16 h-16 text-destructive mb-6" />
        <h1 className="text-3xl font-headline font-bold text-white mb-2">Unauthorized Access</h1>
        <p className="text-muted-foreground max-w-md mb-8">This terminal is restricted to authorized administrative nodes only. Your identity has been flagged.</p>
        <Button asChild><Link href="/dashboard">Return to Dashboard</Link></Button>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="w-full max-w-md bg-card/50 border-primary/20 backdrop-blur-xl">
          <CardHeader className="text-center space-y-2">
            <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto text-primary border border-primary/20 mb-4">
              <Lock className="w-8 h-8" />
            </div>
            <CardTitle className="text-2xl font-headline font-bold">Restricted Access</CardTitle>
            <CardDescription>Enter the master key to unlock the administrative terminal.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAdminAuth} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="master-key">Administrative Password</Label>
                <Input 
                  id="master-key" 
                  type="password" 
                  value={adminPasswordInput} 
                  onChange={(e) => setAdminPasswordInput(e.target.value)}
                  className="h-12 bg-secondary/50 border-border/50 text-center text-xl tracking-[0.5em]"
                  placeholder="••••••••"
                  autoFocus
                />
                {adminError && <p className="text-xs text-destructive font-bold text-center mt-2">{adminError}</p>}
              </div>
              <Button type="submit" className="w-full h-12 font-black text-lg cyan-box-glow bg-primary text-black">
                Unlock Terminal <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background text-white">
      <Navigation />
      <main className="flex-1 p-8 overflow-y-auto custom-scrollbar">
        <header className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-10 pb-6 border-b border-white/5">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-1"><ShieldAlert className="text-primary w-5 h-5" /><Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 text-[10px] font-bold tracking-widest">{user?.email}</Badge></div>
            <h1 className="text-3xl font-headline font-bold uppercase tracking-tighter">Administrative Terminal</h1>
            <p className="text-muted-foreground text-xs">System Intelligence & Global Control Hub.</p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
             <div className="px-4 py-2 rounded-xl bg-secondary/50 border border-border flex items-center gap-3">
               <div className="p-1.5 rounded-lg bg-primary/10 text-primary"><Database size={16} /></div>
               <div>
                 <p className="text-[8px] font-black uppercase text-zinc-500 tracking-widest">Instance</p>
                 <p className="text-xs font-mono font-bold text-white">{instanceId}</p>
               </div>
             </div>
             
             <Button className="h-10 rounded-xl font-black bg-primary text-black shadow-lg shadow-primary/20" asChild>
                <Link href="/admin/price-tracker">
                  <HeartPulse className="w-4 h-4 mr-2" /> Price Synchronizer
                </Link>
             </Button>

             <div className="flex gap-2">
                <Button variant="outline" className="h-10 rounded-xl font-bold" onClick={handleResetHistory} disabled={actionLoading}><RotateCcw className="w-4 h-4 mr-2" /> Friday Rule Reset</Button>
                <Button className="h-10 rounded-xl font-black bg-primary text-black" onClick={() => setIsGiftModalOpen(true)}>
                   <Gift className="w-4 h-4 mr-2" /> Gift Account
                </Button>
                <Button variant="outline" className="h-10 rounded-xl font-bold" onClick={() => refreshStats(true)} disabled={isLoading}>
                   <RefreshCw className={cn("w-4 h-4 mr-2", isLoading && "animate-spin")} /> Sync Network
                </Button>
             </div>
          </div>
        </header>

        {isQuotaExhausted && (
          <div className="mb-8 p-4 rounded-xl bg-destructive/10 border border-destructive/20 flex items-center gap-4">
            <AlertCircle className="text-destructive w-6 h-6" />
            <div>
              <p className="text-sm font-bold text-white">Firestore Quota Exceeded</p>
              <p className="text-xs text-destructive/80">Real-time synchronization is temporarily suspended to protect project limits. Some data may be stale.</p>
            </div>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
          <ScrollArea className="w-full">
            <TabsList className="bg-transparent h-12 w-full justify-start p-0 gap-8 border-b border-white/5 rounded-none">
              {['Overview', 'Phase Passers', 'Payout Hub', 'Trades Payouts', 'Trading Nodes', 'Breaches', 'Order Review', 'Referral Audit', 'User Directory', 'KYC Hub', 'Broadcasts'].map(tab => (
                <TabsTrigger key={tab} value={tab.toLowerCase().replace(' ', '-')} className="data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 h-full text-xs font-black uppercase tracking-widest text-muted-foreground">{tab}</TabsTrigger>
              ))}
            </TabsList>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
          
          <TabsContent value="overview"><OverviewTab stats={stats} tabData={tabData} onActiveTabChange={setActiveTab} /></TabsContent>
          <TabsContent value="phase-passers"><PhasePassersTab data={tabData.passers} isLoading={isLoading} onInspect={handleViewUserByAccount} /></TabsContent>
          <TabsContent value="kyc-hub"><KycHubTab users={tabData.users} isLoading={isLoading} onApprove={handleApproveKyc} onReject={id => { setKycRejectingUserId(id); setIsKycRejectModalOpen(true); }} approvingUserId={approvingKycUserId} stats={stats} /></TabsContent>

          <TabsContent value="order-review" className="space-y-6">
             <TabHeader title="Commerce: Order Review" count={stats.pendingOrdersCount === -1 ? '...' : stats.pendingOrdersCount} onSearch={setSearchTerm} />
             <DataTable loading={isLoading} data={tabData.orders} columns={['EMAIL', 'PLAN', 'SIZE', 'AMOUNT', 'NETWORK', 'STATUS', 'ACTIONS']} renderRow={(o) => (
                  <tr key={o.id} className="hover:bg-white/5 transition-colors">
                    <td className="p-4 font-bold text-xs">{o.email}</td>
                    <td className="p-4 text-[10px] uppercase font-bold text-zinc-300">{o.plan}</td>
                    <td className="p-4 text-xs font-mono text-zinc-400">{o.accountSize || '—'}</td>
                    <td className="p-4 text-xs font-mono text-zinc-300">{o.amountPaid ? `$${Number(o.amountPaid).toFixed(2)}` : '$0.00'}</td>
                    <td className="p-4 text-[10px] uppercase font-bold text-muted-foreground">{o.network || '—'}</td>
                    <td className="p-4 text-center"><Badge className={cn("text-[8px] font-black uppercase", o.status === 'completed' || o.status === 'approved' ? 'bg-emerald-500/20 text-emerald-500' : o.status === 'rejected' ? 'bg-red-500/20 text-red-500' : 'bg-amber-500/20 text-amber-500')}>{o.status}</Badge></td>
                    <td className="p-4 text-right">{(o.status === 'completed' || o.status === 'approved') && (o.proofUrl || o.paymentProofUrl || o.proofScreenshotUrl) ? <span className="text-primary hover:underline text-[10px] font-black uppercase cursor-pointer" onClick={() => window.open(o.proofUrl || o.paymentProofUrl || o.proofScreenshotUrl, '_blank')}>PROOF</span> : null}</td>
                  </tr>
                )}
             />
          </TabsContent>

        <TabsContent value="trading-nodes">
          <div className="space-y-6">
            <TabHeader title="Trading Nodes" count={stats.totalNodesCount === -1 ? '...' : stats.totalNodesCount} onSearch={setSearchTerm} />
            <DataTable loading={isLoading} data={tabData.demoAccounts} columns={['EMAIL', 'USER ID', 'PLAN', 'SIZE', 'STATUS', 'BALANCE', 'UPDATED', 'ACTIONS']} renderRow={(node) => (
              <tr key={node.id} className="hover:bg-white/5 transition-colors">
                <td className="p-4 font-bold text-xs">{node.email}</td>
                <td className="p-4 font-mono text-[10px] text-zinc-400">{node.userId}</td>
                <td className="p-4 text-[10px] uppercase font-bold text-zinc-300">{node.planType}</td>
                <td className="p-4 text-xs font-mono text-zinc-400">${node.startBalance?.toLocaleString() || '—'}</td>
                <td className="p-4 text-center">
                  <Badge className={cn(
                    "text-[8px] font-black uppercase",
                    node.status === 'active' ? "bg-emerald-500/20 text-emerald-500" :
                    node.status === 'passed' ? "bg-blue-500/20 text-blue-500" :
                    (node.status === 'blown' || node.status === 'breach' || node.status === 'terminated') ? "bg-red-500/20 text-red-500" :
                    "bg-zinc-500/20 text-zinc-400"
                  )}>
                    {node.status}
                  </Badge>
                </td>
                <td className="p-4 text-xs font-mono">${node.balance?.toLocaleString()}</td>
                <td className="p-4 text-xs text-muted-foreground">{node.updatedAt?.toDate ? format(node.updatedAt.toDate(), 'MMM d, HH:mm') : '—'}</td>
                <td className="p-4 text-right"><Button variant="outline" size="sm" className="h-7 text-[8px]" onClick={() => handleViewUserByAccount(node.userId)}><Eye className="w-3 h-3 mr-1" /> Inspect</Button></td>
              </tr>
            )} />
          </div>
        </TabsContent>

        <TabsContent value="breaches">
          <div className="space-y-6">
            <TabHeader title="Breach Monitor" count={stats.totalLiquidationCount === -1 ? '...' : stats.totalLiquidationCount} />
            <DataTable loading={isLoading} data={tabData.breaches} columns={['TRADER', 'ACCOUNT', 'PLAN', 'STATUS', 'REASON', 'BREACHED AT']} renderRow={(b) => (
              <tr key={b.id} className="hover:bg-white/5 transition-colors">
                <td className="p-4 font-bold text-xs">{b.email}</td>
                <td className="p-4 font-mono text-[10px] text-zinc-400">{b.id}</td>
                <td className="p-4 text-[10px] uppercase font-bold text-zinc-300">{b.planType}</td>
                <td className="p-4 text-center"><Badge className="text-[8px] font-black uppercase bg-red-500/20 text-red-500">{b.status}</Badge></td>
                <td className="p-4 text-xs text-red-400">{b.breachReason || '—'}</td>
                <td className="p-4 text-xs text-muted-foreground">{b.updatedAt?.toDate ? format(b.updatedAt.toDate(), 'MMM d, HH:mm') : '—'}</td>
              </tr>
            )} />
          </div>
        </TabsContent>

        <TabsContent value="payout-hub">
          <div className="space-y-6">
            <TabHeader title="Payout Hub" count={tabData.payouts.length} />
            <DataTable loading={isLoading} data={tabData.payouts} columns={['USER ID', 'AMOUNT', 'METHOD', 'WALLET/ACCOUNT', 'STATUS', 'REQUESTED']} renderRow={(p) => (
              <tr key={p.id} className="hover:bg-white/5 transition-colors">
                <td className="p-4 font-bold text-xs">{p.userId || p.email}</td>
                <td className="p-4 text-xs font-mono text-emerald-400">${Number(p.amount || 0).toFixed(2)}</td>
                <td className="p-4 text-[10px] uppercase text-zinc-300">{p.paymentMethod || '—'}</td>
                <td className="p-4 text-[10px] font-mono text-zinc-400 max-w-[200px] truncate">{p.walletAddress || p.accountNumber || '—'}</td>
                <td className="p-4 text-center"><Badge className={cn("text-[8px] font-black uppercase", p.status === 'paid' || p.status === 'approved' ? 'bg-emerald-500/20 text-emerald-500' : p.status === 'rejected' ? 'bg-red-500/20 text-red-500' : 'bg-amber-500/20 text-amber-500')}>{p.status}</Badge></td>
                <td className="p-4 text-xs text-muted-foreground">{p.createdAt?.toDate ? format(p.createdAt.toDate(), 'MMM d, HH:mm') : '—'}</td>
              </tr>
            )} />
          </div>
        </TabsContent>

        <TabsContent value="trades-payouts">
          <div className="space-y-6">
            <div className="flex justify-between items-center"><TabHeader title="Trades Payouts" count={tabData.featuredPayouts.length} /><Button className="h-8 text-[10px] font-black bg-primary text-black" onClick={() => { setPayoutForm({ id: '', name: '', country: '', countryFlag: '', paidOut: '', payoutsCount: '' }); setIsFeaturedPayoutModalOpen(true); }}><Plus className="w-3 h-3 mr-1" /> ADD</Button></div>
            <DataTable loading={isLoading} data={tabData.featuredPayouts} columns={['TRADER', 'COUNTRY', 'PAID OUT ($)', 'PAYOUTS COUNT', 'PROOF', 'ACTIONS']} renderRow={(fp) => (
              <tr key={fp.id} className="hover:bg-white/5 transition-colors">
                <td className="p-4 font-bold text-xs">{fp.name}</td>
                <td className="p-4 text-xs">{fp.countryFlag} {fp.country}</td>
                <td className="p-4 text-xs font-mono text-emerald-400">${Number(fp.paidOut || 0).toFixed(2)}</td>
                <td className="p-4 text-xs text-center">{fp.payoutsCount || 0}</td>
                <td className="p-4 text-center">{fp.proofUrl ? <a href={fp.proofUrl} target="_blank" className="text-primary hover:underline text-[9px] font-black uppercase">VIEW</a> : <span className="text-zinc-600 text-[9px]">NONE</span>}</td>
                <td className="p-4 text-right"><Button size="sm" variant="outline" className="h-7 text-[8px]" onClick={() => { setPayoutForm({ id: fp.id, name: fp.name, country: fp.country, countryFlag: fp.countryFlag, paidOut: String(fp.paidOut || ''), payoutsCount: String(fp.payoutsCount || '') }); setIsFeaturedPayoutModalOpen(true); }}>EDIT</Button></td>
              </tr>
            )} />
          </div>
        </TabsContent>

        <TabsContent value="referral-audit">
          <div className="space-y-6">
            <TabHeader title="Referral Audit" count={tabData.referrals.length} />
            <DataTable loading={isLoading} data={tabData.referrals} columns={['REFERRER', 'REFERRED', 'STATUS', 'DATE']} renderRow={(r) => (
              <tr key={r.id} className="hover:bg-white/5 transition-colors">
                <td className="p-4 font-bold text-xs">{r.referrerEmail || r.referrerId}</td>
                <td className="p-4 text-xs text-zinc-300">{r.referredEmail || r.referredId}</td>
                <td className="p-4 text-center"><Badge className={cn("text-[8px] font-black uppercase", r.status === 'completed' || r.status === 'active' ? 'bg-emerald-500/20 text-emerald-500' : r.status === 'joined' ? 'bg-amber-500/20 text-amber-500' : 'bg-zinc-500/20 text-zinc-500')}>{r.status || 'pending'}</Badge></td>
                <td className="p-4 text-xs text-muted-foreground">{r.createdAt?.toDate ? format(r.createdAt.toDate(), 'MMM d, HH:mm') : '—'}</td>
              </tr>
            )} />
          </div>
        </TabsContent>

        <TabsContent value="user-directory">
          <div className="space-y-6">
            <TabHeader title="User Directory" count={stats.totalUsersCount === -1 ? '...' : stats.totalUsersCount} onSearch={setSearchTerm} />
            <DataTable loading={isLoading} data={tabData.users} columns={['NAME', 'EMAIL', 'KYC', 'JOINED', 'ACTIONS']} renderRow={(u) => (
              <tr key={u.id} className="hover:bg-white/5 transition-colors">
                <td className="p-4 font-bold text-xs">{u.name || u.displayName || '—'}</td>
                <td className="p-4 text-xs text-zinc-300">{u.email}</td>
                <td className="p-4 text-center"><Badge className={cn("text-[8px] font-black uppercase", u.kycStatus === 'verified' ? 'bg-emerald-500/20 text-emerald-500' : u.kycStatus === 'rejected' ? 'bg-red-500/20 text-red-500' : 'bg-amber-500/20 text-amber-500')}>{u.kycStatus || 'none'}</Badge></td>
                <td className="p-4 text-xs text-muted-foreground">{u.createdAt?.toDate ? format(u.createdAt.toDate(), 'MMM d, yyyy') : '—'}</td>
                <td className="p-4 text-right"><Button variant="outline" size="sm" className="h-7 text-[8px]" onClick={() => handleViewUserByAccount(u.id)}><Eye className="w-3 h-3 mr-1" /> Inspect</Button></td>
              </tr>
            )} />
          </div>
        </TabsContent>

        <TabsContent value="broadcasts">
          <div className="space-y-6">
            <TabHeader title="Broadcasts" count={tabData.broadcasts.length} />
            <DataTable loading={isLoading} data={tabData.broadcasts} columns={['TITLE', 'MESSAGE', 'TYPE', 'SENT BY', 'SENT AT']} renderRow={(b) => (
              <tr key={b.id} className="hover:bg-white/5 transition-colors">
                <td className="p-4 font-bold text-xs">{b.title || '—'}</td>
                <td className="p-4 text-xs max-w-[400px] leading-relaxed whitespace-pre-wrap">{b.message}</td>
                <td className="p-4 text-[10px] uppercase text-zinc-400">{b.type || '—'}</td>
                <td className="p-4 text-xs text-zinc-300">{b.sentBy || 'admin'}</td>
                <td className="p-4 text-xs text-muted-foreground">{b.sentAt?.toDate ? format(b.sentAt.toDate(), 'MMM d, HH:mm') : '—'}</td>
              </tr>
            )} />
          </div>
        </TabsContent>
        </Tabs>
      </main>

      {/* Admin Unlock Modal */}
      <Dialog open={showAdminModal} onOpenChange={setShowAdminModal}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-md">
          <DialogHeader className="text-center space-y-2">
            <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto text-primary border border-primary/20 mb-4">
              <Lock className="w-8 h-8" />
            </div>
            <DialogTitle className="text-2xl font-headline font-bold">Terminal Locked</DialogTitle>
            <DialogDescription>Identity verified. Enter master key to provision session.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAdminAuth} className="space-y-6 pt-4">
             <div className="space-y-2">
                <Label htmlFor="auth-pwd">Master Administrative Password</Label>
                <Input 
                  id="auth-pwd"
                  type="password" 
                  value={adminPasswordInput} 
                  onChange={e => setAdminPasswordInput(e.target.value)} 
                  className="bg-zinc-900 border-zinc-800 h-12 text-center text-xl tracking-[0.5em]" 
                  placeholder="••••••••"
                  autoFocus
                />
                {adminError && <p className="text-xs text-destructive font-bold text-center mt-2">{adminError}</p>}
             </div>
             <Button type="submit" className="w-full h-12 font-black bg-primary text-black">UNLOCK MONITOR <ArrowRight className="ml-2 w-5 h-5" /></Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isFeaturedPayoutModalOpen} onOpenChange={setIsFeaturedPayoutModalOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-md">
          <DialogHeader>
            <DialogTitle>{payoutForm.id ? 'Edit' : 'Add'} Featured Payout</DialogTitle>
            <DialogDescription className="sr-only">Configure detailed payout parameters for the leaderboard showcase.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
             <div className="space-y-2"><Label>Trader Name</Label><Input value={payoutForm.name} onChange={e => payoutForm.name = e.target.value} className="bg-zinc-900 border-zinc-800" /></div>
             <div className="space-y-2 relative">
                <Label>Country</Label>
                <div className="relative">
                  <Input 
                    placeholder="Search country..." 
                    value={payoutForm.country} 
                    onChange={e => {
                      const val = e.target.value;
                      payoutForm.country = val;
                      setCountrySearchTerm(val);
                      setIsCountryAutocompleteOpen(true);
                    }}
                    onFocus={() => setIsCountryAutocompleteOpen(true)}
                    className="bg-zinc-900 border-zinc-800 h-10 w-full"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                    <ChevronsUpDown className="h-4 w-4 opacity-50" />
                  </div>
                </div>

                {isCountryAutocompleteOpen && filteredCountries.length > 0 && (
                  <Card className="absolute top-full left-0 w-full mt-1 bg-zinc-900 border-zinc-800 z-[120] shadow-2xl max-h-60 overflow-hidden flex flex-col">
                    <ScrollArea className="flex-1">
                      <div className="p-1 flex flex-col">
                        {filteredCountries.map(c => (
                          <button 
                            key={c.code} 
                            type="button" 
                            onPointerDown={e => { 
                              e.preventDefault(); 
                              payoutForm.country = c.name;
                              payoutForm.countryFlag = c.flag;
                              setCountrySearchTerm(c.name);
                              setIsCountryAutocompleteOpen(false);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-white/5 rounded-md text-left transition-colors group"
                          >
                            <span className="text-base">{c.flag}</span>
                            <span className="text-zinc-300 group-hover:text-white">{c.name}</span>
                          </button>
                        ))}
                      </div>
                    </ScrollArea>
                  </Card>
                )}
             </div>
             <div className="grid grid-cols-2 gap-4">
               <div className="space-y-2"><Label>Paid Out ($)</Label><Input type="number" value={payoutForm.paidOut} onChange={e => payoutForm.paidOut = e.target.value} className="bg-zinc-900 border-zinc-800" /></div>
               <div className="space-y-2"><Label>Total Payouts Count</Label><Input type="number" value={payoutForm.payoutsCount} onChange={e => payoutForm.payoutsCount = e.target.value} className="bg-zinc-900 border-zinc-800" /></div>
             </div>
             <div className="space-y-2"><Label>Proof Screenshot</Label><Input type="file" accept="image/*" onChange={e => setPayoutProofFile(e.target.files?.[0] || null)} className="bg-zinc-900 border-zinc-800 text-xs" /></div>
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setIsFeaturedPayoutModalOpen(false)}>Cancel</Button><Button className="bg-primary text-black font-black" onClick={handleSaveFeaturedPayout} disabled={actionLoading}>{actionLoading ? <Loader2 className="animate-spin" /> : <Save className="w-4 h-4 mr-2" />} SAVE</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isGiftModalOpen} onOpenChange={setIsGiftModalOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white">
          <DialogHeader><DialogTitle>Provision Free Account</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><Label>Trader ID or Email</Label><Input value={giftForm.traderId} onChange={e => giftForm.traderId = e.target.value} className="bg-zinc-900 border-zinc-800" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Account Size</Label><Select onValueChange={v => giftForm.size = parseInt(v)}>
                <SelectTrigger className="bg-zinc-900 border-zinc-800"><SelectValue placeholder="100k" /></SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                  {[5, 10, 25, 50, 100, 200, 300].map(s => <SelectItem key={s} value={`${s*1000}`}>${s}k</SelectItem>)}
                </SelectContent>
              </Select></div>
              <div className="space-y-2"><Label>Plan Type</Label><Select onValueChange={v => giftForm.plan = v}>
                <SelectTrigger className="bg-zinc-900 border-zinc-800"><SelectValue placeholder="1-Step Pro" /></SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                  <SelectItem value="1-step-pro">1-Step Pro</SelectItem>
                  <SelectItem value="2-step-classic">2-Step Classic</SelectItem>
                  <SelectItem value="3-step-classic">3-Step Classic</SelectItem>
                  <SelectItem value="instant-funding">Instant Funding</SelectItem>
                </SelectContent>
              </Select></div>
            </div>
          </div>
          <DialogFooter><Button className="w-full bg-primary text-black font-black" onClick={handleGiftAccount} disabled={actionLoading}>{actionLoading ? <Loader2 className="animate-spin" /> : "GRANT ACCOUNT"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isKycRejectModalOpen} onOpenChange={setIsKycRejectModalOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white">
          <DialogHeader><DialogTitle>Reject KYC</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <Label>Rejection Reason</Label>
            <Textarea value={kycRejectReason} onChange={e => kycRejectReason = e.target.value} placeholder="e.g. Blurry ID photo..." className="bg-zinc-900 border-zinc-800" />
          </div>
          <DialogFooter>
             <Button variant="outline" onClick={() => setIsKycRejectModalOpen(false)}>Cancel</Button>
             <Button variant="destructive" onClick={handleRejectKyc}>Reject</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isRejectModalOpen} onOpenChange={setIsRejectModalOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white">
          <DialogHeader><DialogTitle>Reject Order</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <Label>Rejection Reason</Label>
            <Textarea value={rejectReason} onChange={e => rejectReason = e.target.value} placeholder="e.g. Proof mismatch..." className="bg-zinc-900 border-zinc-800" />
          </div>
          <DialogFooter>
             <Button variant="outline" onClick={() => setIsRejectModalOpen(false)}>Cancel</Button>
             <Button variant="destructive" onClick={handleRejectOrder}>Reject Order</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isUserManagementOpen} onOpenChange={setIsUserManagementOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <Eye className="w-5 h-5 text-primary" />
              User Inspection — {selectedUser?.email || 'Unknown'}
            </DialogTitle>
            <DialogDescription>Trade node details, trade history, and breach logs.</DialogDescription>
          </DialogHeader>

          <Tabs value={inspectionTab} onValueChange={setInspectionTab} className="w-full">
            <TabsList className="flex gap-2 bg-secondary/30 p-1 rounded-xl w-fit border border-white/5 mb-4 h-auto">
              {['overview', 'trades', 'breaches'].map(t => (
                <TabsTrigger key={t} value={t} className="px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all data-[state=active]:bg-primary data-[state=active]:text-black text-zinc-500 hover:text-white bg-transparent border-none shadow-none">
                  {t === 'overview' ? 'Trade Node' : t === 'trades' ? 'Trade History' : 'Breach Logs'}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="overview" className="m-0 space-y-6">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                     {[
                        { label: 'Email Address', value: selectedUser?.email },
                        { label: 'Phone Identity', value: selectedUser?.phone || 'Not Provided' },
                        { label: 'Country', value: selectedUser?.country },
                        { label: 'Join Date', value: selectedUser?.createdAt?.toDate ? format(selectedUser.createdAt.toDate(), 'MMM d, yyyy') : '—' },
                        { label: 'Account Status', value: selectedUser?.accountStatus ?? selectedUser?.status ?? (selectedUser?.id ? 'active' : 'No Account Node') },
                        { label: 'Global Liquidity', value: (selectedUser?.globalLiquidity !== undefined && selectedUser?.globalLiquidity !== null) ? `$${Number(selectedUser.globalLiquidity).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : (selectedUser?.balance !== undefined ? `$${Number(selectedUser.balance).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—') },
                        
                        { label: 'Account Size', value: selectedUser?.startBalance ? `$${Number(selectedUser.startBalance).toLocaleString()}` : '—' },
                        { 
                          label: 'KYC Status', 
                          value: (() => {
                            const status = selectedUser?.kycStatus || 'none';
                            if (status === 'none') return 'Not Submitted';
                            return status.charAt(0).toUpperCase() + status.slice(1);
                          })()
                        },
                        { 
                          label: 'Plan Type', 
                          value: selectedUser?.planType ? selectedUser.planType.split('-').map((word: string) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ') : '—' 
                        },
                        { 
                          label: 'Balance', 
                          value: selectedUser?.balance !== undefined ? `$${Number(selectedUser.balance).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—' 
                        },
                        { 
                          label: 'Equity', 
                          value: selectedUser?.equity !== undefined ? `$${Number(selectedUser.equity).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—' 
                        },
                        { 
                          label: 'Phase', 
                          value: selectedUser?.phase ? selectedUser.phase.replace(/(\D+)(\d+)/, '$1 $2').replace(/^\w/, (c: string) => c.toUpperCase()) : '—' 
                        },
                        { 
                          label: 'Last Updated', 
                          value: selectedUser?.updatedAt?.toDate ? format(selectedUser.updatedAt.toDate(), "MMM d, yyyy '•' HH:mm 'UTC'") : '—' 
                        }
                     ].map(item => (
                        <div key={item.label} className="p-4 rounded-xl bg-zinc-900/50 border border-white/5 space-y-2">
                           <p className="text-[8px] font-black uppercase text-zinc-500 tracking-widest">{item.label}</p>
                           <p className="text-sm font-bold text-white">{item.value || '—'}</p>
                        </div>
                     ))}
                  </div>
            </TabsContent>

            <TabsContent value="trades" className="m-0">
              {tradesLoading ? (
                <div className="p-20 text-center flex flex-col items-center justify-center space-y-4">
                  <Loader2 className="w-10 h-10 animate-spin text-primary/40" />
                  <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Syncing Ledger...</p>
                </div>
              ) : userTrades.length === 0 ? (
                <div className="p-20 text-center flex flex-col items-center justify-center space-y-4 opacity-40">
                  <History className="w-12 h-12" />
                  <p className="text-sm font-black uppercase tracking-widest">No trade history available.</p>
                </div>
              ) : (
                <DataTable 
                  loading={false} 
                  data={userTrades} 
                  columns={['SYMBOL', 'TYPE', 'LOTS', 'ENTRY', 'EXIT', 'P&L', 'STATUS', 'OPENED']} 
                  renderRow={(trade) => (
                    <tr key={trade.id} className="hover:bg-white/5 transition-colors">
                      <td className="p-3 font-bold text-xs">{trade.symbol || '—'}</td>
                      <td className="p-3 text-center">
                        <Badge className={cn("text-[8px] font-black uppercase", (trade.type || '').toLowerCase() === 'buy' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-red-500/20 text-red-500')}>
                          {trade.type || '—'}
                        </Badge>
                      </td>
                      <td className="p-3 text-xs font-mono">{trade.lots || '0.00'}</td>
                      <td className="p-3 text-xs font-mono">${trade.openPrice?.toLocaleString() || '0.00'}</td>
                      <td className="p-3 text-xs font-mono">{trade.closePrice ? `$${trade.closePrice.toLocaleString()}` : '—'}</td>
                      <td className={cn("p-3 text-xs font-mono font-bold", (trade.pnl || 0) >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                        ${Number(trade.pnl || 0).toFixed(2)}
                      </td>
                      <td className="p-3 text-center">
                        <Badge className={cn("text-[8px] font-black uppercase", (trade.status || '').toUpperCase() === 'OPEN' ? 'bg-blue-500/20 text-blue-500' : 'bg-zinc-500/20 text-zinc-400')}>
                          {trade.status || '—'}
                        </Badge>
                      </td>
                      <td className="p-3 text-[10px] text-muted-foreground">
                        {trade.openedAt?.toDate ? format(trade.openedAt.toDate(), 'MMM d, HH:mm') : (trade.openTime?.toDate ? format(trade.openTime.toDate(), 'MMM d, HH:mm') : '—')}
                      </td>
                    </tr>
                  )} 
                />
              )}
            </TabsContent>

            <TabsContent value="breaches" className="m-0">
              <DataTable loading={false} data={tabData.breaches.filter((b: any) => b.id === nodeFilterId || b.userId === selectedUser?.id || b.email === selectedUser?.email || b.userId === selectedUser?.userId)} columns={['ACCOUNT', 'PLAN', 'STATUS', 'REASON', 'BREACHED AT']} renderRow={(b) => (
                <tr key={b.id} className="hover:bg-white/5 transition-colors">
                  <td className="p-3 font-mono text-[10px] text-zinc-400">{b.id}</td>
                  <td className="p-3 text-[10px] uppercase font-bold text-zinc-300">{b.planType}</td>
                  <td className="p-4 text-center"><Badge className="text-[8px] font-black uppercase bg-red-500/20 text-red-500">{b.status}</Badge></td>
                  <td className="p-3 text-xs text-red-400">{b.breachReason || '—'}</td>
                  <td className="p-3 text-xs text-muted-foreground">{b.updatedAt?.toDate ? format(b.updatedAt.toDate(), 'MMM d, HH:mm') : '—'}</td>
                </tr>
              )} />
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TabHeader({ title, count, onSearch }: { title: string, count?: number | string, onSearch?: (v: string) => void }) {
  return (
    <div className="flex flex-col md:flex-row justify-between items-center gap-4">
      <h2 className="text-xl font-headline font-bold uppercase tracking-tight">
        {title} {count !== undefined && <span className="text-primary ml-2 opacity-50">({count === -1 ? '...' : count})</span>}
      </h2>
      {onSearch && (
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search records..." onChange={e => onSearch(e.target.value)} className="pl-10 bg-secondary/30" />
        </div>
      )}
    </div>
  );
}
