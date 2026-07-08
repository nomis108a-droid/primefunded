"use client";

import { Suspense, useState, useEffect, useMemo } from 'react';
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
  Loader2, 
  ChevronLeft, 
  ArrowRight, 
  ShieldCheck, 
  Lock,
  Clock,
  XCircle,
  RefreshCw
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { motion, AnimatePresence } from 'framer-motion';

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
    { id: 'XRPL', label: 'XRP Ledger', address: 'rLjF6ztYrfAQrVoaCemDCmSJhU85AwgEt6', subtitle: 'USDC on XRP Ledger', defaultFee: 0.10, logo: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/xrp/info/logo.png' }
  ]
};

const PAYMENT_WINDOW_SECONDS = 1200; // 20 Minutes

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
  const [networkFees, setNetworkFees] = useState<Record<string, number>>({});
  const [configuredWallets, setConfiguredWallets] = useState<Record<string, string>>({});
  const [selectedCoin, setSelectedCoin] = useState<'USDT' | 'USDC' | null>(null);
  const [selectedNetwork, setSelectedNetwork] = useState<any | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [orderStatus, setOrderStatus] = useState<'waiting' | 'detected' | 'completed' | 'expired'>('waiting');
  const [timeLeft, setTimeLeft] = useState(PAYMENT_WINDOW_SECONDS); 
  const [confirmations, setConfirmations] = useState(0);
  const [loading, setLoading] = useState(false);

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

  const currentWalletAddress = useMemo(() => {
    if (!selectedNetwork) return '';
    return configuredWallets[selectedNetwork.id] || selectedNetwork.address;
  }, [selectedNetwork, configuredWallets]);

  const currentNetworkFee = useMemo(() => {
    if (!selectedNetwork) return 0;
    return (networkFees[selectedNetwork.id] ?? selectedNetwork.defaultFee) || 0;
  }, [selectedNetwork, networkFees]);

  const totalAmountUsd = useMemo(() => challengeAmount + currentNetworkFee, [challengeAmount, currentNetworkFee]);

  const createFinalOrder = async () => {
    if (!user || !selectedCoin || !selectedNetwork) return;
    setLoading(true);
    try {
      const tag = selectedNetwork.id === 'XRPL' ? Math.floor(100000 + Math.random() * 900000) : null;
      const res = await addDoc(collection(db, "orders"), {
        userId: user.uid,
        email: user.email,
        plan,
        accountSize: size,
        amountPaid: totalAmountUsd,
        network: selectedNetwork.id,
        coin: selectedCoin,
        destinationTag: tag,
        status: "waiting",
        createdAt: serverTimestamp(),
        submittedAt: serverTimestamp(),
        amountNative: totalAmountUsd * 1.002
      });
      setOrderId(res.id);
      setStep(6);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Failed", description: e.message });
    } finally { setLoading(false); }
  };

  useEffect(() => {
    if (!orderId || orderStatus !== 'waiting') return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [orderId, orderStatus]);

  useEffect(() => {
    if (!orderId || !user) return;
    
    const unsub = onSnapshot(doc(db, "orders", orderId), (snap) => {
      const data = snap.data();
      if (!data) return;

      const createdAt = data.createdAt?.toDate?.() || (data.createdAt ? new Date(data.createdAt) : null);
      if (createdAt) {
        const diff = Math.floor((Date.now() - createdAt.getTime()) / 1000);
        const remaining = Math.max(0, PAYMENT_WINDOW_SECONDS - diff);
        
        if (Math.abs(timeLeft - remaining) > 5) {
          setTimeLeft(remaining);
        }

        if (remaining <= 0 && data.status === 'waiting') {
           updateDoc(doc(db, 'orders', orderId), { 
             status: 'expired',
             expiredAt: serverTimestamp() 
           });
           setOrderStatus('expired');
        }
      }

      if (data.status === "completed") setOrderStatus("completed");
      else if (data.status === "detected") { 
        setOrderStatus("detected"); 
        setConfirmations(data.confirmations || 0); 
      }
      else if (data.status === "expired") setOrderStatus("expired");
    });

    return () => unsub();
  }, [orderId, user, timeLeft]);

  const handleTryAgain = () => {
    setOrderId(null);
    setOrderStatus('waiting');
    setTimeLeft(PAYMENT_WINDOW_SECONDS);
    setSelectedCoin(null);
    setSelectedNetwork(null);
    setStep(4);
  };

  if (orderStatus === 'completed') {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-8 bg-background">
        <div className="w-24 h-24 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="w-12 h-12 text-emerald-500" />
        </div>
        <h2 className="text-4xl font-headline font-bold text-white mb-4">Payment Verified</h2>
        <p className="text-muted-foreground mb-8">Institutional node provisioned. Welcome to the terminal.</p>
        <Button className="h-14 px-10 font-black cyan-box-glow" onClick={() => router.push('/dashboard')}>Enter Terminal</Button>
      </div>
    );
  }

  if (orderStatus === 'expired') {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-8 bg-background">
        <XCircle className="w-16 h-16 text-destructive mb-6" />
        <h2 className="text-3xl font-headline font-bold text-white mb-4">Payment Window Expired</h2>
        <p className="text-muted-foreground max-w-sm mx-auto mb-8">Your order could not be verified in time. No funds were detected at the address before timeout.</p>
        <Button className="font-bold px-10 h-12 rounded-xl" onClick={handleTryAgain}>
          <RefreshCw className="w-4 h-4 mr-2" /> Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Navigation />
      <main className="flex-1 p-8 overflow-y-auto custom-scrollbar">
        <div className="max-w-4xl mx-auto py-10">
          <AnimatePresence mode="wait">
            {step === 2 && (
              <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
                <Card className="w-full max-w-lg bg-zinc-950 border-zinc-800 shadow-2xl">
                  <CardHeader><CardTitle className="text-2xl font-headline font-bold text-white">Accept Terms</CardTitle></CardHeader>
                  <CardContent className="space-y-6">
                    <div className="flex items-start gap-3">
                      <Checkbox id="terms" checked={termsAccepted} onCheckedChange={(v) => setTermsAccepted(!!v)} />
                      <Label htmlFor="terms" className="text-sm text-zinc-300">I accept the Terms & Conditions and understand all challenge risk protocols.</Label>
                    </div>
                  </CardContent>
                  <CardFooter><Button disabled={!termsAccepted} onClick={() => setStep(4)} className="w-full h-12 font-black text-lg cyan-box-glow">Continue to Payment</Button></CardFooter>
                </Card>
              </motion.div>
            )}

            {step === 4 && (
              <motion.div key="step4" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-8">
                <div className="text-center">
                  <Badge variant="outline" className="mb-4 border-primary/30 text-primary">STEP 2/3</Badge>
                  <h2 className="text-3xl font-headline font-bold text-white mb-2">Choose Asset</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   <button onClick={() => { setSelectedCoin('USDT'); setStep(5); }} className="p-8 rounded-3xl border-2 bg-card/40 border-zinc-800 hover:border-primary/50 text-center space-y-4 group transition-all">
                     <img src="https://cryptologos.cc/logos/tether-usdt-logo.svg" className="w-12 h-12 mx-auto" alt="USDT" />
                     <p className="font-headline font-bold text-xl text-white">Pay with USDT</p>
                     <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">{NETWORKS.USDT.length} NETWORKS AVAILABLE</p>
                   </button>
                   <button onClick={() => { setSelectedCoin('USDC'); setStep(5); }} className="p-8 rounded-3xl border-2 bg-card/40 border-zinc-800 hover:border-primary/50 text-center space-y-4 group transition-all">
                     <img src="https://cryptologos.cc/logos/usd-coin-usdc-logo.svg" className="w-12 h-12 mx-auto" alt="USDC" />
                     <p className="font-headline font-bold text-xl text-white">Pay with USDC</p>
                     <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">{NETWORKS.USDC.length} NETWORKS AVAILABLE</p>
                   </button>
                </div>
              </motion.div>
            )}

            {step === 5 && selectedCoin && (
              <motion.div key="step5" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
                <div className="flex justify-between items-center"><h2 className="text-2xl font-headline font-bold text-white">Select Network</h2><Button variant="ghost" onClick={() => setStep(4)}><ChevronLeft className="w-4 h-4 mr-1" /> Back</Button></div>
                <div className="grid gap-3">
                  {NETWORKS[selectedCoin].map((net) => (
                    <button key={net.id} onClick={() => { setSelectedNetwork(net); createFinalOrder(); }} className="w-full p-5 rounded-2xl bg-card/40 border border-zinc-800 hover:border-primary/50 text-left transition-all flex items-center justify-between group">
                      <div className="flex items-center gap-4"><img src={net.logo} alt={net.label} className="w-6 h-6" /><div><p className="font-bold text-white">{net.label}</p><p className="text-xs text-zinc-500">{net.subtitle}</p></div></div>
                      <ArrowRight className="w-5 h-5 text-zinc-800 group-hover:text-primary transition-all" />
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {step === 6 && selectedNetwork && (
              <motion.div key="step6" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-8">
                <Card className="bg-card/40 border-primary/20 shadow-2xl relative overflow-hidden">
                   <div className="absolute top-0 left-0 w-full h-1 bg-primary shadow-[0_0_15px_rgba(17,179,245,0.5)]" />
                   <CardContent className="p-10 space-y-10">
                      <div className="text-center space-y-4">
                         <div className="space-y-1">
                            <p className="text-[10px] font-black uppercase text-zinc-500 tracking-[0.3em]">SEND EXACTLY</p>
                            <h3 className="text-5xl font-headline font-bold text-white tabular-nums">{(totalAmountUsd * 1.002).toFixed(4)} <span className="text-primary">{selectedCoin}</span></h3>
                         </div>
                         
                         <div className="inline-flex flex-col items-center gap-1.5 py-3 px-6 rounded-2xl bg-white/5 border border-white/5 min-w-[260px]">
                            <div className="flex justify-between w-full text-[10px] font-bold text-zinc-400">
                               <span>Challenge Fee</span>
                               <span className="text-zinc-300">${challengeAmount.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between w-full text-[10px] font-bold text-zinc-400">
                               <span>Network & Service Fee</span>
                               <span className="text-zinc-300">${(totalAmountUsd * 1.002 - challengeAmount).toFixed(2)}</span>
                            </div>
                            <div className="w-full h-px bg-white/10 my-0.5" />
                            <div className="flex justify-between w-full text-[10px] font-black text-white uppercase tracking-wider">
                               <span>Total Amount</span>
                               <span className="text-primary">{(totalAmountUsd * 1.002).toFixed(4)} {selectedCoin}</span>
                            </div>
                         </div>
                      </div>

                      <div className="flex flex-col md:flex-row gap-10 items-center justify-center">
                        <div className="bg-white p-3 rounded-2xl shrink-0"><QRCodeSVG value={`${currentWalletAddress}?amount=${(totalAmountUsd * 1.002).toFixed(4)}`} size={180} /></div>
                        <div className="space-y-6 flex-1 w-full">
                           <div className="space-y-2">
                              <Label className="text-[10px] font-black uppercase text-zinc-500">{selectedNetwork.id} DEPOSIT ADDRESS</Label>
                              <div className="flex gap-2"><Input readOnly value={currentWalletAddress} className="bg-zinc-900 font-mono text-[10px]" /><Button variant="secondary" size="icon" onClick={() => { navigator.clipboard.writeText(currentWalletAddress); toast({ title: "Copied" }); }}><Copy size={16} /></Button></div>
                           </div>
                           <div className="space-y-2">
                              <p className="text-xs font-bold text-white flex items-center gap-2">
                                {orderStatus === 'detected' ? <><Loader2 className="w-3 h-3 animate-spin" /> Verifying confirmations...</> : <><Clock className="w-3 h-3 text-primary" /> Awaiting Transaction...</>}
                              </p>
                              <div className="flex justify-between text-[10px] uppercase font-black text-zinc-500"><span>Valid for</span><span>{Math.floor(timeLeft/60)}:{(timeLeft%60).toString().padStart(2,'0')}</span></div>
                              <Progress value={(timeLeft / PAYMENT_WINDOW_SECONDS) * 100} className="h-1 bg-zinc-900" />
                           </div>
                        </div>
                      </div>
                   </CardContent>
                </Card>
                <div className="flex justify-center gap-6 opacity-30">
                  <ShieldCheck className="w-6 h-6" />
                  <Lock className="w-6 h-6" />
                  <Clock className="w-6 h-6" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

export default function PaymentPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>}>
      <PaymentContent />
    </Suspense>
  );
}
