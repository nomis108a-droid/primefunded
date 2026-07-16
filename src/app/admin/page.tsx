
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  Users, Activity, Search, Loader2, Database, ShieldCheck, RefreshCw, BarChart2, Monitor, Clock, Trophy, Skull, Megaphone, RotateCcw, Zap, Link as LinkIcon, Plus, Eye, Check, XCircle, Gift, History, ShieldAlert, CheckCircle2, Trash2, Settings2, Save, Network, BarChart3, Info, Wallet, User, TrendingUp, LogOut, ChevronLeft, ChevronRight, Upload, DollarSign, Globe, Check as CheckIcon, ChevronsUpDown
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
import { collection, query, orderBy, where, getCountFromServer, doc, onSnapshot, getAggregateFromServer, sum, getDoc, getDocs, addDoc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAuth } from '@/context/AuthContext';
import { ADMIN_EMAILS } from '@/lib/admin';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CONTRACT_SIZE } from '@/lib/rulesConfig';

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
        <h3 className="text-2xl font-headline font-bold text-white group-hover:text-primary transition-colors">{value}</h3>
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
      <StatCard title="Total Volume" value={`$${(stats.totalAum / 1e6).toFixed(2)}M`} icon={<BarChart2 />} color="green" />
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
    <TabHeader title="Compliance: Identity Review" count={stats.totalKycCount} />
    <DataTable loading={isLoading} data={users} columns={['Trader', 'Submission Date', 'Proof Front', 'Proof Back', 'Selfie', 'Actions']} renderRow={(u) => (
      <tr key={u.id} className="hover:bg-white/5 transition-colors">
        <td className="p-4 font-bold text-xs">{u.email}</td>
        <td className="p-4 text-xs text-muted-foreground">{u.kycSubmittedAt ? format(new Date(u.kycSubmittedAt), 'MMM d, HH:mm') : 'Recently'}</td>
        <td className="p-4 text-center">{u.idProofUrl && <a href={u.idProofUrl} target="_blank" className="text-primary hover:underline text-[9px] font-black uppercase">View Front</a>}</td>
        <td className="p-4 text-center">{u.idBackProofUrl && <a href={u.idBackProofUrl} target="_blank" className="text-primary hover:underline text-[9px] font-black uppercase">View Back</a>}</td>
        <td className="p-4 text-center">{u.selfieProofUrl && <a href={u.selfieProofUrl} target="_blank" className="text-primary hover:underline text-[9px] font-black uppercase">View Selfie</a>}</td>
        <td className="p-4 text-right space-x-2">
          <Button size="sm" className="h-7 text-[8px] bg-emerald-600" onClick={() => handleApproveKyc(u.id)} disabled={approvingUserId === u.id}>{approvingUserId === u.id ? <Loader2 className="w-3 h-3 animate-spin" /> : "Approve"}</Button>
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
  
  const [stats, setStats] = useState({ 
    totalUsersCount: 0, totalNodesCount: 0, totalAum: 0, pendingOrdersCount: 0, phasePassersCount: 0, totalLiquidationCount: 0, totalKycCount: 0 
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
  
  // Inspected User Detailed Data
  const [userTrades, setUserTrades] = useState<any[]>([]);
  const [userNodes, setUserNodes] = useState<any[]>([]);
  const [userBreaches, setUserBreaches] = useState<any[]>([]);
  const [tradesLoading, setTradesLoading] = useState(false);
  const [nodesLoading, setNodesLoading] = useState(false);
  const [breachesLoading, setBreachesLoading] = useState(false);

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

  const [userPage, setUserPage] = useState(1);
  const usersPerPage = 50;

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
    if (!isAuthenticated || !isAuthorized || authLoading) return;
    const now = Date.now();
    if (!force && now - lastRefreshTimeRef.current < 10000 && stats.totalUsersCount > 0) return;

    try {
      const fetchCount = async (q: any) => (await getCountFromServer(q)).data().count;
      const results = await Promise.allSettled([
        fetchCount(collection(db, 'users')),
        fetchCount(collection(db, 'demoAccounts')),
        fetchCount(query(collection(db, 'demoAccounts'), where('status', 'in', ['blown', 'breach', 'terminated']))),
        fetchCount(query(collection(db, 'demoAccounts'), where('status', '==', 'passed'))),
        fetchCount(query(collection(db, 'orders'), where('status', 'in', ['manual_review', 'completed', 'approved', 'rejected']))),
        getAggregateFromServer(query(collection(db, 'orders'), where('status', 'in', ['completed', 'approved'])), { totalVolume: sum('amountPaid') }),
        fetchCount(query(collection(db, 'users'), where('kycStatus', 'in', ['pending', 'verified', 'rejected'])))
      ]);

      const statsPayload: any = {};
      results.forEach((r, i) => {
        const val = r.status === 'fulfilled' ? r.value : 0;
        if (i === 0) statsPayload.totalUsersCount = val;
        if (i === 1) statsPayload.totalNodesCount = val;
        if (i === 2) statsPayload.totalLiquidationCount = val;
        if (i === 3) statsPayload.phasePassersCount = val;
        if (i === 4) statsPayload.pendingOrdersCount = val;
        if (i === 5) statsPayload.totalAum = (val as any)?.data?.()?.totalVolume || 0;
        if (i === 6) statsPayload.totalKycCount = val;
      });

      setStats(prev => ({ ...prev, ...statsPayload }));
      lastRefreshTimeRef.current = now;
    } catch (err: any) { console.error('[Admin-Stats] Refresh fault:', err.message); }
  }, [isAuthenticated, isAuthorized, authLoading, stats.totalUsersCount]);

  useEffect(() => {
    if (isAuthenticated && isAuthorized && !authLoading) {
      refreshStats(true);
      const timer = setInterval(() => refreshStats(true), 10000);
      return () => clearInterval(timer);
    }
  }, [isAuthenticated, isAuthorized, authLoading, refreshStats]);

  useEffect(() => {
    if (!isAuthenticated || !isAuthorized || authLoading) return;
    setIsLoading(true);
    let unsub: () => void = () => {};
    const term = debouncedSearchTerm.toLowerCase().trim();

    // SERVER-SIDE SEARCH LOGIC (Uncapped & Real-time)
    if (term && (activeTab === 'user-directory' || activeTab === 'trading-nodes')) {
      const path = activeTab === 'user-directory' ? 'users' : 'demoAccounts';
      const q = query(collection(db, path), where('email', '>=', term), where('email', '<=', term + '\uf8ff'));
      unsub = onSnapshot(q, (snap) => {
        setTabData((prev: any) => ({ ...prev, [activeTab === 'user-directory' ? 'users' : 'demoAccounts']: snap.docs.map(d => ({ id: d.id, ...d.data() })) }));
        setIsLoading(false);
      });
      return () => unsub();
    }

    // REAL-TIME SNAPSHOT LOGIC (Uncapped Default View)
    const qMap: any = {
      'overview': null,
      'user-directory': query(collection(db, 'users'), orderBy('createdAt', 'desc')),
      'trading-nodes': query(collection(db, 'demoAccounts'), orderBy('updatedAt', 'desc')),
      'breaches': query(collection(db, 'demoAccounts'), where('status', 'in', ['blown', 'breach', 'terminated']), orderBy('updatedAt', 'desc')),
      'phase-passers': query(collection(db, 'demoAccounts'), where('status', '==', 'passed'), orderBy('updatedAt', 'desc')),
      'order-review': query(collection(db, 'orders'), where('status', 'in', ['manual_review', 'completed', 'approved', 'rejected']), orderBy('submittedAt', 'desc')),
      'payout-hub': query(collection(db, 'payouts'), orderBy('createdAt', 'desc')),
      'trades-payouts': query(collection(db, 'featured_payouts'), orderBy('paidOut', 'desc')),
      'referral-audit': query(collection(db, 'referrals'), orderBy('createdAt', 'desc')),
      'kyc-hub': query(collection(db, 'users'), where('kycStatus', 'in', ['pending', 'verified', 'rejected'])),
      'broadcasts': query(collection(db, 'broadcasts'), orderBy('sentAt', 'desc'))
    };

    const targetQ = qMap[activeTab];
    if (targetQ) {
      unsub = onSnapshot(targetQ, (snap) => {
        const fieldMap: any = { 'user-directory': 'users', 'trading-nodes': 'demoAccounts', 'phase-passers': 'passers', 'breaches': 'breaches', 'order-review': 'orders', 'payout-hub': 'payouts', 'trades-payouts': 'featuredPayouts', 'referral-audit': 'referrals', 'kyc-hub': 'users', 'broadcasts': 'broadcasts' };
        setTabData((prev: any) => ({ ...prev, [fieldMap[activeTab]]: snap.docs.map(d => ({ id: d.id, ...d.data() })) }));
        setIsLoading(false);
      });
    } else {
      refreshStats();
      setIsLoading(false);
    }

    return () => unsub();
  }, [isAuthenticated, isAuthorized, authLoading, activeTab, debouncedSearchTerm, refreshStats]);

  useEffect(() => {
    const isVerified = localStorage.getItem('adminVerified') === 'true';
    if (isVerified) setIsAuthenticated(true);
  }, []);

  const handleAdminAuth = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPasswordInput === '93463962569392846256') {
      localStorage.setItem('adminVerified', 'true');
      setIsAuthenticated(true);
      setShowAdminModal(false);
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
      if (res.success) { toast({ title: "KYC Verified" }); refreshStats(true); }
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

  const handleViewUserByAccount = useCallback(async (userId: string) => {
    setActionLoading(true);
    try {
      const snap = await getDoc(doc(db, 'users', userId));
      if (snap.exists()) { setSelectedUser({ id: snap.id, ...snap.data() }); setInspectionTab('overview'); setNodeFilterId(null); setIsUserManagementOpen(true); }
    } finally { setActionLoading(false); }
  }, []);

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

  const handleResetSingleAccount = async (accountId: string) => {
    if (!confirm('WARNING: This will reset the account balance and history for this account only. Continue?')) return;
    setActionLoading(true);
    try {
      const res = await resetSingleAccountAction(accountId);
      if (res.success) {
        toast({ title: "Account Restored" });
        if (selectedUser) {
           const snap = await getDoc(doc(db, 'users', selectedUser.id));
           if (snap.exists()) setSelectedUser({ id: snap.id, ...snap.data() });
        }
      }
    } catch (e: any) {
      toast({ variant: "destructive", title: "Failed", description: e.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleGiftAccount = async () => {
    if (!giftForm.traderId && !giftForm.email) {
      toast({ variant: "destructive", title: "Input Required", description: "Please enter a Trader ID or Email." });
      return;
    }

    setActionLoading(true);
    try {
      const res = await giftAccountAction(
        giftForm.traderId,
        giftForm.email,
        `Gifted ${giftForm.plan.toUpperCase()} — $${giftForm.size / 1000}k`,
        giftForm.size,
        giftForm.plan,
        'evaluation'
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
      toast({ variant: "destructive", title: "Reason Required", description: "Please enter a rejection message." });
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
    const term = (payoutForm.country || '').toLowerCase().trim();
    if (!term) return COUNTRIES.slice(0, 100);
    return COUNTRIES.filter(c => 
      c.name.toLowerCase().includes(term) || 
      c.code.toLowerCase().includes(term)
    );
  }, [payoutForm.country]);

  // INSIGHT: Inspected User Dedicated Listeners
  useEffect(() => {
    if (!selectedUser?.id || !isUserManagementOpen) {
      setUserTrades([]);
      setUserNodes([]);
      setUserBreaches([]);
      return;
    }
    
    setTradesLoading(true);
    setNodesLoading(true);
    setBreachesLoading(true);

    const qT = query(collection(db, 'demoTrades'), where('userId', '==', selectedUser.id), orderBy('openedAt', 'desc'));
    const unsubT = onSnapshot(qT, (snap) => {
      setUserTrades(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setTradesLoading(false);
    });

    const qN = query(collection(db, 'demoAccounts'), where('userId', '==', selectedUser.id), orderBy('createdAt', 'desc'));
    const unsubN = onSnapshot(qN, (snap) => {
      setUserNodes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setNodesLoading(false);
    });

    const qB = query(collection(db, 'breaches'), where('userId', '==', selectedUser.id), orderBy('breachedAt', 'desc'));
    const unsubB = onSnapshot(qB, (snap) => {
      setUserBreaches(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setBreachesLoading(false);
    });
    
    return () => {
      unsubT();
      unsubN();
      unsubB();
    };
  }, [selectedUser?.id, isUserManagementOpen]);

  const filteredUsers = useMemo(() => (tabData.users || []).filter((u: any) => {
    const term = searchTerm.toLowerCase();
    return u.name?.toLowerCase().includes(term) || u.email?.toLowerCase().includes(term) || u.traderId?.toLowerCase().includes(term);
  }), [tabData.users, searchTerm]);

  const paginatedUsers = useMemo(() => {
    const start = (userPage - 1) * usersPerPage;
    return filteredUsers.slice(start, start + usersPerPage);
  }, [filteredUsers, userPage]);

  const totalUserPages = Math.ceil(filteredUsers.length / usersPerPage);

  const filteredOrders = useMemo(() => (tabData.orders || []).filter((o: any) => {
    const term = searchTerm.toLowerCase();
    return o.email?.toLowerCase().includes(term) || o.id.toLowerCase().includes(term);
  }), [tabData.orders, searchTerm]);

  if (!isAuthenticated && !showAdminModal) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="w-full max-w-md bg-zinc-950 border-zinc-800">
           <CardHeader><CardTitle>Administrative Login</CardTitle><CardDescription>Enter master key.</CardDescription></CardHeader>
           <CardContent><form onSubmit={handleAdminAuth} className="space-y-4"><Input type="password" value={adminPasswordInput} onChange={e => setAdminPasswordInput(e.target.value)} placeholder="Master Key" className="bg-zinc-900 border-zinc-800" />{adminError && <p className="text-xs text-destructive font-bold">{adminError}</p>}<Button type="submit" className="w-full font-black cyan-box-glow">UNLOCK</Button></form></CardContent>
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
             <div className="px-4 py-2 rounded-xl bg-secondary/50 border border-border flex items-center gap-3"><div className="p-1.5 rounded-lg bg-primary/10 text-primary"><Database size={16} /></div><div><p className="text-[8px] font-black uppercase text-zinc-500 tracking-widest">Instance</p><p className="text-xs font-mono font-bold text-white">{instanceId}</p></div></div>
             <div className="flex gap-2">
                <Button variant="outline" className="h-10 rounded-xl font-bold" onClick={handleResetHistory} disabled={actionLoading}><RotateCcw className="w-4 h-4 mr-2" /> Friday Rule Reset</Button>
                <Button className="h-10 rounded-xl font-black bg-primary text-black" onClick={() => router.push('/admin/price-tracker')} disabled={actionLoading}>
                   <RefreshCw className="w-4 h-4 mr-2" />
                   Price Synchronizer
                </Button>
                <Button className="h-10 rounded-xl font-black bg-primary text-black" onClick={() => setIsGiftModalOpen(true)}><Gift className="w-4 h-4 mr-2" /> Gift Account</Button>
                <Button variant="outline" className="h-10 w-10 p-0" onClick={() => refreshStats(true)} disabled={isLoading}><RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} /></Button>
                <Button variant="outline" className="h-10 w-10 p-0" asChild><Link href="/dashboard"><LogOut size={16} /></Link></Button>
             </div>
          </div>
        </header>

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

          <TabsContent value="payout-hub">
            <div className="space-y-6">
              <TabHeader title="Finance: Payout Hub" count={tabData.payouts.length} />
              <DataTable loading={isLoading} data={tabData.payouts} columns={['Trader Email', 'Amount', 'Method', 'Date', 'Status']} renderRow={(p) => (
                <tr key={p.id} className="hover:bg-white/5 transition-colors">
                  <td className="p-4 font-bold text-xs">{p.email}</td>
                  <td className="p-4 font-mono text-emerald-500 font-bold">${parseFloat(p.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="p-4 text-xs text-muted-foreground">{p.method}</td>
                  <td className="p-4 text-xs text-muted-foreground">{p.date || (p.createdAt?.toDate ? format(p.createdAt.toDate(), 'MMM d, yyyy HH:mm') : '—')}</td>
                  <td className="p-4 text-right">
                    <Badge className={cn("text-[8px] font-black uppercase border-none", (p.status === 'done' || p.status === 'approved' || p.status === 'completed') ? "bg-emerald-500/20 text-emerald-500" : p.status === 'rejected' ? "bg-destructive/20 text-destructive" : "bg-amber-500/20 text-amber-500")}>{p.status}</Badge>
                  </td>
                </tr>
              )} />
            </div>
          </TabsContent>

          <TabsContent value="trades-payouts">
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <TabHeader title="Showcase: Trades Payouts" count={tabData.featuredPayouts.length} />
                <Button size="sm" className="font-bold" onClick={() => { setPayoutForm({ id: '', name: '', country: '', countryFlag: '', paidOut: '', payoutsCount: '' }); setPayoutProofFile(null); setIsFeaturedPayoutModalOpen(true); }}><Plus className="w-4 h-4 mr-2" /> Add Entry</Button>
              </div>
              <DataTable loading={isLoading} data={filteredFeaturedPayouts} columns={['Trader', 'Country', 'Paid Out', 'Payouts', 'Proof', 'Actions']} renderRow={(p) => (
                <tr key={p.id} className="hover:bg-white/5 transition-colors">
                  <td className="p-4 font-bold text-xs">{p.name}</td>
                  <td className="p-4 text-xs text-muted-foreground">{p.countryFlag} {p.country}</td>
                  <td className="p-4 font-mono text-emerald-500 font-bold">${(p.paidOut || 0).toLocaleString()}</td>
                  <td className="p-4 text-xs text-muted-foreground">{p.payoutsCount || 1}</td>
                  <td className="p-4 text-center">{p.proofUrl ? <a href={p.proofUrl} target="_blank" className="text-primary hover:underline text-[9px] font-black uppercase">View Proof</a> : <span className="text-zinc-600 text-[9px]">None</span>}</td>
                  <td className="p-4 text-right space-x-2">
                    <Button variant="outline" size="sm" className="h-7 text-[8px]" onClick={() => { setPayoutForm({ id: p.id, name: p.name || '', country: p.country || '', countryFlag: p.countryFlag || '', paidOut: String(p.paidOut || ''), payoutsCount: String(p.payoutsCount || '') }); setIsFeaturedPayoutModalOpen(true); }}>Edit</Button>
                    <Button variant="destructive" size="sm" className="h-7 text-[8px]" onClick={async () => { if (confirm('Delete this featured payout?')) { await deleteDoc(doc(db, 'featured_payouts', p.id)); } }}>Del</Button>
                  </td>
                </tr>
              )} />
            </div>
          </TabsContent>

          <TabsContent value="trading-nodes">
            <div className="space-y-6">
              <TabHeader title="CHALLENGE NODE REGISTRY" count={tabData.demoAccounts.length} onSearch={setSearchTerm} />
              <DataTable 
                loading={isLoading} 
                data={tabData.demoAccounts} 
                columns={['ACCOUNT ID', 'PLAN / PHASE', 'BALANCE', 'EQUITY', 'STATUS', 'ACTIONS']} 
                renderRow={(acc) => (
                  <tr key={acc.id} className="hover:bg-white/5 transition-colors border-b border-white/5">
                    <td className="p-4">
                      <button 
                        onClick={() => handleViewUserByAccount(acc.userId)}
                        className="text-primary hover:underline font-mono text-[11px] font-bold text-left block"
                      >
                        {acc.id}
                      </button>
                      <span className="text-[10px] text-zinc-500 font-medium">{acc.email}</span>
                    </td>
                    <td className="p-4">
                      <span className="text-[10px] font-black uppercase tracking-tight text-zinc-300">
                        {acc.planType || acc.plan} - {acc.phase}
                      </span>
                    </td>
                    <td className="p-4 font-mono text-xs font-bold text-zinc-300">
                      ${(acc.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 })}
                    </td>
                    <td className="p-4 font-mono text-xs font-bold text-zinc-300">
                      ${(acc.equity || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 })}
                    </td>
                    <td className="p-4">
                      <Badge className={cn(
                        "text-[8px] font-black uppercase px-2 h-5 border-none",
                        (acc.status === 'blown' || acc.status === 'breach' || acc.status === 'terminated') 
                          ? "bg-red-500/20 text-red-500" 
                          : "bg-emerald-500/20 text-emerald-500"
                      )}>
                        {acc.status}
                      </Badge>
                    </td>
                    <td className="p-4 text-right">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="h-8 text-[10px] font-black uppercase border-white/10 hover:bg-white/5"
                        onClick={() => handleViewUserByAccount(acc.userId)}
                      >
                        <Eye className="w-3.5 h-3.5 mr-2" /> Inspect
                      </Button>
                    </td>
                  </tr>
                )} 
              />
            </div>
          </TabsContent>

          <TabsContent value="breaches">
            <div className="space-y-6">
              <TabHeader title="Risk: Breach Incidents" count={tabData.breaches.length} />
              <DataTable loading={isLoading} data={tabData.breaches} columns={['Trader ID', 'Account', 'Plan', 'Breach Reason', 'Balance', 'Status']} renderRow={(acc) => (
                <tr key={acc.id} className="hover:bg-white/5 transition-colors">
                  <td className="p-4 font-mono text-[10px] text-primary">{acc.userId?.slice(0, 12)}</td>
                  <td className="p-4 text-xs font-bold">{acc.label || acc.id?.slice(0, 10)}</td>
                  <td className="p-4"><Badge variant="outline" className="text-[8px] font-black uppercase border-white/10">{acc.planType || acc.plan || '—'}</Badge></td>
                  <td className="p-4 text-xs text-destructive max-w-[200px] truncate">{acc.breachReason || 'Risk limit exceeded'}</td>
                  <td className="p-4 font-mono text-xs">${(acc.balance || 0).toLocaleString()}</td>
                  <td className="p-4 text-right"><Badge className="text-[8px] font-black uppercase bg-destructive/20 text-destructive border-none">{acc.status}</Badge></td>
                </tr>
              )} />
            </div>
          </TabsContent>

          <TabsContent value="order-review">
            <div className="space-y-6">
              <TabHeader title="Commerce: Order Review" count={tabData.orders.length} onSearch={setSearchTerm} />
              <DataTable loading={isLoading} data={filteredOrders} columns={['Email', 'Plan', 'Size', 'Amount', 'Network', 'Status', 'Actions']} renderRow={(o) => (
                <tr key={o.id} className="hover:bg-white/5 transition-colors">
                  <td className="p-4 font-bold text-xs">{o.email}</td>
                  <td className="p-4 text-xs text-muted-foreground">{o.plan}</td>
                  <td className="p-4 text-xs">{o.accountSize}</td>
                  <td className="p-4 font-mono text-xs">${parseFloat(o.amountPaid || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="p-4 text-[10px] text-muted-foreground uppercase">{o.network || o.coin || '—'}</td>
                  <td className="p-4 text-right">
                    <Badge className={cn("text-[8px] font-black uppercase border-none", (o.status === 'completed' || o.status === 'approved') ? "bg-emerald-500/20 text-emerald-500" : o.status === 'rejected' ? "bg-destructive/20 text-destructive" : "bg-amber-500/20 text-amber-500")}>{o.status}</Badge>
                  </td>
                  <td className="p-4 text-right space-x-2">
                    {o.status === 'manual_review' && (
                      <Button size="sm" className="h-7 text-[8px] bg-emerald-600" onClick={() => handleApproveOrder(o.id)} disabled={approvingOrderId === o.id}>
                        {approvingOrderId === o.id ? <Loader2 className="w-3 h-3 animate-spin" /> : "Approve"}
                      </Button>
                    )}
                    {o.status === 'manual_review' && (
                      <Button size="sm" variant="destructive" className="h-7 text-[8px]" onClick={() => { setRejectingOrderId(o.id); setRejectReason(''); setIsRejectModalOpen(true); }}>Reject</Button>
                    )}
                    {o.proofScreenshotUrl && <a href={o.proofScreenshotUrl} target="_blank" className="text-primary hover:underline text-[9px] font-black uppercase">Proof</a>}
                  </td>
                </tr>
              )} />
            </div>
          </TabsContent>

          <TabsContent value="referral-audit">
            <div className="space-y-6">
              <TabHeader title="Growth: Referral Audit" count={tabData.referrals.length} />
              <DataTable loading={isLoading} data={tabData.referrals} columns={['Referred User', 'Referrer ID', 'Amount', 'Date', 'Status']} renderRow={(r) => (
                <tr key={r.id} className="hover:bg-white/5 transition-colors">
                  <td className="p-4 font-bold text-xs">{r.referredUserEmail || 'Anonymous'}</td>
                  <td className="p-4 font-mono text-[10px] text-zinc-400">{r.referrerId?.slice(0, 12)}</td>
                  <td className="p-4 font-mono text-emerald-500 text-xs">${(r.amount || 0).toFixed(2)}</td>
                  <td className="p-4 text-xs text-muted-foreground">{r.createdAt?.toDate ? format(r.createdAt.toDate(), 'MMM d, yyyy') : '—'}</td>
                  <td className="p-4 text-right"><Badge className={cn("text-[8px] font-black uppercase border-none", r.status === 'funded' ? "bg-emerald-500/20 text-emerald-500" : r.status === 'paid' ? "bg-blue-500/20 text-blue-500" : "bg-zinc-700/50 text-zinc-400")}>{r.status || 'pending'}</Badge></td>
                </tr>
              )} />
            </div>
          </TabsContent>

          <TabsContent value="user-directory">
            <div className="space-y-6">
              <TabHeader title="Identity: User Directory" count={tabData.users.length} onSearch={setSearchTerm} />
              <DataTable loading={isLoading} data={paginatedUsers} columns={['Name', 'Email', 'Country', 'KYC', 'Joined', 'Actions']} renderRow={(u) => (
                <tr key={u.id} className="hover:bg-white/5 transition-colors">
                  <td className="p-4 font-bold text-xs">{u.name || 'Trader'}</td>
                  <td className="p-4 text-xs text-muted-foreground">{u.email}</td>
                  <td className="p-4 text-xs text-muted-foreground">{u.country || '—'}</td>
                  <td className="p-4"><Badge className={cn("text-[8px] font-black uppercase border-none", u.kycVerified || u.kycStatus === 'verified' ? "bg-emerald-500/20 text-emerald-500" : u.kycStatus === 'rejected' ? "bg-destructive/20 text-destructive" : u.kycStatus === 'pending' ? "bg-amber-500/20 text-amber-500" : "bg-zinc-700/50 text-zinc-500")}>{u.kycVerified ? 'verified' : u.kycStatus || 'not submitted'}</Badge></td>
                  <td className="p-4 text-xs text-muted-foreground">{u.createdAt?.toDate ? format(u.createdAt.toDate(), 'MMM d, yyyy') : '—'}</td>
                  <td className="p-4 text-right"><Button variant="outline" size="sm" onClick={() => handleViewUserByAccount(u.id)}><Eye className="w-3 h-3 mr-1" /> Inspect</Button></td>
                </tr>
              )} />
              
              {totalUserPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-xs text-muted-foreground">Showing {paginatedUsers.length} of {filteredUsers.length} traders</p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={userPage === 1} onClick={() => setUserPage(p => p - 1)}><ChevronLeft className="w-4 h-4 mr-1" /> Prev</Button>
                    <Button variant="outline" size="sm" disabled={userPage === totalUserPages} onClick={() => setUserPage(p => p + 1)}>Next <ChevronRight className="w-4 h-4 ml-1" /></Button>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="broadcasts">
            <div className="space-y-6">
              <TabHeader title="Communications: Broadcasts" count={tabData.broadcasts.length} />
              <DataTable loading={isLoading} data={tabData.broadcasts} columns={['Sent At', 'Title', 'Message', 'Type']} renderRow={(b) => (
                <tr key={b.id} className="hover:bg-white/5 transition-colors">
                  <td className="p-4 text-xs text-muted-foreground">{b.sentAt?.toDate ? format(b.sentAt.toDate(), 'MMM d, HH:mm') : '—'}</td>
                  <td className="p-4 font-bold text-xs text-white">{b.title}</td>
                  <td className="p-4 text-[10px] text-zinc-400 max-w-xs truncate">{b.message}</td>
                  <td className="p-4"><Badge className="bg-primary/20 text-primary text-[8px] uppercase">{b.type}</Badge></td>
                </tr>
              )} />
            </div>
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={isFeaturedPayoutModalOpen} onOpenChange={setIsFeaturedPayoutModalOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-md">
          <DialogHeader>
            <DialogTitle>{payoutForm.id ? 'Edit' : 'Add'} Featured Payout</DialogTitle>
            <DialogDescription className="visually-hidden">Configure featured payout entry for public leaderboard.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
             <div className="space-y-2"><Label>Trader Name</Label><Input value={payoutForm.name} onChange={e => setPayoutForm({...payoutForm, name: e.target.value})} className="bg-zinc-900 border-zinc-800" /></div>
             <div className="space-y-2 relative">
                <Label>Country</Label>
                <div className="relative">
                  <Input 
                    placeholder="Search country..." 
                    value={payoutForm.country} 
                    onChange={e => {
                      setPayoutForm({...payoutForm, country: e.target.value});
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
                              e.stopPropagation();
                              setPayoutForm(prev => ({ ...prev, country: c.name, countryFlag: c.flag }));
                              setIsCountryAutocompleteOpen(false);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-white/5 rounded-md text-left transition-colors group"
                          >
                            <span className="text-base">{c.flag}</span>
                            <span className="text-zinc-300 group-hover:text-white">{c.name}</span>
                            {payoutForm.country === c.name && <CheckIcon className="h-3 w-3 text-primary ml-auto" />}
                          </button>
                        ))}
                      </div>
                    </ScrollArea>
                  </Card>
                )}
             </div>
             <div className="grid grid-cols-2 gap-4">
               <div className="space-y-2"><Label>Paid Out ($)</Label><Input type="number" value={payoutForm.paidOut} onChange={e => setPayoutForm({...payoutForm, paidOut: e.target.value})} className="bg-zinc-900 border-zinc-800" /></div>
               <div className="space-y-2"><Label>Total Payouts Count</Label><Input type="number" value={payoutForm.payoutsCount} onChange={e => setPayoutForm({...payoutForm, payoutsCount: e.target.value})} className="bg-zinc-900 border-zinc-800" /></div>
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
            <div className="space-y-2"><Label>Trader ID or Email</Label><Input value={giftForm.traderId} onChange={e => setGiftForm({...giftForm, traderId: e.target.value})} className="bg-zinc-900 border-zinc-800" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Account Size</Label><Select onValueChange={v => setGiftForm({...giftForm, size: parseInt(v)})}>
                <SelectTrigger className="bg-zinc-900 border-zinc-800"><SelectValue placeholder="100k" /></SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                  {[5, 10, 25, 50, 100, 200, 300].map(s => <SelectItem key={s} value={`${s*1000}`}>${s}k</SelectItem>)}
                </SelectContent>
              </Select></div>
              <div className="space-y-2"><Label>Plan Type</Label><Select onValueChange={v => setGiftForm({...giftForm, plan: v})}>
                <SelectTrigger className="bg-zinc-900 border-zinc-800"><SelectValue placeholder="1-Step Pro" /></SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                  <SelectItem value="1-step-pro">1-Step Pro</SelectItem>
                  <SelectItem value="2-step-classic">2-Step Classic</SelectItem>
                  <SelectItem value="3-step-classic">3-Step Classic</SelectItem>
                  <SelectItem value="instant-funding">Instant Funding</SelectItem>
                  <SelectItem value="instant-pro">Instant Pro</SelectItem>
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
            <Textarea value={kycRejectReason} onChange={e => setKycRejectReason(e.target.value)} placeholder="e.g. Blurry ID photo..." className="bg-zinc-900 border-zinc-800" />
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
            <Textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="e.g. Proof mismatch..." className="bg-zinc-900 border-zinc-800" />
          </div>
          <DialogFooter>
             <Button variant="outline" onClick={() => setIsRejectModalOpen(false)}>Cancel</Button>
             <Button variant="destructive" onClick={handleRejectOrder}>Reject Order</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isUserManagementOpen} onOpenChange={setIsUserManagementOpen}>
        <DialogContent className="max-w-5xl bg-zinc-950 border-zinc-800 text-white max-h-[90vh] flex flex-col p-0 overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)]">
          <DialogHeader className="p-6 border-b border-white/5 bg-zinc-900/20 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-5">
                <Avatar className="w-14 h-14 border-2 border-primary/20 p-1 bg-primary/5">
                  {selectedUser?.photoURL ? <AvatarImage src={selectedUser.photoURL} /> : null}
                  <AvatarFallback className="bg-primary/10 text-primary font-black text-xl">PF</AvatarFallback>
                </Avatar>
                <div>
                  <DialogTitle className="text-2xl font-headline font-bold text-white uppercase tracking-tight">{selectedUser?.name || 'Trader'}</DialogTitle>
                  <DialogDescription className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 flex items-center gap-2">
                    Trader GUID: <span className="text-zinc-300 font-mono">{selectedUser?.id}</span>
                  </DialogDescription>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge className="bg-primary text-black text-[10px] font-black uppercase px-4 h-7 rounded-lg">
                  {selectedUser?.tier || 'Bronze'}
                </Badge>
                <Badge variant="outline" className={cn(
                  "text-[10px] font-black uppercase px-4 h-7 rounded-lg",
                  selectedUser?.kycVerified ? "border-emerald-500/30 text-emerald-500 bg-emerald-500/5" : "border-destructive/30 text-destructive bg-destructive/5"
                )}>
                  KYC: {selectedUser?.kycStatus || 'None'}
                </Badge>
              </div>
            </div>
          </DialogHeader>

          {/* Tabs Section */}
          <Tabs value={inspectionTab} onValueChange={setInspectionTab} className="flex-1 flex flex-col min-h-0">
            <div className="px-6 border-b border-white/5 bg-zinc-900/30 shrink-0">
              <TabsList className="bg-transparent h-14 justify-start p-0 gap-10">
                {['Overview', 'Trading Nodes', 'Trade History', 'Breach Logs'].map(tab => (
                  <TabsTrigger 
                    key={tab} 
                    value={tab.toLowerCase().replace(/ /g, '-')} 
                    className="data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 h-full text-[11px] font-black uppercase tracking-widest text-muted-foreground transition-all"
                  >
                    {tab}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-zinc-950/50">
              <TabsContent value="overview" className="m-0 space-y-8">
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="p-6 rounded-2xl bg-secondary/30 border border-white/5 space-y-2">
                      <p className="text-[9px] font-black uppercase text-zinc-500 tracking-[0.2em]">Email Address</p>
                      <p className="text-sm font-bold text-white">{selectedUser?.email}</p>
                    </div>
                    <div className="p-6 rounded-2xl bg-secondary/30 border border-white/5 space-y-2">
                      <p className="text-[9px] font-black uppercase text-zinc-500 tracking-[0.2em]">Phone Identity</p>
                      <p className="text-sm font-bold text-white">{selectedUser?.phone || 'Not Provided'}</p>
                    </div>
                    <div className="p-6 rounded-2xl bg-secondary/30 border border-white/5 space-y-2">
                      <p className="text-[9px] font-black uppercase text-zinc-500 tracking-[0.2em]">Country</p>
                      <p className="text-sm font-bold text-white">{selectedUser?.country || '—'}</p>
                    </div>
                    <div className="p-6 rounded-2xl bg-secondary/30 border border-white/5 space-y-2">
                      <p className="text-[9px] font-black uppercase text-zinc-500 tracking-[0.2em]">Join Date</p>
                      <p className="text-sm font-bold text-white">{selectedUser?.createdAt?.toDate ? format(selectedUser.createdAt.toDate(), 'PPP') : '—'}</p>
                    </div>
                    <div className="p-6 rounded-2xl bg-secondary/30 border border-white/5 space-y-2">
                      <p className="text-[9px] font-black uppercase text-zinc-500 tracking-[0.2em]">Account Status</p>
                      <p className={cn("text-sm font-bold uppercase", selectedUser?.status === 'active' ? "text-emerald-500" : "text-destructive")}>{selectedUser?.status || 'active'}</p>
                    </div>
                    <div className="p-6 rounded-2xl bg-secondary/30 border border-white/5 space-y-2">
                      <p className="text-[9px] font-black uppercase text-zinc-500 tracking-widest">Global Liquidity (Profile)</p>
                      <p className="text-sm font-mono font-bold text-white">${(selectedUser?.balance || 0).toLocaleString()}</p>
                    </div>
                 </div>
              </TabsContent>

              <TabsContent value="trading-nodes" className="m-0 space-y-6">
                {nodesLoading ? (
                  <div className="py-20 flex flex-col items-center justify-center space-y-4">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Mapping user nodes...</p>
                  </div>
                ) : userNodes.length === 0 ? (
                  <div className="py-20 text-center flex flex-col items-center justify-center opacity-20">
                    <Monitor className="w-12 h-12 mb-4" />
                    <p className="text-[10px] font-black uppercase tracking-widest">No active trading nodes provisioned.</p>
                  </div>
                ) : (
                  userNodes.map((acc: any) => {
                    const isLiquidated = ['blown', 'breach', 'terminated'].includes(acc.status);
                    return (
                      <Card key={acc.id} className="bg-zinc-900/40 border-zinc-800/60 overflow-hidden group shadow-xl">
                        <CardHeader className="p-6 flex flex-row items-center justify-between border-b border-white/5 bg-zinc-900/20">
                          <div className="space-y-1">
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">{acc.planType || acc.plan}</p>
                            <CardTitle className="text-base font-bold text-white">{acc.label}</CardTitle>
                          </div>
                          <div className="flex items-center gap-3">
                            <Badge className={cn(
                              "text-[9px] font-black uppercase px-3 h-6 border-none",
                              acc.status === 'active' ? "bg-emerald-500/20 text-emerald-500" : "bg-red-500/20 text-red-500"
                            )}>
                              {acc.status}
                            </Badge>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="h-8 text-[9px] font-black uppercase border-red-500/30 text-red-500 hover:bg-red-500/10" 
                              onClick={(e) => { e.stopPropagation(); handleResetSingleAccount(acc.id); }}
                            >
                              <RefreshCw className="w-3 h-3 mr-2" /> RESET BALANCE
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent className="p-6 space-y-6">
                           <div className="grid grid-cols-2 gap-8">
                              <div className="space-y-1">
                                <p className="text-[9px] font-black uppercase text-zinc-500 tracking-widest">Node Balance</p>
                                <p className="text-xl font-mono font-black text-white">${(acc.balance || 0).toLocaleString()}</p>
                              </div>
                              <div className="space-y-1">
                                <p className="text-[9px] font-black uppercase text-zinc-500 tracking-widest">Account Equity</p>
                                <p className="text-xl font-mono font-black text-white">${(acc.equity || 0).toLocaleString()}</p>
                              </div>
                           </div>
                           <Button 
                              variant="outline" 
                              size="sm" 
                              className="w-full text-[10px] font-black uppercase tracking-widest mt-2" 
                              onClick={() => { setNodeFilterId(acc.id); setInspectionTab('trade-history'); }}
                            >
                              View Node Execution History <History className="w-3 h-3 ml-2" />
                           </Button>
                           {isLiquidated && (
                             <div className="p-4 rounded-xl bg-red-500/5 border border-red-500/10">
                                <p className="text-[9px] font-black uppercase text-red-500 tracking-[0.2em] mb-2">Termination Reason</p>
                                <p className="text-[11px] font-medium text-red-400 italic leading-relaxed">
                                  "{acc.breachReason || 'Risk management violation detected. Account access restricted.'}"
                                </p>
                             </div>
                           )}
                        </CardContent>
                      </Card>
                    );
                  })
                )}
              </TabsContent>

              <TabsContent value="trade-history" className="m-0">
                {tradesLoading ? (
                  <div className="py-20 flex flex-col items-center justify-center space-y-4">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Retrieving ledger data...</p>
                  </div>
                ) : userTrades.length === 0 ? (
                  <div className="py-20 text-center flex flex-col items-center justify-center opacity-20">
                    <History className="w-12 h-12 mb-4" />
                    <p className="text-[10px] font-black uppercase tracking-widest">No trade records found for this node.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <div className="flex justify-between items-center mb-4 bg-secondary/30 p-3 rounded-lg border border-white/5">
                      <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Execution Ledger {nodeFilterId && <span className="text-primary ml-2">— Filtering Node: {nodeFilterId.slice(0, 8)}</span>}</p>
                      {nodeFilterId && <Button variant="ghost" className="h-6 text-[8px] font-black text-primary hover:text-white" onClick={() => setNodeFilterId(null)}>Clear Filter</Button>}
                    </div>
                    <table className="w-full text-xs text-left">
                      <thead className="text-[10px] uppercase font-black text-zinc-600 tracking-widest border-b border-white/5">
                        <tr>
                          <th className="py-4 px-2">Symbol</th>
                          <th className="py-4 px-2">Type</th>
                          <th className="py-4 px-2">Lots</th>
                          <th className="py-4 px-2 text-right">Open</th>
                          <th className="py-4 px-2 text-right">Close</th>
                          <th className="py-4 px-2 text-right">PnL</th>
                          <th className="py-4 px-2 text-center">Status</th>
                          <th className="py-4 px-2 text-right">Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {userTrades.filter(t => !nodeFilterId || t.accountId === nodeFilterId).map(t => {
                          const openDate = getTradeDate(t.openedAt);
                          return (
                            <tr key={t.id} className="hover:bg-white/5 transition-colors">
                              <td className="py-3 px-2 font-bold text-white">{t.symbol}</td>
                              <td className="py-3 px-2 uppercase font-black text-[10px] text-zinc-500">{t.type}</td>
                              <td className="py-3 px-2 font-mono">{t.lots}</td>
                              <td className="py-3 px-2 text-right font-mono text-zinc-500">${t.openPrice}</td>
                              <td className="py-3 px-2 text-right font-mono text-zinc-500">${t.closePrice || '—'}</td>
                              <td className={cn("py-3 px-2 text-right font-bold font-mono", (t.pnl || 0) >= 0 ? "text-emerald-500" : "text-red-500")}>
                                ${(t.pnl || 0).toLocaleString()}
                              </td>
                              <td className="py-3 px-2 text-center">
                                <Badge className={cn("text-[8px] uppercase px-1.5", t.status === 'open' ? 'bg-primary/20 text-primary' : 'bg-zinc-800 text-zinc-500')}>
                                  {t.status}
                                </Badge>
                              </td>
                              <td className="py-3 px-2 text-right text-zinc-500 text-[10px]">
                                {openDate ? format(openDate, 'MMM d, HH:mm') : '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="breach-logs" className="m-0 space-y-6">
                 {breachesLoading ? (
                   <div className="py-20 flex flex-col items-center justify-center space-y-4">
                     <Loader2 className="w-8 h-8 animate-spin text-primary" />
                     <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Audit in progress...</p>
                   </div>
                 ) : userBreaches.length === 0 ? (
                   <div className="py-20 text-center flex flex-col items-center justify-center opacity-20">
                     <Skull className="w-12 h-12 mb-4" />
                     <p className="text-[10px] font-black uppercase tracking-widest">No risk violations on record.</p>
                   </div>
                 ) : (
                   <div className="space-y-4">
                     {userBreaches.map((b) => (
                       <Card key={b.id} className="bg-destructive/5 border-destructive/20 overflow-hidden">
                         <div className="p-4 flex items-start gap-4">
                           <div className="p-2 bg-destructive/10 rounded-lg text-destructive shrink-0">
                             <ShieldAlert size={18} />
                           </div>
                           <div className="flex-1 space-y-1">
                             <div className="flex justify-between items-center">
                               <p className="text-[10px] font-black uppercase text-destructive tracking-widest">{b.type || 'HARD'} BREACH</p>
                               <p className="text-[9px] text-zinc-500 font-bold uppercase">{b.breachedAt?.toDate ? format(b.breachedAt.toDate(), 'MMM d, HH:mm') : 'Recently'}</p>
                             </div>
                             <p className="text-sm font-bold text-white">{b.reason || 'Risk limit exceeded.'}</p>
                             <p className="text-[10px] text-zinc-500 font-mono">Incident ID: {b.id}</p>
                           </div>
                         </div>
                       </Card>
                     ))}
                   </div>
                 )}
              </TabsContent>
            </div>

            <div className="p-8 border-t border-white/5 bg-zinc-900/30 flex justify-center">
              <Button variant="outline" className="font-black h-14 px-16 rounded-2xl uppercase tracking-[0.2em] border-white/10 hover:bg-white/5 text-sm" onClick={() => setIsUserManagementOpen(false)}>
                Close Inspection
              </Button>
            </div>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TabHeader({ title, count, onSearch }: { title: string, count?: number, onSearch?: (v: string) => void }) {
  return (
    <div className="flex flex-col md:flex-row justify-between items-center gap-4">
      <h2 className="text-xl font-headline font-bold uppercase tracking-tight">{title} {count !== undefined && <span className="text-primary ml-2 opacity-50">({count})</span>}</h2>
      {onSearch && (
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search records..." onChange={e => onSearch(e.target.value)} className="pl-10 bg-secondary/30" />
        </div>
      )}
    </div>
  );
}
