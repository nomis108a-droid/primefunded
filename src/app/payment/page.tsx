"use client";

import { Suspense, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Navigation } from '@/components/Navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/context/AuthContext';
import { collection, addDoc, serverTimestamp, doc, updateDoc, onSnapshot, query, where, getDocs, limit, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { Copy, CheckCircle2, AlertTriangle, QrCode, Mail, Hash, Loader2, Globe, Upload, FileImage, DollarSign, Timer, ArrowRight, ExternalLink } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn, sanitizeInput } from '@/lib/utils';
import { uploadImageAsBase64 } from '@/lib/imageUpload';

const NETWORK_CONFIG = [
  { 
    id: 'Ethereum', 
    label: 'Ethereum (ERC20)', 
    address: '0x3ab3ca43dc691f468bea91883f493cabf6da84d4', 
    coins: ['ETH', 'USDT', 'USDC'] 
  },
  { 
    id: 'BEP20', 
    label: 'BNB Smart Chain (BSC)', 
    address: '0x3ab3ca43dc691f468bea91883f493cabf6da84d4', 
    coins: ['BNB', 'USDT', 'USDC'] 
  },
  { 
    id: 'Polygon', 
    label: 'Polygon (MATIC)', 
    address: '0x3ab3ca43dc691f468bea91883f493cabf6da84d4', 
    coins: ['POL (MATIC)', 'USDT', 'USDC'] 
  },
  { 
    id: 'Avalanche', 
    label: 'Avalanche (C-Chain)', 
    address: '0x3ab3ca43dc691f468bea91883f493cabf6da84d4', 
    coins: ['AVAX', 'USDT', 'USDC'] 
  },
  { 
    id: 'Arbitrum', 
    label: 'Arbitrum One', 
    address: '0x3ab3ca43dc691f468bea91883f493cabf6da84d4', 
    coins: ['ETH', 'USDT', 'USDC'] 
  },
  { 
    id: 'Base', 
    label: 'Base Network', 
    address: '0x3ab3ca43dc691f468bea91883f493cabf6da84d4', 
    coins: ['ETH', 'USDC'] 
  },
  { 
    id: 'TRON', 
    label: 'Tron Network', 
    address: 'TMitDXKKnsHKgBVENHdorV4axBou6KC5JM', 
    coins: ['TRX', 'USDT (TRC20)'] 
  },
  { 
    id: 'XRPL', 
    label: 'XRP Ledger', 
    address: 'rLjF6ztYrfAQrVoaCemDCmSJhU85AwgEt6', 
    coins: ['XRP'] 
  }
];

