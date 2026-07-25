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

interface UserProfile {
  id: string;
  email: string;
  name?: string;
  displayName?: string;
  phone?: string;
  country?: string;
  createdAt?: any;
  kycStatus?: string;
  kycVerified?: boolean;
  tier?: string;
  traderId?: string;
  accountStatus?: string;
  globalLiquidity?: string | number;
  liquidity?: string | number;
  updatedAt?: any;
  _demoAccountId?: string;
  planType?: string;
  startBalance?: number;
  balance?: number;
  equity?: number;
  phase?: string;
  accountSize?: string | number;
}

interface DemoAccount {
  id: string;
  userId: string;
  email: string;
  status?: string;
  globalLiquidity?: number;
  liquidity?: number;
  updatedAt?: any;
  startBalance?: number;
  balance?: number;
  equity?: number;
  plan?: string;
  planType?: string;
  phase?: string;
  label?: string;
  [key: string]: any;
}

interface AdminTabData {
  users: UserProfile[];
  orders: any[];
  payouts: any[];
  referrals: any[];
  broadcasts: any[];
  demoAccounts: DemoAccount[];
  breaches: any[];
  passers: any[];
  featuredPayouts: any[];
}

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

const OverviewTab = memo(({ stats, tabData, onActiveTabChange }: { stats: any, tabData: AdminTabData, onActiveTabChange: (tab: string) => void }) => (
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
  
  const [stats, setStats] = useState({ 
    totalUsersCount: 0, totalNodesCount: 0, totalAum: 0, pendingOrdersCount: 0, phasePassersCount: 0, totalLiquidationCount: 0, totalKycCount: 0 
  });

  const lastRefreshTimeRef = useRef(0);

  const [tabData, setTabData] = useState<AdminTabData>({
    users: [], orders: [], payouts: [], referrals: [], broadcasts: [], demoAccounts: [], breaches: [], passers: [], featuredPayouts: []
  });

  const [isLoading, setIsLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [approvingOrderId, setApprovingOrderId] = useState<string | null>(null);
  const [approvingKycUserId, setApprovingKycUserId] = useState<string | null>(null);
  const { toast } = useToast();

  const [isUserManagementOpen, setIsUserManagementOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
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
        if (i === 0) statsPayload.totalUsersCount = val as number;
        if (i === 1) statsPayload.totalNodesCount = val as number;
        if (i === 2) statsPayload.totalLiquidationCount = val as number;
        if (i === 3) statsPayload.phasePassersCount = val as number;
        if (i === 4) statsPayload.pendingOrdersCount = val as number;
        if (i === 5) statsPayload.totalAum = ((val as any)?.data?.()?.totalVolume) || 0;
        if (i === 6) statsPayload.totalKycCount = val as number;
      });

      setStats(prev => ({ ...prev, ...statsPayload }));
      lastRefreshTimeRef.current = now;
    } catch (err: any) { console.error('[Admin-Stats] Refresh fault:', err.message); }
  }, [isAuthenticated, isAuthorized, authLoading, stats.totalUsersCount]);

  useEffect(() => {
    if (!isAuthenticated || !isAuthorized || authLoading) return;
    setIsLoading(true);
    let unsub: () => void = () => {};
    const term = debouncedSearchTerm.toLowerCase().trim();

    if (term && (activeTab === 'user-directory' || activeTab === 'trading-nodes')) {
      const path = activeTab === 'user-directory' ? 'users' : 'demoAccounts';
      const q = query(collection(db, path), where('email', '>=', term), where('email', '<=', term + '\uf8ff'));
      unsub = onSnapshot(q, (snap) => {
        setTabData((prev: AdminTabData) => ({ ...prev, [activeTab === 'user-directory' ? 'users' : 'demoAccounts']: snap.docs.map(d => ({ id: d.id, ...d.data() } as any)) }));
        setIsLoading(false);
      });
      return () => unsub();
    }

    switch (activeTab) {
      case 'user-directory':
        unsub = onSnapshot(query(collection(db, 'users'), orderBy('createdAt', 'desc')), (snap) => {
          setTabData((prev: AdminTabData) => ({ ...prev, users: snap.docs.map(d => ({ id: d.id, ...(d.data() as UserProfile) })) }));
          setIsLoading(false);
        });
        break;
      case 'trading-nodes':
        unsub = onSnapshot(query(collection(db, 'demoAccounts'), orderBy('updatedAt', 'desc')), (snap) => {
          setTabData((prev: AdminTabData) => ({ ...prev, demoAccounts: snap.docs.map(d => ({ id: d.id, ...(d.data() as DemoAccount) })) }));
          setIsLoading(false);
        });
        break;
      case 'breaches':
        unsub = onSnapshot(query(collection(db, 'demoAccounts'), where('status', 'in', ['blown', 'breach', 'terminated'])), (snap) => {
          setTabData((prev: AdminTabData) => ({ ...prev, breaches: snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => { const at = a.updatedAt?.toDate?.()?.getTime() || 0; const bt = b.updatedAt?.toDate?.()?.getTime() || 0; return bt - at; }) }));
          setIsLoading(false);
        });
        break;
      case 'phase-passers':
        unsub = onSnapshot(query(collection(db, 'demoAccounts'), where('status', '==', 'passed')), (snap) => {
          setTabData((prev: AdminTabData) => ({ ...prev, passers: snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => { const at = a.updatedAt?.toDate?.()?.getTime() || 0; const bt = b.updatedAt?.toDate?.()?.getTime() || 0; return bt - at; }) }));
          setIsLoading(false);
        });
        break;
      case 'order-review':
        unsub = onSnapshot(query(collection(db, 'orders')), (snap) => {
          setTabData((prev: AdminTabData) => ({ ...prev, orders: snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => { const at = a.submittedAt?.toDate?.()?.getTime() || 0; const bt = b.submittedAt?.toDate?.()?.getTime() || 0; return bt - at; }) }));
          setIsLoading(false);
        });
        break;
      case 'payout-hub':
        unsub = onSnapshot(query(collection(db, 'payouts'), orderBy('createdAt', 'desc')), (snap) => {
          setTabData((prev: AdminTabData) => ({ ...prev, payouts: snap.docs.map(d => ({ id: d.id, ...d.data() })) }));
          setIsLoading(false);
        });
        break;
      case 'trades-payouts':
        unsub = onSnapshot(query(collection(db, 'featured_payouts'), orderBy('paidOut', 'desc')), (snap) => {
          setTabData((prev: AdminTabData) => ({ ...prev, featuredPayouts: snap.docs.map(d => ({ id: d.id, ...d.data() })) }));
          setIsLoading(false);
        });
        break;
      case 'referral-audit':
        unsub = onSnapshot(query(collection(db, 'referrals'), orderBy('createdAt', 'desc')), (snap) => {
          setTabData((prev: AdminTabData) => ({ ...prev, referrals: snap.docs.map(d => ({ id: d.id, ...d.data() })) }));
          setIsLoading(false);
        });
        break;
      case 'kyc-hub':
        unsub = onSnapshot(query(collection(db, 'users'), where('kycStatus', 'in', ['pending', 'verified', 'rejected'])), (snap) => {
          setTabData((prev: AdminTabData) => ({ ...prev, users: snap.docs.map(d => ({ id: d.id, ...(d.data() as UserProfile) })) }));
          setIsLoading(false);
        });
        break;
      case 'broadcasts':
        unsub = onSnapshot(collection(db, 'broadcasts'), (snap) => {
          setTabData((prev: AdminTabData) => ({ ...prev, broadcasts: snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => {
            const aTime = a.sentAt?.toDate?.()?.getTime() || a.createdAt?.toDate?.()?.getTime() || 0;
            const bTime = b.sentAt?.toDate?.()?.getTime() || b.createdAt?.toDate?.()?.getTime() || 0;
            return bTime - aTime;
          }) }));
          setIsLoading(false);
        });
        break;
      case 'overview':
        refreshStats();
        {
          const uO = onSnapshot(collection(db, 'users'), (snap) => {
            setTabData((prev: AdminTabData) => ({ ...prev, users: snap.docs.map(d => ({ id: d.id, ...(d.data() as UserProfile) })) }));
            setIsLoading(false);
          });
          const oO = onSnapshot(collection(db, 'orders'), (snap) => {
            setTabData((prev: AdminTabData) => ({ ...prev, orders: snap.docs.map(d => ({ id: d.id, ...d.data() })) }));
          });
          unsub = () => { uO(); oO(); };
        }
        break;
      default:
        refreshStats();
        setIsLoading(false);
    }

    return () => unsub();
  }, [isAuthenticated, isAuthorized, authLoading, activeTab, debouncedSearchTerm, refreshStats]);

  useEffect(() => {
    if (isAuthenticated && isAuthorized && !authLoading) {
      refreshStats();
    }
  }, [isAuthenticated, isAuthorized, authLoading, refreshStats]);

  const handleViewUserByAccount = async (userId: string) => {
    if (!userId) return;
    setActionLoading(true);
    try {
      let userObj = tabData.users?.find((u: UserProfile) => u.id === userId) || null;
      if (!userObj) {
        const snap = await getDoc(doc(db, 'users', userId));
        if (snap.exists()) userObj = { id: snap.id, ...(snap.data() as UserProfile) };
      }
      if (userObj) {
        try {
          const accSnap = await getDocs(query(collection(db, 'demoAccounts'), where('userId', '==', userId)));
          if (!accSnap.empty) {
            const doc0 = accSnap.docs[0];
            const acc: DemoAccount = {
              id: doc0.id,
              ...(doc0.data() as Omit<DemoAccount, "id">)
            };
            userObj = { 
              ...userObj, 
              _demoAccountId: acc.id, 
              accountStatus: acc.status ?? "—", 
              globalLiquidity: acc.globalLiquidity ?? 0,
              liquidity: acc.liquidity ?? 0, 
              updatedAt: acc.updatedAt ?? null 
            };
            setNodeFilterId(acc.id);
          }
        } catch (e) { console.warn('demoAccounts fetch failed:', e); }
        setSelectedUser(userObj);
        setInspectionTab('overview');
        setIsUserManagementOpen(true);
      } else {
        toast({ variant: "destructive", title: "Trader Not Found" });
      }
    } finally {
      setActionLoading(false);
    }
  };

  useEffect(() => {
    if (!isUserManagementOpen) return;
    if (nodeFilterId) {
      const qT = query(collection(db, 'demoTrades'), where('accountId', '==', nodeFilterId));
      const unsubT = onSnapshot(qT, (snap) => setUserTrades(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => {
        const aTime = a.openedAt?.toDate?.()?.getTime() || a.openTime?.toDate?.()?.getTime() || 0;
        const bTime = b.openedAt?.toDate?.()?.getTime() || b.openTime?.toDate?.()?.getTime() || 0;
        return bTime - aTime;
      })));
      return () => unsubT();
    } else if (selectedUser?.id) {
      const qT = query(collection(db, 'demoTrades'), where('userId', '==', selectedUser.id));
      const unsubT = onSnapshot(qT, (snap) => setUserTrades(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => {
        const aTime = a.openedAt?.toDate?.()?.getTime() || a.openTime?.toDate?.()?.getTime() || 0;
        const bTime = b.openedAt?.toDate?.()?.getTime() || b.openTime?.toDate?.()?.getTime() || 0;
        return bTime - aTime;
      })));
      return () => unsubT();
    }
  }, [selectedUser?.id, isUserManagementOpen, nodeFilterId]);

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
                <Button className="h-10 rounded-xl font-black bg-primary text-black" onClick={() => setIsGiftModalOpen(true)}>
                   <Gift className="w-4 h-4 mr-2" /> Gift Account
                </Button>
                <Button variant="outline" className="h-10 rounded-xl font-bold" onClick={() => refreshStats(true)} disabled={isLoading}>
                   <RefreshCw className={cn("w-4 h-4 mr-2", isLoading && "animate-spin")} /> Sync Network
                </Button>
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

          <TabsContent value="order-review" className="space-y-6">
             <TabHeader title="Commerce: Order Review" count={tabData.orders?.length} onSearch={setSearchTerm} />
             <DataTable loading={isLoading} data={tabData.orders} columns={['EMAIL', 'PLAN', 'SIZE', 'AMOUNT', 'NETWORK', 'STATUS', 'ACTIONS']} renderRow={(o) => (
                  <tr key={o.id} className="hover:bg-white/5 transition-colors">
                    <td className="p-4 font-bold text-xs">{o.email}</td>
                    <td className="p-4 text-[10px] uppercase font-bold text-zinc-300">{o.plan}</td>
                    <td className="p-4 text-xs font-mono text-zinc-400">{o.accountSize || '—'}</td>
                    <td className="p-4 text-xs font-mono text-zinc-300">{o.amountPaid != null ? `$${Number(o.amountPaid).toFixed(2)}` : (o.amount != null ? `$${Number(o.amount).toFixed(2)}` : '$0.00')}</td>
                    <td className="p-4 text-[10px] uppercase font-bold text-muted-foreground">{o.network || '—'}</td>
                    <td className="p-4 text-center"><Badge className={cn("text-[8px] font-black uppercase", o.status === 'completed' || o.status === 'approved' ? 'bg-emerald-500/20 text-emerald-500' : o.status === 'rejected' ? 'bg-red-500/20 text-red-500' : 'bg-amber-500/20 text-amber-500')}>{o.status}</Badge></td>
                    <td className="p-4 text-right">{(o.status === 'completed' || o.status === 'approved') && (o.proofUrl || o.paymentProofUrl || o.proofScreenshotUrl) ? <span className="text-primary hover:underline text-[10px] font-black uppercase cursor-pointer" onClick={() => window.open(o.proofUrl || o.paymentProofUrl || o.proofScreenshotUrl, '_blank')}>PROOF</span> : null}</td>
                  </tr>
                )}
             />
          </TabsContent>

        <TabsContent value="trading-nodes">
          <div className="space-y-6">
            <TabHeader title="Trading Nodes" count={tabData.demoAccounts.length} onSearch={setSearchTerm} />
            <DataTable loading={isLoading} data={tabData.demoAccounts} columns={['EMAIL', 'USER ID', 'PLAN', 'SIZE', 'STATUS', 'BALANCE', 'UPDATED', 'ACTIONS']} renderRow={(node) => (
              <tr key={node.id} className="hover:bg-white/5 transition-colors">
                <td className="p-4 font-bold text-xs">{node.email}</td>
                <td className="p-4 font-mono text-[10px] text-zinc-400">{node.userId}</td>
                <td className="p-4 text-[10px] uppercase font-bold text-zinc-300">{node.planType}</td>
                <td className="p-4 text-xs font-mono text-zinc-400">${node.startBalance?.toLocaleString() || '—'}</td>
                <td className="p-4 text-center"><Badge className={cn("text-[8px] font-black uppercase", node.status === 'active' ? 'bg-emerald-500/20 text-emerald-500' : node.status === 'passed' ? 'bg-blue-500/20 text-blue-500' : 'bg-red-500/20 text-red-500')}>{node.status}</Badge></td>
                <td className="p-4 text-xs font-mono">${node.balance?.toLocaleString()}</td>
                <td className="p-4 text-xs text-muted-foreground">{node.updatedAt?.toDate ? format(node.updatedAt.toDate(), 'MMM d, HH:mm') : '—'}</td>
                <td className="p-4 text-right"><Button variant="outline" size="sm" className="h-7 text-[8px]" onClick={() => handleViewUserByAccount(node.userId)}><Eye className="w-3 h-3 mr-1" /> Inspect</Button></td>
              </tr>
            )} />
          </div>
        </TabsContent>

        <TabsContent value="breaches">
          <div className="space-y-6">
            <TabHeader title="Breach Monitor" count={tabData.breaches.length} />
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

        <TabsContent value="user-directory" className="space-y-6">
             <TabHeader title="User Directory" count={tabData.users?.length} onSearch={setSearchTerm} />
             <DataTable loading={isLoading} data={tabData.users} columns={['NAME', 'EMAIL', 'KYC', 'JOINED', 'ACTIONS']} renderRow={(u: UserProfile) => (
                  <tr key={u.id} className="hover:bg-white/5 transition-colors">
                    <td className="p-4 font-bold text-xs">{u.displayName || u.name || '—'}</td>
                    <td className="p-4 text-xs text-muted-foreground">{u.email}</td>
                    <td className="p-4 text-center"><Badge className={cn("text-[8px] font-black uppercase", u.kycStatus === 'verified' ? 'bg-emerald-500/20 text-emerald-500' : u.kycStatus === 'rejected' ? 'bg-red-500/20 text-red-500' : 'bg-amber-500/20 text-amber-500')}>{u.kycStatus || 'none'}</Badge></td>
                    <td className="p-4 text-xs text-muted-foreground">{u.createdAt?.toDate ? format(u.createdAt.toDate(), 'MMM d, yyyy') : '—'}</td>
                    <td className="p-4 text-right"><Button variant="outline" size="sm" className="h-7 text-[8px]" onClick={() => handleViewUserByAccount(u.id)}><Eye className="w-3 h-3 mr-1" /> Inspect</Button></td>
                  </tr>
                )}
             />
          </TabsContent>

        <TabsContent value="broadcasts">
          <div className="space-y-6">
            <TabHeader title="Broadcasts" count={tabData.broadcasts.length} />
            <DataTable loading={isLoading} data={tabData.broadcasts} columns={['MESSAGE', 'TYPE', 'SENT BY', 'SENT AT']} renderRow={(b) => (
              <tr key={b.id} className="hover:bg-white/5 transition-colors">
                <td className="p-4 text-xs max-w-[300px] truncate">{b.message}</td>
                <td className="p-4 text-[10px] uppercase text-zinc-400">{b.type || '—'}</td>
                <td className="p-4 text-xs text-zinc-300">{b.sentBy || 'admin'}</td>
                <td className="p-4 text-xs text-muted-foreground">{b.sentAt?.toDate ? format(b.sentAt.toDate(), 'MMM d, HH:mm') : '—'}</td>
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
            <DialogDescription className="sr-only">Configure detailed payout parameters for the leaderboard showcase.</DialogDescription>
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
                      const val = e.target.value;
                      setPayoutForm({...payoutForm, country: val});
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
                              setPayoutForm(prev => ({ ...prev, country: c.name, countryFlag: c.flag }));
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
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <Eye className="w-5 h-5 text-primary" />
              User Inspection — {selectedUser?.email || 'Unknown'}
            </DialogTitle>
            <DialogDescription>Trade node details, trade history, and breach logs.</DialogDescription>
          </DialogHeader>

          <Tabs value={inspectionTab} onValueChange={setInspectionTab} className="w-full">
            <div className="flex gap-2 bg-secondary/30 p-1 rounded-xl w-fit border border-white/5 mb-4">
              {['overview', 'trades', 'breaches'].map(t => (
                <TabsTrigger key={t} value={t} className="px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all data-[state=active]:bg-primary data-[state=active]:text-black text-zinc-500 hover:text-white bg-transparent border-none shadow-none">
                  {t === 'overview' ? 'Trade Node' : t === 'trades' ? 'Trade History' : 'Breach Logs'}
                </TabsTrigger>
              ))}
            </div>

            <TabsContent value="overview" className="m-0 space-y-6">
                  <div className="grid grid-cols-3 gap-4">
                     <div className="p-4 rounded-xl bg-zinc-900/50 border border-white/5 space-y-2"><p className="text-[8px] font-black uppercase text-zinc-500 tracking-widest">Email Address</p><p className="text-sm font-bold text-white">{selectedUser?.email || '—'}</p></div>
                     <div className="p-4 rounded-xl bg-zinc-900/50 border border-white/5 space-y-2"><p className="text-[8px] font-black uppercase text-zinc-500 tracking-widest">Phone Identity</p><p className="text-sm font-bold text-white">{selectedUser?.phone || 'Not Provided'}</p></div>
                     <div className="p-4 rounded-xl bg-zinc-900/50 border border-white/5 space-y-2"><p className="text-[8px] font-black uppercase text-zinc-500 tracking-widest">Country</p><p className="text-sm font-bold text-white">{selectedUser?.country || '—'}</p></div>
                     <div className="p-4 rounded-xl bg-zinc-900/50 border border-white/5 space-y-2"><p className="text-[8px] font-black uppercase text-zinc-500 tracking-widest">Join Date</p><p className="text-sm font-bold text-white">{selectedUser?.createdAt?.toDate ? format(selectedUser.createdAt.toDate(), 'MMM d, yyyy') : '—'}</p></div>
                     <div className="p-4 rounded-xl bg-zinc-900/50 border border-white/5 space-y-2"><p className="text-[8px] font-black uppercase text-zinc-500 tracking-widest">Account Status</p><p className="text-sm font-bold text-white">{selectedUser?.accountStatus ?? '—'}</p></div>
                     <div className="p-4 rounded-xl bg-zinc-900/50 border border-white/5 space-y-2"><p className="text-[8px] font-black uppercase text-zinc-500 tracking-widest">Global Liquidity</p><p className="text-sm font-bold text-white">{selectedUser?.globalLiquidity ?? 0}</p></div>
                  </div>
            </TabsContent>

            <TabsContent value="trades" className="m-0">
              <DataTable loading={tradesLoading} data={userTrades} columns={['INSTRUMENT', 'DIRECTION', 'UNITS', 'ENTRY', 'CURRENT', 'P&L', 'STATUS', 'OPENED']} renderRow={(trade) => (
                <tr key={trade.id} className="hover:bg-white/5 transition-colors">
                  <td className="p-3 font-bold text-xs">{trade.instrument || trade.pair || trade.symbol || '—'}</td>
                  <td className="p-3 text-center"><Badge className={cn("text-[8px] font-black uppercase", (trade.direction || trade.side || trade.type || '').toLowerCase() === 'buy' || (trade.direction || trade.side || trade.type || '').toLowerCase() === 'long' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-red-500/20 text-red-500')}>{trade.direction || trade.side || trade.type || '—'}</Badge></td>
                  <td className="p-3 text-xs font-mono">{trade.units || trade.volume || trade.lots || '—'}</td>
                  <td className="p-3 text-xs font-mono">{trade.price || trade.entryPrice || trade.openPrice || '—'}</td>
                  <td className="p-3 text-xs font-mono">{trade.currentPrice || trade.marketPrice || '—'}</td>
                  <td className={cn("p-3 text-xs font-mono font-bold", (trade.pnl || trade.pl || trade.realizedPL || 0) >= 0 ? 'text-emerald-400' : 'text-red-400')}>${Number(trade.pnl || trade.pl || trade.realizedPL || 0).toFixed(2)}</td>
                  <td className="p-3 text-center"><Badge className={cn("text-[8px] font-black uppercase", (trade.state || trade.status || '').toUpperCase() === 'OPEN' || (trade.state || trade.status || '').toUpperCase() === 'FILL' ? 'bg-blue-500/20 text-blue-500' : 'bg-zinc-500/20 text-zinc-400')}>{trade.state || trade.status || '—'}</Badge></td>
                  <td className="p-3 text-[10px] text-muted-foreground">{trade.openTime?.toDate ? format(trade.openTime.toDate(), 'MMM d, HH:mm') : (trade.createdAt?.toDate ? format(trade.createdAt.toDate(), 'MMM d, HH:mm') : (trade.openedAt?.toDate ? format(trade.openedAt.toDate(), 'MMM d, HH:mm') : '—'))}</td>
                </tr>
              )} />
            </TabsContent>

            <TabsContent value="breaches" className="m-0">
              <DataTable loading={false} data={tabData.breaches.filter((b: any) => b.id === nodeFilterId || b.userId === selectedUser?.id || b.email === selectedUser?.email || b.userId === selectedUser?.id)} columns={['ACCOUNT', 'PLAN', 'STATUS', 'REASON', 'BREACHED AT']} renderRow={(b) => (
                <tr key={b.id} className="hover:bg-white/5 transition-colors">
                  <td className="p-3 font-mono text-[10px] text-zinc-400">{b.id}</td>
                  <td className="p-3 text-[10px] uppercase font-bold text-zinc-300">{b.planType}</td>
                  <td className="p-3 text-center"><Badge className="text-[8px] font-black uppercase bg-red-500/20 text-red-500">{b.status}</Badge></td>
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
