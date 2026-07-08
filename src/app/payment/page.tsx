"use client";

import { Suspense, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Navigation } from '@/components/Navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/context/AuthContext';
import { collection, addDoc, serverTimestamp, doc, updateDoc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { 
  Copy, 
  CheckCircle2, 
  AlertTriangle, 
  QrCode, 
  Loader2, 
  Network, 
  CreditCard, 
  Coins, 
  ChevronLeft, 
  ArrowRight, 
  Check, 
  Search,
  ShieldCheck, 
  Lock,
  Clock,
  XCircle
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const NETWORKS = {
  USDT: [
    { id: 'TRON', label: 'Tron (TRC20)', address: 'TMitDXKKnsHKgBVENHdorV4axBou6KC5JM', subtitle: 'USDT on Tron Network', defaultFee: 1.50, logo: 'https://cryptologos.cc/logos/tron-trx-logo.svg' },
    { id: 'Ethereum', label: 'Ethereum (ERC20)', address: '0x3ab3ca43dc691f468bea91883f493cabf6da84d4', subtitle: 'USDT on Ethereum', defaultFee: 12.00, logo: 'https://cryptologos.cc/logos/ethereum-eth-logo.svg' },
    { id: 'Base', label: 'Base', address: '0x3ab3ca43dc691f468bea91883f493cabf6da84d4', subtitle: 'USDT on Base', defaultFee: 0.50, logo: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/info/logo.png' },
    { id: 'BEP20', label: 'BNB Chain', address: '0x3ab3ca43dc691f468bea91883f493cabf6da84d4', subtitle: 'USDT on BNB Smart Chain', defaultFee: 0.80, logo: 'https://cryptologos.cc/logos/bnb-bnb-logo.svg' }
  ],
  USDC: [
    { id: 'Ethereum', label: 'Ethereum (ERC20)', address: '0x3ab3ca43dc691f468bea91883f493cabf6da84d4', subtitle: 'USDC on Ethereum', defaultFee: 12.00, logo: 'https://cryptologos.cc/logos/ethereum-eth-logo.svg' },
    { id: 'Polygon', label: 'Polygon', address: '0x3ab3ca43dc691f468bea91883f493cabf6da84d4', subtitle: 'USDC on Polygon', defaultFee: 0.50, logo: 'https://cryptologos.cc/logos/polygon-matic-logo.svg' },
    { id: 'Base', label: 'Base', address: '0x3ab3ca43dc691f468bea91883f493cabf6da84d4', subtitle: 'USDC on Base', defaultFee: 0.50, logo: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/info/logo.png' },
    { id: 'Arbitrum', label: 'Arbitrum', address: '0x3ab3ca43dc691f468bea91883f493cabf6da84d4', subtitle: 'USDC on Arbitrum One', defaultFee: 0.50, logo: 'https://cryptologos.cc/logos/arbitrum-arb-logo.svg' },
    { id: 'Avalanche', label: 'Avalanche', address: '0x3ab3ca43dc691f468bea91883f493cabf6da84d4', subtitle: 'USDC on Avalanche C-Chain', defaultFee: 0.80, logo: 'https://cryptologos.cc/logos/avalanche-avax-logo.svg' },
    { id: 'XRPL', label: 'XRP Ledger', address: 'rLjF6ztYrfAQrVoaCemDCmSJhU85AwgEt6', subtitle: 'USDC on XRP Ledger', defaultFee: 0.10, logo: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ripple/info/logo.png' }
  ]
};

const COUNTRIES = [
  "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Antigua and Barbuda", "Argentina", "Armenia", "Australia", "Austria", "Azerbaijan",
  "Bahamas", "Bahrain", "Bangladesh", "Barbados", "Belarus", "Belgium", "Belize", "Benin", "Bhutan", "Bolivia", "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei", "Bulgaria", "Burkina Faso", "Burundi",
  "Cabo Verde", "Cambodia", "Cameroon", "Canada", "Central African Republic", "Chad", "Chile", "China", "Colombia", "Comoros", "Congo", "Costa Rica", "Croatia", "Cuba", "Cyprus", "Czech Republic",
  "Denmark", "Djibouti", "Dominica", "Dominican Republic", "Ecuador", "Egypt", "El Salvador", "Equatorial Guinea", "Eritrea", "Estonia", "Eswatini", "Ethiopia",
  "Fiji", "Finland", "France", "Gabon", "Gambia", "Georgia", "Germany", "Ghana", "Greece", "Grenada", "Guatemala", "Guinea", "Guinea-Bissau", "Guyana",
  "Haiti", "Honduras", "Hungary", "Iceland", "India", "Indonesia", "Iran", "Iraq", "Ireland", "Israel", "Italy", "Jamaica", "Japan", "Jordan",
  "Kazakhstan", "Kenya", "Kiribati", "Kuwait", "Kyrgyzstan", "Laos", "Latvia", "Lebanon", "Lesotho", "Liberia", "Libya", "Liechtenstein", "Lithuania", "Luxembourg",
  "Madagascar", "Malawi", "Malaysia", "Maldives", "Mali", "Malta", "Marshall Islands", "Mauritania", "Mauritius", "Mexico", "Micronesia", "Moldova", "Monaco", "Mongolia", "Montenegro", "Morocco", "Mozambique", "Myanmar",
  "Namibia", "Nauru", "Nepal", "Netherlands", "New Zealand", "Nicaragua", "Niger", "Nigeria", "North Korea", "North Macedonia", "Norway", "Oman",
  "Pakistan", "Palau", "Palestine", "Panama", "Papua New Guinea", "Paraguay", "Peru", "Philippines", "Poland", "Portugal", "Qatar", "Romania", "Russia", "Rwanda",
  "Saint Kitts and Nevis", "Saint Lucia", "Saint Vincent and the Grenadines", "Samoa", "San Marino", "Sao Tome and Principe", "Saudi Arabia", "Senegal", "Serbia", "Seychelles", "Sierra Leone", "Singapore", "Slovakia", "Slovenia", "Solomon Islands", "Somalia", "South Africa", "South Korea", "South Sudan", "Spain", "Sri Lanka", "Sudan", "Suriname", "Sweden", "Switzerland", "Syria",
  "Taiwan", "Tajikistan", "Tanzania", "Thailand", "Timor-Leste", "Togo", "Tonga", "Trinidad and Tobago", "Tunisia", "Turkey", "Turkmenistan", "Tuvalu",
  "Uganda", "Ukraine", "United Arab Emirates", "United Kingdom", "United States", "Uruguay", "Uzbekistan", "Vanuatu", "Vatican City", "Venezuela", "Vietnam",
  "Yemen", "Zambia", "Zimbabwe"
];

function PaymentContent() {
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  
  const plan = searchParams.get('plan') || '1-Step Pro';
  const size = searchParams.get('size') || '$100,000';
  const priceStr = searchParams.get('price') || '$499';
  const challengeAmount = parseFloat(priceStr.replace('$', '').replace(',', ''));
  
  const [step, setStep] = useState(2);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [mailingList, setMailingList] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [networkFees, setNetworkFees] = useState<Record<string, number>>({});
  const [configuredWallets, setConfiguredWallets] = useState<Record<string, string>>({});
  
  const [billing, setBilling] = useState({
    firstName: '', lastName: '', phone: '', address: '', suite: '', city: '', state: '', zip: '', country: 'United States'
  });
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [countrySearch, setCountrySearch] = useState("");
  const [countryOpen, setCountryOpen] = useState(false);

  const [selectedCoin, setSelectedCoin] = useState<'USDT' | 'USDC' | null>(null);
  const [selectedNetwork, setSelectedNetwork] = useState<any | null>(null);
  
  const [orderId, setOrderId] = useState<string | null>(null);
  const [orderStatus, setOrderStatus] = useState<'waiting' | 'detected' | 'completed' | 'expired'>('waiting');
  const [timeLeft, setTimeLeft] = useState(1200); 
  const [confirmations, setConfirmations] = useState(0);
  const [loading, setLoading] = useState(false);
  const isCreatingRef = useRef(false);

  useEffect(() => {
    if (!db || authLoading || !user) return;
    const unsub = onSnapshot(doc(db, 'settings', 'payments'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setNetworkFees(data.networkFees || {});
        setConfiguredWallets(data.walletAddresses || {});
      }
    });
    return () => unsub();
  }, [authLoading, user]);

  const currentNetworkFee = useMemo(() => {
    if (!selectedNetwork) return 0;
    return networkFees[selectedNetwork.id] ?? selectedNetwork.defaultFee || 0;
  }, [selectedNetwork, networkFees]);

  const currentWalletAddress = useMemo(() => {
    if (!selectedNetwork) return '';
    return configuredWallets[selectedNetwork.id] || selectedNetwork.address;
  }, [selectedNetwork, configuredWallets]);

  const totalAmountUsd = useMemo(() => challengeAmount + currentNetworkFee, [challengeAmount, currentNetworkFee]);

  const filteredCountries = useMemo(() => {
    return COUNTRIES.filter(c => c.toLowerCase().includes(countrySearch.toLowerCase()));
  }, [countrySearch]);

  const validateBilling = () => {
    const newErrors: Record<string, boolean> = {};
    const required = ['firstName', 'lastName', 'phone', 'address', 'city', 'state', 'zip', 'country'];
    required.forEach(field => {
      if (!billing[field as keyof typeof billing]) newErrors[field] = true;
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const createFinalOrder = async () => {
    if (!user || !selectedCoin || !selectedNetwork || isCreatingRef.current) return;
    
    setLoading(true);
    isCreatingRef.current = true;

    try {
      const tag = selectedNetwork.id === 'XRPL' ? Math.floor(100000 + Math.random() * 900000) : null;
      const res = await addDoc(collection(db, "orders"), {
        userId: user.uid,
        email: user.email,
        plan,
        accountSize: size,
        challengeAmount,
        networkFee: currentNetworkFee,
        amountPaid: totalAmountUsd,
        network: selectedNetwork.id,
        coin: selectedCoin,
        destinationTag: tag,
        billing: billing,
        status: "waiting",
        createdAt: serverTimestamp(),
        submittedAt: serverTimestamp(),
        amountNative: totalAmountUsd * 1.002
      });

      setOrderId(res.id);
      setStep(6);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Order Creation Failed", description: e.message });
    } finally {
      setLoading(false);
      isCreatingRef.current = false;
    }
  };

  useEffect(() => {
    if (!orderId || !user || !db) return;
    
    const unsub = onSnapshot(doc(db, "orders", orderId), (snap) => {
      const data = snap.data();
      if (!data) return;
      
      const createdAt = data.createdAt?.toDate?.() || new Date(data.createdAt);
      if (!createdAt || isNaN(createdAt.getTime())) return;

      const diff = Math.floor((Date.now() - createdAt.getTime()) / 1000);
      const remaining = Math.max(0, 1200 - diff);
      setTimeLeft(remaining);

      if (remaining <= 0 && data.status === 'waiting') {
        updateDoc(doc(db, 'orders', orderId), { status: 'expired' });
        addDoc(collection(db, 'users', user.uid, 'notifications'), {
          title: '❌ Order Expired',
          message: `Your payment window for ${plan} has expired. Please try again.`,
          type: 'order_failed',
          isRead: false,
          createdAt: serverTimestamp()
        });
        setOrderStatus("expired");
      }

      if (data.status === "completed") setOrderStatus("completed");
      else if (data.status === "detected") {
        setOrderStatus("detected");
        setConfirmations(data.confirmations || 0);
      } else if (data.status === "expired" || data.status === "rejected") {
        setOrderStatus("expired");
      }
    });
    return () => unsub();
  }, [orderId, user, plan]);

  const formatTime = (s: number) => `${Math.floor(s/60)}:${(s%60).toString().padStart(2, '0')}`;

  const handleTryAgain = () => {
    setOrderId(null);
    setOrderStatus("waiting");
    setTimeLeft(1200);
    setStep(4);
  };

  if (orderStatus === 'completed') {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-8">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="space-y-6">
          <div className="w-24 h-24 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto shadow-[0_0_50px_rgba(16,185,129,0.3)]">
            <CheckCircle2 className="w-12 h-12 text-emerald-500" />
          </div>
          <h2 className="text-4xl font-headline font-bold text-white">Payment Verified</h2>
          <p className="text-zinc-400 max-w-sm mx-auto">Your institutional challenge node is now live. Credentials have been synchronized to your dashboard.</p>
          <Button className="h-14 px-10 font-black cyan-box-glow text-lg" onClick={() => router.push('/dashboard')}>Enter Terminal <ArrowRight className="ml-2 w-5 h-5" /></Button>
        </motion.div>
      </div>
    );
  }

  if (orderStatus === 'expired') {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-8">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
          <div className="w-20 h-20 bg-destructive/10 rounded-full flex items-center justify-center mx-auto">
            <AlertTriangle className="w-10 h-10 text-destructive" />
          </div>
          <h2 className="text-3xl font-headline font-bold text-white">Payment Window Expired</h2>
          <p className="text-zinc-400">The 20-minute deposit window has closed. Please start a new session.</p>
          <Button variant="outline" className="font-bold h-12 px-8" onClick={handleTryAgain}>Try Again</Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-10 px-4">
      <AnimatePresence mode="wait">
        {step === 2 && (
          <motion.div key="step2" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <Card className="w-full max-w-lg bg-zinc-950 border-zinc-800 shadow-2xl">
              <CardHeader>
                <CardTitle className="text-2xl font-headline font-bold text-white">Before you proceed</CardTitle>
                <CardDescription>Please confirm the following to continue to payment:</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <Checkbox id="terms" checked={termsAccepted} onCheckedChange={(v) => setTermsAccepted(!!v)} className="mt-1" />
                    <Label htmlFor="terms" className="text-sm text-zinc-300 leading-relaxed cursor-pointer">
                      I accept the <Link href="/rules" target="_blank" className="text-primary hover:underline font-bold">Terms & Conditions</Link>
                    </Label>
                  </div>
                  <div className="flex items-start gap-3">
                    <Checkbox id="mail" checked={mailingList} onCheckedChange={(v) => setMailingList(!!v)} className="mt-1" />
                    <Label htmlFor="mail" className="text-sm text-zinc-400 leading-relaxed cursor-pointer">I accept to be part of the mailing list (optional)</Label>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">Coupon code (Optional)</Label>
                  <div className="flex gap-2">
                    <Input placeholder="Enter code..." value={couponCode} onChange={(e) => setCouponCode(e.target.value.toUpperCase())} className="bg-zinc-900 border-zinc-800" />
                    <Button variant="secondary" className="px-6 font-bold">Apply</Button>
                  </div>
                </div>
              </CardContent>
              <CardFooter>
                <Button 
                  disabled={!termsAccepted}
                  onClick={() => setStep(3)}
                  className="w-full h-12 font-black text-lg cyan-box-glow"
                >
                  Continue to Payment
                </Button>
              </CardFooter>
            </Card>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            <Card className="bg-card/40 border-zinc-800 shadow-2xl overflow-hidden">
              <div className="bg-primary/10 p-6 border-b border-white/5">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-[10px] font-black uppercase text-primary tracking-widest mb-1">Order Summary</p>
                    <h3 className="text-xl font-headline font-bold text-white">{plan} · {size}</h3>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-headline font-bold text-primary">{priceStr}</p>
                  </div>
                </div>
              </div>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <CreditCard className="w-5 h-5 text-primary" /> Billing Details
                </CardTitle>
                <CardDescription>We collect this for your account records. Crypto is sent on the next screen.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className={cn("text-[11px] font-bold uppercase", errors.firstName ? "text-destructive" : "text-zinc-500")}>First Name *</Label>
                    <Input value={billing.firstName} onChange={(e) => setBilling({...billing, firstName: e.target.value})} className={cn("bg-zinc-900 border-zinc-800", errors.firstName && "border-destructive")} />
                  </div>
                  <div className="space-y-2">
                    <Label className={cn("text-[11px] font-bold uppercase", errors.lastName ? "text-destructive" : "text-zinc-500")}>Last Name *</Label>
                    <Input value={billing.lastName} onChange={(e) => setBilling({...billing, lastName: e.target.value})} className={cn("bg-zinc-900 border-zinc-800", errors.lastName && "border-destructive")} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className={cn("text-[11px] font-bold uppercase", errors.phone ? "text-destructive" : "text-zinc-500")}>Phone Number *</Label>
                  <Input placeholder="+1..." value={billing.phone} onChange={(e) => setBilling({...billing, phone: e.target.value})} className={cn("bg-zinc-900 border-zinc-800", errors.phone && "border-destructive")} />
                </div>
                <div className="space-y-2">
                  <Label className={cn("text-[11px] font-bold uppercase", errors.address ? "text-destructive" : "text-zinc-500")}>Street Address *</Label>
                  <Input value={billing.address} onChange={(e) => setBilling({...billing, address: e.target.value})} className={cn("bg-zinc-900 border-zinc-800", errors.address && "border-destructive")} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className={cn("text-[11px] font-bold uppercase", errors.city ? "text-destructive" : "text-zinc-500")}>City *</Label>
                    <Input value={billing.city} onChange={(e) => setBilling({...billing, city: e.target.value})} className={cn("bg-zinc-900 border-zinc-800", errors.city && "border-destructive")} />
                  </div>
                  <div className="space-y-2">
                    <Label className={cn("text-[11px] font-bold uppercase", errors.state ? "text-destructive" : "text-zinc-500")}>State / Region *</Label>
                    <Input value={billing.state} onChange={(e) => setBilling({...billing, state: e.target.value})} className={cn("bg-zinc-900 border-zinc-800", errors.state && "border-destructive")} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className={cn("text-[11px] font-bold uppercase", errors.zip ? "text-destructive" : "text-zinc-500")}>Postal Code *</Label>
                    <Input value={billing.zip} onChange={(e) => setBilling({...billing, zip: e.target.value})} className={cn("bg-zinc-900 border-zinc-800", errors.zip && "border-destructive")} />
                  </div>
                  <div className="space-y-2">
                    <Label className={cn("text-[11px] font-bold uppercase", errors.country ? "text-destructive" : "text-zinc-500")}>Country *</Label>
                    <Popover open={countryOpen} onOpenChange={setCountryOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("w-full justify-between bg-zinc-900 border-zinc-800 text-white font-normal", errors.country && "border-destructive")}>
                          {billing.country || "Search country..."}
                          <Search className="ml-2 h-4 w-4 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[300px] p-0 bg-zinc-950 border-zinc-800">
                        <div className="p-3 border-b border-zinc-800">
                           <div className="relative">
                              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
                              <Input 
                                placeholder="Start typing..." 
                                value={countrySearch} 
                                onChange={(e) => setCountrySearch(e.target.value)}
                                className="h-9 pl-9 bg-zinc-900 border-zinc-800 text-xs"
                              />
                           </div>
                        </div>
                        <div className="max-h-[250px] overflow-y-auto custom-scrollbar">
                          {filteredCountries.length === 0 ? (
                            <div className="p-4 text-xs text-center text-zinc-500 italic">No countries found</div>
                          ) : (
                            filteredCountries.map(c => (
                              <button 
                                key={c}
                                onClick={() => { setBilling({...billing, country: c}); setCountryOpen(false); setCountrySearch(""); }}
                                className="w-full text-left px-4 py-2.5 text-xs text-zinc-300 hover:bg-primary/10 hover:text-primary transition-colors flex items-center justify-between group"
                              >
                                {c}
                                {billing.country === c && <Check className="h-3 w-3 text-primary" />}
                              </button>
                            ))
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="bg-secondary/10 p-6 flex justify-between">
                <Button variant="ghost" onClick={() => router.back()} className="font-bold text-zinc-500">Cancel</Button>
                <Button onClick={() => validateBilling() && setStep(4)} className="px-10 font-black cyan-box-glow">Continue <ArrowRight className="ml-2 w-4 h-4" /></Button>
              </CardFooter>
            </Card>
          </motion.div>
        )}

        {step === 4 && (
          <motion.div key="step4" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-8">
            <div className="text-center">
               <h2 className="text-3xl font-headline font-bold text-white mb-2">Choose a stablecoin to pay with</h2>
               <p className="text-zinc-500">Select your preferred asset for the transfer.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
               <StablecoinCard 
                 coin="USDT" 
                 networks="4 networks"
                 logoUrl="https://cryptologos.cc/logos/tether-usdt-logo.svg"
                 selected={selectedCoin === 'USDT'} 
                 onClick={() => { setSelectedCoin('USDT'); setStep(5); }} 
               />
               <StablecoinCard 
                 coin="USDC" 
                 networks="6 networks"
                 logoUrl="https://cryptologos.cc/logos/usd-coin-usdc-logo.svg"
                 selected={selectedCoin === 'USDC'} 
                 onClick={() => { setSelectedCoin('USDC'); setStep(5); }} 
               />
            </div>
            <div className="text-center pt-4">
               <button onClick={() => setStep(3)} className="text-sm font-bold text-zinc-500 hover:text-white transition-colors flex items-center justify-center gap-2 mx-auto">
                 <ChevronLeft className="w-4 h-4" /> Back to Billing
               </button>
            </div>
          </motion.div>
        )}

        {step === 5 && selectedCoin && (
          <motion.div key="step5" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-headline font-bold text-white">Pay with {selectedCoin} · choose network</h2>
              <Button variant="ghost" size="sm" onClick={() => setStep(4)} className="text-zinc-500 hover:text-white">
                <ChevronLeft className="w-4 h-4 mr-1" /> Back
              </Button>
            </div>
            <div className="grid gap-3">
              {NETWORKS[selectedCoin].map((net) => (
                <button 
                  key={net.id}
                  onClick={() => { setSelectedNetwork(net); setStep(5.5); }}
                  className="w-full p-5 rounded-2xl bg-card/40 border border-zinc-800 hover:border-primary/50 text-left transition-all flex items-center justify-between group"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 group-hover:text-primary transition-colors overflow-hidden">
                      {net.logo ? (
                        <img src={net.logo} alt={net.label} className="w-6 h-6 object-contain" />
                      ) : (
                        <Network className="w-5 h-5" />
                      )}
                    </div>
                    <div>
                      <p className="font-bold text-white text-lg">{net.label}</p>
                      <p className="text-xs text-zinc-500">{net.subtitle}</p>
                    </div>
                  </div>
                  <ArrowRight className="w-5 h-5 text-zinc-800 group-hover:text-primary group-hover:translate-x-1 transition-all" />
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {step === 5.5 && selectedNetwork && (
          <motion.div key="step5.5" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex justify-center">
            <Card className="w-full max-md bg-zinc-950 border-zinc-800 shadow-2xl">
              <CardHeader>
                <CardTitle className="text-xl font-headline font-bold text-white">Payment Summary</CardTitle>
                <CardDescription>Review your final total including network fees.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="p-4 rounded-xl bg-secondary/20 border border-white/5 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-500">Challenge Price</span>
                    <span className="text-white font-bold">${challengeAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-500">Network Fee ({selectedNetwork.id})</span>
                    <span className="text-white font-bold">${currentNetworkFee.toFixed(2)}</span>
                  </div>
                  <div className="h-px bg-white/5" />
                  <div className="flex justify-between text-lg">
                    <span className="font-headline font-bold text-white">Total Due</span>
                    <span className="font-headline font-bold text-primary">${totalAmountUsd.toFixed(2)}</span>
                  </div>
                </div>
                <p className="text-[10px] text-zinc-500 italic text-center">Crypto amount is calculated at 1:1 with USD plus 0.2% slippage buffer.</p>
              </CardContent>
              <CardFooter className="gap-3">
                <Button variant="ghost" className="flex-1 font-bold" onClick={() => setStep(5)}>Back</Button>
                <Button className="flex-2 font-black px-8 cyan-box-glow" onClick={createFinalOrder} disabled={loading}>
                   {loading ? <Loader2 className="animate-spin" /> : "PROCEED TO DEPOSIT"}
                </Button>
              </CardFooter>
            </Card>
          </motion.div>
        )}

        {step === 6 && selectedNetwork && (
          <motion.div key="step6" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-8">
            <Card className="bg-card/40 border-primary/20 shadow-2xl relative overflow-hidden">
               <div className="absolute top-0 left-0 w-full h-1 bg-primary shadow-[0_0_15px_rgba(17,179,245,0.5)]" />
               <CardContent className="p-10 space-y-10">
                  <div className="text-center space-y-2">
                     <p className="text-[10px] font-black uppercase text-zinc-500 tracking-[0.3em]">SEND EXACTLY</p>
                     <h3 className="text-5xl font-headline font-bold text-white tabular-nums">
                       {(totalAmountUsd * 1.002).toFixed(4)} <span className="text-primary">{selectedCoin}</span>
                     </h3>
                     <div className="flex items-center justify-center gap-2 pt-2">
                        <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 font-mono text-[10px]">
                           Fee included: ${currentNetworkFee.toFixed(2)} ({selectedNetwork.id})
                        </Badge>
                     </div>
                  </div>

                  <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-4">
                    <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-200/80 leading-relaxed font-medium">
                      Send only on <span className="text-white font-bold">{selectedNetwork.label}</span>. Funds sent on another network or with incorrect decimals cannot be recovered by the automated nodes.
                    </p>
                  </div>

                  <div className="flex flex-col md:flex-row gap-10 items-center justify-center">
                    <div className="bg-white p-3 rounded-2xl shadow-2xl shrink-0 group relative">
                       <QRCodeSVG value={`${currentWalletAddress}?amount=${(totalAmountUsd * 1.002).toFixed(4)}`} size={180} />
                       <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-2xl">
                         <p className="text-white text-[10px] font-black uppercase tracking-widest">Scan to Pay</p>
                       </div>
                    </div>
                    <div className="space-y-6 flex-1 w-full max-w-sm">
                       <div className="space-y-2">
                          <Label className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">DEPOSIT ADDRESS</Label>
                          <div className="flex gap-2">
                            <Input readOnly value={currentWalletAddress} className="bg-zinc-900/50 font-mono text-[10px] h-12 border-zinc-800 text-white" />
                            <Button variant="secondary" size="icon" className="h-12 w-12 shrink-0" onClick={() => { navigator.clipboard.writeText(currentWalletAddress); toast({ title: "Address Copied" }); }}><Copy size={16} /></Button>
                          </div>
                       </div>
                       
                       <div className="space-y-2 text-center md:text-left">
                          <p className="text-xs font-bold text-white flex items-center justify-center md:justify-start gap-2">
                            {orderStatus === 'detected' ? (
                              <>
                                <Loader2 className="w-3 h-3 text-primary animate-spin" />
                                Transaction detected: {confirmations} confirmations...
                              </>
                            ) : (
                              <>
                                <Clock className="w-3 h-3 text-primary" />
                                Waiting for your transfer...
                              </>
                            )}
                          </p>
                          <div className="flex items-center justify-between text-[10px] font-black uppercase text-zinc-500 tracking-widest">
                            <span>quote valid for</span>
                            <span className="text-white font-mono tabular-nums">{formatTime(timeLeft)}</span>
                          </div>
                          <Progress value={(timeLeft / 1200) * 100} className="h-1 bg-zinc-900" />
                       </div>
                    </div>
                  </div>
               </CardContent>
               <CardFooter className="bg-secondary/10 border-t border-white/5 p-6 flex justify-center">
                  <button onClick={() => { setStep(5); setOrderId(null); }} className="text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-primary transition-all flex items-center gap-2">
                    <ChevronLeft className="w-3 h-3" /> Choose another network
                  </button>
               </CardFooter>
            </Card>

            <div className="text-center space-y-4">
              <p className="text-xs text-zinc-600 italic">Order ID: {orderId?.toUpperCase()}</p>
              <div className="flex items-center justify-center gap-6 opacity-30 grayscale hover:opacity-100 transition-opacity duration-500">
                <ShieldCheck className="w-6 h-6" />
                <Lock className="w-6 h-6" />
                <CreditCard className="w-6 h-6" />
                <Clock className="w-6 h-6" />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StablecoinCard({ coin, networks, selected, onClick, logoUrl }: any) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "p-8 rounded-3xl border-2 transition-all text-center flex flex-col items-center gap-4 relative overflow-hidden group",
        selected ? "bg-primary/10 border-primary shadow-[0_0_30px_rgba(17,179,245,0.2)]" : "bg-card/40 border-zinc-800 hover:border-zinc-700"
      )}
    >
      <div className={cn(
        "w-16 h-16 rounded-2xl flex items-center justify-center border transition-all duration-500 group-hover:scale-110",
        selected ? "bg-primary border-primary text-black" : "bg-zinc-900 border-zinc-800 text-zinc-400"
      )}>
        {logoUrl ? (
          <img src={logoUrl} alt={coin} className="w-8 h-8 object-contain" />
        ) : (
          <Coins className="w-8 h-8" />
        )}
      </div>
      <div>
        <h4 className="text-xl font-headline font-bold text-white">Pay with {coin}</h4>
        <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest">{networks}</p>
      </div>
      {selected && (
        <div className="absolute top-4 right-4">
          <CheckCircle2 className="w-5 h-5 text-primary" />
        </div>
      )}
    </button>
  );
}

export default function PaymentPage() {
  return (
    <div className="flex min-h-screen bg-background">
      <Navigation />
      <main className="flex-1 p-8 overflow-y-auto custom-scrollbar">
        <Suspense fallback={<div className="flex items-center justify-center h-full"><Loader2 className="animate-spin text-primary w-8 h-8" /></div>}>
          <PaymentContent />
        </Suspense>
      </main>
    </div>
  );
}