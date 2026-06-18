
"use client";

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Navigation } from '@/components/Navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/context/AuthContext';
import { collection, addDoc, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { Copy, CheckCircle2, AlertTriangle, QrCode, Mail, Hash, Loader2, Globe, Upload, FileImage, DollarSign } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { motion } from 'framer-motion';
import { cn, sanitizeInput } from '@/lib/utils';
import { uploadImageAsBase64 } from '@/lib/imageUpload';
import { z } from 'zod';

const PaymentSchema = z.object({
  email: z.string().email("Invalid email format"),
  txHash: z.string().min(10, "Transaction hash is too short").max(100, "Transaction hash is too long"),
  network: z.string().min(1, "Please select a network"),
  amountPaid: z.string().min(1, "Amount paid is required"),
});

const cryptoWallets = [
  {
    network: 'Ethereum (ERC20)',
    token: 'USDC/USDT',
    address: '0x3ab3ca43dc691f468bea91883f493cabf6da84d4'
  },
  {
    network: 'Tron (TRC20)',
    token: 'USDT',
    address: 'TMitDXKKnsHKgBVENHdorV4axBou6KC5JM'
  },
  {
    network: 'BNB Smart Chain (BEP20)',
    token: 'USDT',
    address: '0x3ab3ca43dc691f468bea91883f493cabf6da84d4'
  },
  {
    network: 'Polygon',
    token: 'USDT',
    address: '0x3ab3ca43dc691f468bea91883f493cabf6da84d4',
    isPolygon: true
  }
];

function PaymentContent() {
  const searchParams = useSearchParams();
  const { user, userData } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  
  const plan = searchParams.get('plan') || '1-step';
  const size = searchParams.get('size') || '$100k';
  const price = searchParams.get('price') || '$499';
  
  const [txHash, setTxHash] = useState('');
  const [email, setEmail] = useState(user?.email || '');
  const [amountPaid, setAmountPaid] = useState(price.replace('$', ''));
  const [selectedNetwork, setSelectedNetwork] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (user?.email) setEmail(user.email);
  }, [user]);

  const getDisplayName = (id: string) => {
    if (id === '1-step') return '1-Step Pro';
    if (id === '2-step') return '2-Step Classic';
    if (id === '3-step') return '3-Step Classic';
    return 'Instant Funding';
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        toast({ variant: "destructive", title: "File too large", description: "Proof image must be under 2MB." });
        return;
      }
      setProofFile(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast({ variant: "destructive", title: "Authentication Required", description: "Please log in to purchase a challenge." });
      return;
    }

    const validation = PaymentSchema.safeParse({ email, txHash, network: selectedNetwork, amountPaid });
    if (!validation.success) {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: validation.error.errors[0].message,
      });
      return;
    }
    
    setLoading(true);
    const sanitizedEmail = sanitizeInput(email);
    const sanitizedHash = sanitizeInput(txHash);

    try {
      let paymentProofBase64 = null;
      if (proofFile) {
        paymentProofBase64 = await uploadImageAsBase64(proofFile);
      }

      const orderData = {
        userId: user.uid,
        userName: userData?.name || 'Unknown Trader',
        email: sanitizedEmail,
        plan: getDisplayName(plan),
        accountSize: size,
        price,
        txHash: sanitizedHash,
        amountPaid: parseFloat(amountPaid),
        network: selectedNetwork,
        paymentScreenshot: paymentProofBase64,
        status: 'pending',
        submittedAt: serverTimestamp(),
        date: new Date().toISOString()
      };

      const ordersRef = collection(db, 'orders');
      await addDoc(ordersRef, orderData);

      await updateDoc(doc(db, "users", user.uid), {
        accountStatus: "pending_activation",
        updatedAt: serverTimestamp()
      });

      setSubmitted(true);
      toast({
        title: "Proof Submitted!",
        description: "Your verification request has been queued for review.",
      });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Submission Error", description: err.message });
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Address Copied", description: "Wallet address copied." });
  };

  if (submitted) {
    return (
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center justify-center p-12 text-center max-w-2xl mx-auto"
      >
        <div className="w-24 h-24 rounded-full bg-accent/20 flex items-center justify-center mb-8 cyan-box-glow">
          <CheckCircle2 className="text-accent w-12 h-12" />
        </div>
        <h2 className="text-4xl font-headline font-bold mb-4 text-white">Verification Pending</h2>
        <p className="text-muted-foreground text-lg mb-10 leading-relaxed">
          Your payment proof has been submitted. Our compliance team verifies transactions within 1-4 hours during business sessions. 
          MT5 credentials will be delivered to your dashboard and email once approved.
        </p>
        <div className="flex gap-4">
          <Button size="lg" className="h-14 px-8 rounded-xl font-bold cursor-pointer" onClick={() => router.push('/dashboard')}>
            Go to Dashboard
          </Button>
          <Button variant="outline" size="lg" className="h-14 px-8 rounded-xl font-bold cursor-pointer" onClick={() => router.push('/accounts')}>
            View Accounts
          </Button>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto pb-20">
      <header className="mb-12 text-center">
        <Badge variant="outline" className="mb-4 border-primary/30 text-primary px-4 py-1">SECURE PAYMENT PORTAL</Badge>
        <h1 className="text-4xl font-headline font-bold mb-2 text-white">Finalize Challenge</h1>
        <p className="text-muted-foreground">Purchasing <span className="text-white font-bold">{size} {getDisplayName(plan)}</span> for <span className="text-primary font-bold">{price}</span>.</p>
      </header>

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            {cryptoWallets.map((wallet) => (
              <Card key={wallet.network} className="bg-secondary/20 border-border/50 hover:border-primary/30 transition-all">
                <CardHeader className="pb-4">
                  <div className="flex justify-between items-center">
                    <CardTitle className="text-sm font-bold text-white">{wallet.network}</CardTitle>
                    <Badge className={cn(
                      "text-[10px] font-bold border",
                      wallet.isPolygon 
                        ? "bg-purple-500/10 text-purple-400 border-purple-500/20" 
                        : "bg-primary/10 text-primary border-primary/20"
                    )}>
                      {wallet.token}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-white p-2 rounded-xl flex justify-center w-fit mx-auto shadow-xl">
                    <QRCodeSVG value={wallet.address} size={120} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[9px] uppercase tracking-widest font-black text-muted-foreground">Wallet Address</Label>
                    <div className="flex gap-2">
                      <Input 
                        readOnly 
                        value={wallet.address} 
                        className="bg-background/50 font-mono text-[8px] h-9 border-border text-white px-2 focus-visible:ring-0" 
                      />
                      <Button variant="secondary" size="icon" className="h-9 w-9 flex-shrink-0 cursor-pointer" onClick={() => copyToClipboard(wallet.address)}>
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          
          <div className="p-6 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-start gap-4">
            <AlertTriangle className="text-destructive w-6 h-6 flex-shrink-0 mt-1" />
            <div>
              <h4 className="text-destructive font-bold text-sm mb-1 uppercase tracking-tight">Important Note</h4>
              <p className="text-destructive/80 text-xs leading-relaxed font-medium">
                Ensure you send the correct asset on the correct network. USDT/USDC sent on the wrong network cannot be recovered. Always double-check your TX hash before submitting.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <Card className="bg-card border-primary/20 shadow-2xl sticky top-24">
            <CardHeader>
              <CardTitle className="text-xl font-headline font-bold text-white">Verification Form</CardTitle>
              <CardDescription className="text-xs">Submit proof of transaction</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label className="text-xs flex items-center gap-2 text-white font-bold">
                    <Globe className="w-3.5 h-3.5 text-primary" /> Network Used
                  </Label>
                  <Select value={selectedNetwork} onValueChange={setSelectedNetwork} required>
                    <SelectTrigger className="bg-secondary/30 h-11 rounded-xl text-white text-xs">
                      <SelectValue placeholder="Select network" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ERC20">Ethereum (ERC20)</SelectItem>
                      <SelectItem value="TRC20">Tron (TRC20)</SelectItem>
                      <SelectItem value="BEP20">BNB Smart Chain (BEP20)</SelectItem>
                      <SelectItem value="Polygon">Polygon (MATIC)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="amountPaid" className="text-xs flex items-center gap-2 text-white font-bold">
                    <DollarSign className="w-3.5 h-3.5 text-primary" /> Amount Paid ($)
                  </Label>
                  <Input 
                    id="amountPaid" 
                    type="number" 
                    value={amountPaid}
                    onChange={(e) => setAmountPaid(e.target.value)}
                    required
                    className="bg-secondary/30 h-11 rounded-xl text-white text-xs"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="txHash" className="text-xs flex items-center gap-2 text-white font-bold">
                    <Hash className="w-3.5 h-3.5 text-primary" /> Transaction Hash (TXID)
                  </Label>
                  <Input 
                    id="txHash" 
                    placeholder="Enter full hash..." 
                    value={txHash}
                    onChange={(e) => setTxHash(e.target.value)}
                    required
                    className="bg-secondary/30 h-11 rounded-xl font-mono text-[10px] text-white"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs flex items-center gap-2 text-white font-bold">
                    <FileImage className="w-3.5 h-3.5 text-primary" /> Payment Screenshot
                  </Label>
                  <div className="relative h-11 border-2 border-dashed border-border rounded-xl flex items-center justify-center bg-secondary/20 hover:bg-secondary/40 transition-colors cursor-pointer group">
                    <input 
                      type="file" 
                      accept="image/*" 
                      className="absolute inset-0 opacity-0 cursor-pointer" 
                      onChange={handleFileChange}
                    />
                    <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground group-hover:text-primary">
                      {proofFile ? <><CheckCircle2 className="w-3.5 h-3.5" /> {proofFile.name}</> : <><Upload className="w-3 h-3" /> Upload Proof</>}
                    </div>
                  </div>
                </div>

                <Button 
                  type="submit" 
                  className="w-full h-12 font-bold text-base rounded-xl cyan-box-glow cursor-pointer mt-4" 
                  disabled={loading || !txHash || !selectedNetwork}
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  {loading ? 'Submitting...' : 'Submit Payment Proof'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function PaymentPage() {
  return (
    <div className="flex min-h-screen bg-background">
      <Navigation />
      <main className="flex-1 p-8">
        <Suspense fallback={<div className="flex items-center justify-center h-full"><Loader2 className="animate-spin" /></div>}>
          <PaymentContent />
        </Suspense>
      </main>
    </div>
  );
}