function PaymentContent() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  
  const plan = searchParams.get('plan') || '1-step';
  const size = searchParams.get('size') || '$100k';
  const price = searchParams.get('price') || '$499';
  
  const [orderId, setOrderId] = useState<string | null>(null);
  const [destinationTag, setDestinationTag] = useState<number | null>(null);
  const [orderStatus, setOrderStatus] = useState<'idle' | 'waiting' | 'detected' | 'completed'>('idle');
  const [confirmations, setConfirmations] = useState(0);
  const [timeLeft, setTimeLeft] = useState(1200); 
  
  const [selectedNetwork, setSelectedNetwork] = useState<string | null>(null);
  const [selectedCoin, setSelectedCoin] = useState<string | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [manualMode, setManualMode] = useState(false);

  const [txHash, setTxHash] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);

  const isCreatingRef = useRef(false);

  const networkInfo = useMemo(() => 
    NETWORK_CONFIG.find(n => n.id === selectedNetwork)
  , [selectedNetwork]);

  const createOrder = useCallback(async () => {
    if (!user || !selectedNetwork || !selectedCoin || isCreatingRef.current) return;
    
    isCreatingRef.current = true;
    setLoading(true);
    try {
      // 1. LOOKUP EXISTING WAITING ORDER FOR THIS USER
      const q = query(
        collection(db, "orders"),
        where("userId", "==", user.uid),
        where("status", "==", "waiting"),
        orderBy("createdAt", "desc"),
        limit(1)
      );
      
      const existingSnap = await getDocs(q);
      if (!existingSnap.empty) {
        const existingOrder = existingSnap.docs[0];
        const data = existingOrder.data();
        
        // REUSE IF PLAN AND SIZE MATCH
        if (data.plan === plan && data.accountSize === size) {
          const createdAt = data.createdAt?.toDate?.() || new Date(data.createdAt);
          const ageMs = Date.now() - createdAt.getTime();
          
          if (ageMs < 1200 * 1000) {
            await updateDoc(existingOrder.ref, {
              network: selectedNetwork,
              coin: selectedCoin,
              updatedAt: serverTimestamp()
            });
            setOrderId(existingOrder.id);
            setDestinationTag(data.destinationTag);
            setOrderStatus('waiting');
            setTimeLeft(Math.max(0, 1200 - Math.floor(ageMs / 1000)));
            setLoading(false);
            isCreatingRef.current = false;
            return;
          }
        }
      }

      // 2. CREATE NEW ORDER
      const tag = selectedNetwork === 'XRPL' ? Math.floor(100000 + Math.random() * 900000) : null;
      const res = await addDoc(collection(db, "orders"), {
        userId: user.uid,
        email: user.email,
        plan: plan,
        accountSize: size,
        amountPaid: parseFloat(price.replace('$', '')),
        network: selectedNetwork,
        coin: selectedCoin,
        destinationTag: tag,
        status: "waiting",
        createdAt: serverTimestamp(),
        expiresAt: new Date(Date.now() + 1200 * 1000).toISOString(),
        amountNative: 1.0 
      });
      setOrderId(res.id);
      setDestinationTag(tag);
      setOrderStatus('waiting');
      setTimeLeft(1200); 
    } catch (e) {
      toast({ variant: "destructive", title: "Order Creation Failed" });
    } finally {
      setLoading(false);
      isCreatingRef.current = false;
    }
  }, [user, plan, size, price, selectedNetwork, selectedCoin, toast]);

  useEffect(() => {
    if (selectedNetwork && selectedCoin && user && !orderId) {
      createOrder();
    }
  }, [selectedNetwork, selectedCoin, user, orderId, createOrder]);

  useEffect(() => {
    if (!orderId) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          updateDoc(doc(db, "orders", orderId), { status: "expired" }).catch(() => {});
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    const unsub = onSnapshot(doc(db, "orders", orderId), (snap) => {
      const data = snap.data();
      if (!data) return;
      
      if (data.status === "completed") {
        setOrderStatus("completed");
        toast({ title: "Payment Verified!", description: "Your account is ready." });
      } else if (data.status === "detected") {
        setOrderStatus("detected");
        setConfirmations(data.confirmations || 0);
      } else if (data.status === "rejected" || data.status === "expired") {
        setOrderStatus("idle");
        setOrderId(null);
        toast({ variant: "destructive", title: "Session Ended", description: "Payment window expired or was rejected." });
      }
    });

    const poller = setInterval(async () => {
      if (orderStatus !== 'completed' && orderStatus !== 'idle') {
        fetch('/api/admin/verify-onchain', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId })
        }).catch(() => {});
      }
    }, 20000);

    return () => { clearInterval(timer); unsub(); clearInterval(poller); };
  }, [orderId, orderStatus, toast]);

  const handleManualVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderId || !txHash) return;
    setLoading(true);
    try {
      const base64 = proofFile ? await uploadImageAsBase64(proofFile) : null;
      await updateDoc(doc(db, "orders", orderId), {
        status: "manual_review",
        txHash: sanitizeInput(txHash),
        paymentScreenshot: base64,
        submittedAt: serverTimestamp()
      });
      toast({ title: "Review Requested", description: "Admin will verify within 30 minutes." });
      setManualMode(false);
    } catch (e) {
      toast({ variant: "destructive", title: "Request Failed" });
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (s: number) => `${Math.floor(s/60)}:${(s%60).toString().padStart(2, '0')}`;

  if (orderStatus === 'completed') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="space-y-6">
          <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto shadow-[0_0_40px_rgba(16,185,129,0.2)]">
            <CheckCircle2 className="w-10 h-10 text-emerald-500" />
          </div>
          <h2 className="text-4xl font-headline font-bold text-white">Payment Confirmed</h2>
          <p className="text-muted-foreground max-sm mx-auto">Your institutional challenge node is now active. Check your email for login credentials.</p>
          <Button className="h-12 px-8 font-black cyan-box-glow" onClick={() => router.push('/dashboard')}>Enter Dashboard <ArrowRight className="ml-2 w-4 h-4" /></Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto pb-20">
      <header className="mb-10 flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="text-center md:text-left">
          <Badge variant="outline" className="mb-2 border-primary/30 text-primary uppercase tracking-widest text-[10px] font-black">Secure Blockchain Gateway</Badge>
          <h1 className="text-4xl font-headline font-bold text-white">Challenge Provisioning</h1>
        </div>
        {(selectedNetwork && selectedCoin) && (
          <div className="bg-secondary/50 border border-border px-6 py-3 rounded-2xl flex items-center gap-4 animate-in fade-in slide-in-from-right-4">
             <Timer className="w-5 h-5 text-primary animate-pulse" />
             <div>
                <p className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">Awaiting Transaction</p>
                <p className="text-xl font-mono font-bold text-white">{formatTime(timeLeft)}</p>
             </div>
          </div>
        )}
      </header>

      <div className="grid lg:grid-cols-3 gap-8">
        <Card className="lg:col-span-2 border-border/50 bg-card/40 backdrop-blur-sm overflow-hidden">
          <CardHeader className="border-b border-white/5 pb-6">
            <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
               <CardTitle className="text-white font-headline font-bold">Transfer Details</CardTitle>
               <div className="flex flex-wrap gap-3 w-full sm:w-auto">
                 <div className="space-y-1.5 flex-1 sm:min-w-[180px]">
                   <Label className="text-[9px] font-black uppercase text-zinc-500">1. Select Network</Label>
                   <Select value={selectedNetwork || ""} onValueChange={(val) => { setSelectedNetwork(val); setSelectedCoin(null); setOrderId(null); }}>
                     <SelectTrigger className="bg-zinc-900 border-zinc-800 h-10 text-xs font-bold"><SelectValue placeholder="Network..." /></SelectTrigger>
                     <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                       {NETWORK_CONFIG.map(n => <SelectItem key={n.id} value={n.id} className="font-bold">{n.label}</SelectItem>)}
                     </SelectContent>
                   </Select>
                 </div>
                 
                 <AnimatePresence>
                   {selectedNetwork && (
                     <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="space-y-1.5 flex-1 sm:min-w-[140px]">
                        <Label className="text-[9px] font-black uppercase text-zinc-500">2. Select Asset</Label>
                        <Select value={selectedCoin || ""} onValueChange={(v) => { setSelectedCoin(v); setOrderId(null); }}>
                          <SelectTrigger className="bg-zinc-900 border-zinc-800 h-10 text-xs font-bold"><SelectValue placeholder="Coin..." /></SelectTrigger>
                          <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                            {networkInfo?.coins.map(c => <SelectItem key={c} value={c} className="font-bold">{c}</SelectItem>)}
                          </SelectContent>
                        </Select>
                     </motion.div>
                   )}
                 </AnimatePresence>
               </div>
            </div>
          </CardHeader>
          <CardContent className="p-8">
            {(!selectedNetwork || !selectedCoin) ? (
              <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 opacity-40">
                 <div className="w-16 h-16 rounded-full bg-secondary border border-border flex items-center justify-center">
                    <Globe className="w-8 h-8 text-muted-foreground" />
                 </div>
                 <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Select Network and Asset to continue</p>
              </div>
            ) : (
              <div className="flex flex-col md:flex-row gap-10 items-center animate-in zoom-in-95 duration-300">
                <div className="bg-white p-3 rounded-2xl shadow-2xl shrink-0 group relative">
                  <QRCodeSVG value={networkInfo!.address} size={200} />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-2xl backdrop-blur-sm">
                    <p className="text-white text-[10px] font-black uppercase tracking-widest">Scan to Pay</p>
                  </div>
                </div>
                <div className="space-y-6 flex-1 w-full">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">Receiving Wallet ({networkInfo!.label})</Label>
                    <div className="flex gap-2">
                      <Input readOnly value={networkInfo!.address} className="bg-zinc-900/50 font-mono text-[10px] h-11 border-zinc-800" />
                      <Button variant="secondary" size="icon" className="h-11 w-11 shrink-0" onClick={() => { navigator.clipboard.writeText(networkInfo!.address); toast({ title: "Address Copied" }); }}><Copy size={16} /></Button>
                    </div>
                  </div>

                  {selectedNetwork === 'XRPL' && (
                    <div className="space-y-2 p-4 bg-primary/10 border border-primary/30 rounded-xl">
                      <div className="flex justify-between items-center">
                        <Label className="text-[10px] font-black uppercase text-primary tracking-widest">Required Destination Tag</Label>
                        <Badge className="bg-primary text-black font-black text-[10px]">CRITICAL</Badge>
                      </div>
                      <div className="flex gap-2">
                        <Input readOnly value={destinationTag || 'Generating...'} className="bg-background/50 font-mono text-lg h-12 border-primary/30 text-center font-bold text-white tracking-widest" />
                        <Button variant="outline" size="icon" className="h-12 w-12 border-primary/30" onClick={() => { navigator.clipboard.writeText(String(destinationTag)); toast({ title: "Tag Copied" }); }}><Copy size={16} /></Button>
                      </div>
                      <p className="text-[9px] text-primary/80 font-bold uppercase tracking-tighter">You MUST include this tag when sending or your payment will be lost.</p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-zinc-900/30 border border-border rounded-xl">
                        <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">Exact Amount</p>
                        <p className="text-2xl font-headline font-bold text-primary">{price}</p>
                    </div>
                    <div className="p-4 bg-zinc-900/30 border border-border rounded-xl">
                        <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">Asset Required</p>
                        <p className="text-xl font-headline font-bold text-white truncate">{selectedCoin}</p>
                    </div>
                  </div>
                  {orderStatus === 'detected' && (
                    <div className="p-4 rounded-xl bg-primary/10 border border-primary/30 flex items-center gap-4">
                      <Loader2 className="w-5 h-5 text-primary animate-spin" />
                      <div>
                          <p className="text-sm font-bold text-white">Transaction Detected!</p>
                          <p className="text-xs text-primary font-bold">Confirmations: {confirmations} / Required</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
          <CardFooter className="bg-secondary/10 p-6 border-t border-white/5">
             <div className="flex items-start gap-3">
                <AlertTriangle className="text-amber-500 w-5 h-5 shrink-0 mt-0.5" />
                <p className="text-[11px] text-zinc-400 leading-relaxed font-medium">
                  {(!selectedNetwork || !selectedCoin) 
                    ? "Institutional blockchain nodes monitor these addresses in real-time. Please choose a network to begin."
                    : `Only send ${selectedCoin} on the ${networkInfo?.label} network. Funds sent via unsupported networks or without required tags are non-recoverable. Transaction is automatically monitored.`}
                </p>
             </div>
          </CardFooter>
        </Card>

        <div className="space-y-6">
           <Card className="border-border/50 bg-card/40">
             <CardHeader className="pb-4"><CardTitle className="text-base font-headline font-bold text-white">Order Summary</CardTitle></CardHeader>
             <CardContent className="space-y-4">
                <div className="flex justify-between text-xs">
                   <span className="text-zinc-500 uppercase font-black tracking-widest">Challenge</span>
                   <span className="text-white font-bold">{size} {getDisplayName(plan)}</span>
                </div>
                <div className="flex justify-between text-xs">
                   <span className="text-zinc-500 uppercase font-black tracking-widest">Gateway</span>
                   <span className="text-white font-bold">{networkInfo?.label || 'Not Selected'}</span>
                </div>
                <div className="pt-4 border-t border-white/5 flex justify-between items-end">
                   <span className="text-lg font-headline font-bold text-white">Total Due</span>
                   <span className="text-2xl font-headline font-bold text-primary">{price}</span>
                </div>
             </CardContent>
           </Card>

           {orderId && (
             <div className="text-center">
                <button 
                  onClick={() => setManualMode(!manualMode)}
                  className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 hover:text-primary transition-colors underline underline-offset-4"
                >
                  Payment not showing? Verify manually
                </button>
             </div>
           )}

           <AnimatePresence>
             {manualMode && (
               <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, y: 10 }}>
                 <Card className="border-primary/20 bg-primary/5">
                   <CardHeader><CardTitle className="text-sm font-headline font-bold text-white">Manual Verification</CardTitle></CardHeader>
                   <CardContent className="space-y-4">
                      <div className="space-y-2">
                         <Label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Transaction Hash (TXID)</Label>
                         <Input value={txHash} onChange={e => setTxHash(e.target.value)} placeholder="0x..." className="bg-zinc-900 border-zinc-700 h-10 font-mono text-xs" />
                      </div>
                      <div className="space-y-2">
                         <Label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Upload Screenshot</Label>
                         <div className="relative h-12 border border-dashed border-zinc-700 rounded-lg flex items-center justify-center bg-zinc-900/50 hover:bg-zinc-900 transition-colors group">
                            <input type="file" onChange={e => setProofFile(e.target.files?.[0] || null)} className="absolute inset-0 opacity-0 cursor-pointer" />
                            <div className="flex items-center gap-2">
                               <Upload className="w-3 h-3 text-zinc-500 group-hover:text-primary" />
                               <span className="text-[10px] font-bold text-zinc-500 truncate max-w-[150px]">{proofFile ? proofFile.name : 'Choose File'}</span>
                            </div>
                         </div>
                      </div>
                      <Button onClick={handleManualVerify} disabled={loading || !txHash} className="w-full h-11 bg-primary text-black font-black uppercase tracking-widest text-xs">
                         {loading ? <Loader2 className="animate-spin w-4 h-4" /> : "SUBMIT FOR REVIEW"}
                      </Button>
                   </CardContent>
                 </Card>
               </motion.div>
             )}
           </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function getDisplayName(id: string) {
  const map: any = { '1-step': '1-Step Pro', '2-step': '2-Step Classic', '3-step': '3-Step Classic', 'instant': 'Instant Funding', 'instant-pro': 'Instant Pro' };
  return map[id] || 'Challenge Node';
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
