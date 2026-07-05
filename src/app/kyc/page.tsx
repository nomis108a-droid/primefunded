"use client";

import { useState } from 'react';
import { Navigation } from '@/components/Navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ShieldCheck, Upload, CheckCircle2, Clock, Loader2, FileText, AlertCircle, HelpCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { doc, updateDoc, serverTimestamp, addDoc, collection } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import Link from 'next/link';

export default function KYCPage() {
  const { user, userData } = useAuth();
  const [step, setStep] = useState(userData?.kycStatus === 'pending' || userData?.kycStatus === 'verified' ? 3 : 1);
  const [loading, setLoading] = useState(false);
  const [idFile, setIdFile] = useState<File | null>(null);
  const [addressFile, setAddressFile] = useState<File | null>(null);
  const { toast } = useToast();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'id' | 'address') => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Institutional validation: Support up to 10MB via Storage
    const maxSize = 10 * 1024 * 1024; 
    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];

    if (file.size > maxSize) {
      toast({
        variant: "destructive",
        title: "File Too Large",
        description: "Max file size is 10MB. Please use a standard image or PDF.",
      });
      return;
    }

    if (!allowedTypes.includes(file.type)) {
      toast({
        variant: "destructive",
        title: "Invalid File Type",
        description: "Only JPG, PNG and PDF are allowed.",
      });
      return;
    }

    if (type === 'id') setIdFile(file);
    else setAddressFile(file);
    
    toast({ title: "File Selected", description: file.name });
  };

  const uploadToStorage = async (file: File, type: 'id' | 'address') => {
    if (!user) throw new Error("No authenticated user");
    const extension = file.name.split('.').pop();
    const fileName = `${type}-proof-${Date.now()}.${extension}`;
    const storageRef = ref(storage, `kyc/${user.uid}/${fileName}`);
    
    const snapshot = await uploadBytes(storageRef, file);
    return getDownloadURL(snapshot.ref);
  };

  const handleSubmit = async () => {
    if (!user || !idFile || !addressFile) {
      toast({ variant: "destructive", title: "Missing Files", description: "Please upload both Identity and Address documents." });
      return;
    }
    setLoading(true);
    
    try {
      // Step 1: Upload to Secure Storage
      const [idUrl, addressUrl] = await Promise.all([
        uploadToStorage(idFile, 'id'),
        uploadToStorage(addressFile, 'address')
      ]);

      // Step 2: Update Firestore with Download URLs
      const userRef = doc(db, 'users', user.uid);
      const updates = {
        kycStatus: 'pending',
        kycSubmittedAt: new Date().toISOString(),
        kycVerified: false,
        kycRejectionReason: null,
        idProofUrl: idUrl,
        addressProofUrl: addressUrl
      };

      await updateDoc(userRef, updates);
      
      await addDoc(collection(db, 'users', user.uid, 'notifications'), {
        title: "⏳ KYC Under Review",
        message: "Your documents have been securely uploaded to our vault. We will notify you once review is complete.",
        type: 'kyc_submitted',
        isRead: false,
        createdAt: serverTimestamp()
      });

      setStep(3);
      toast({
        title: "Documents Submitted",
        description: "Your KYC application is now being reviewed.",
      });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Submission Failed", description: err.message });
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      <Navigation />
      <main className="flex-1 p-8 overflow-y-auto custom-scrollbar">
        <header className="mb-10 text-center">
          <h1 className="text-3xl font-headline font-bold mb-1 text-white">Verify Your Identity</h1>
          <p className="text-muted-foreground">Secure identity verification is required for all withdrawals.</p>
        </header>

        {/* Instructions Header */}
        <section className="mb-12 text-left max-w-2xl mx-auto bg-zinc-900/40 border border-zinc-800 rounded-3xl p-8 shadow-2xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-primary/10 rounded-xl">
              <ShieldCheck className="w-6 h-6 text-primary" />
            </div>
            <h2 className="text-2xl font-headline font-bold text-white">Verification Guide</h2>
          </div>
          
          <div className="space-y-6">
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 font-bold text-primary text-sm shadow-[0_0_10px_rgba(17,179,245,0.2)]">1</div>
              <div className="space-y-1">
                <p className="text-white font-bold">ID Front Photo</p>
                <p className="text-sm text-zinc-400 leading-relaxed">Take a clear photo of the FRONT of your government ID (Aadhaar card, Passport, Driver's License, National ID card, etc.)</p>
              </div>
            </div>
            
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 font-bold text-primary text-sm shadow-[0_0_10px_rgba(17,179,245,0.2)]">2</div>
              <div className="space-y-1">
                <p className="text-white font-bold">ID Back Photo</p>
                <p className="text-sm text-zinc-400 leading-relaxed">Take a clear photo of the BACK of your government ID</p>
              </div>
            </div>
            
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 font-bold text-primary text-sm shadow-[0_0_10px_rgba(17,179,245,0.2)]">3</div>
              <div className="space-y-1">
                <p className="text-white font-bold">Selfie with ID</p>
                <p className="text-sm text-zinc-400 leading-relaxed">Take a photo of yourself HOLDING your ID next to your face, so both your face and the ID are clearly visible in the same photo</p>
              </div>
            </div>
          </div>
          
          <div className="mt-10 pt-6 border-t border-white/5 bg-primary/5 -mx-8 -mb-8 px-8 pb-8 rounded-b-3xl">
            <p className="text-[11px] font-bold text-primary uppercase tracking-widest mb-3">Accepted Documents Example:</p>
            <p className="text-xs text-zinc-400 leading-relaxed font-medium">
              Indian Aadhaar Card, US Driver's License, UK Passport, EU National ID, any government-issued photo ID from any country
            </p>
          </div>
        </section>

        <div className="max-w-2xl mx-auto">
          <div className="flex justify-between items-center mb-8 relative">
            <div className="absolute top-1/2 left-0 w-full h-0.5 bg-secondary -z-10" />
            <StepIndicator currentStep={step} step={1} label="Identity" />
            <StepIndicator currentStep={step} step={2} label="Address" />
            <StepIndicator currentStep={step} step={3} label="Confirmation" />
          </div>

          <Card className="border-primary/20 bg-card/40 backdrop-blur-sm shadow-2xl overflow-hidden">
            {step === 1 && (
              <>
                <CardHeader>
                  <CardTitle className="text-white text-xl">Step 1: Proof of Identity</CardTitle>
                  <CardDescription>Upload a valid government-issued ID (Passport or ID Card).</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="relative p-12 border-2 border-dashed border-border rounded-2xl flex flex-col items-center justify-center bg-background/30 hover:border-primary/50 transition-colors cursor-pointer group">
                    <input 
                      type="file" 
                      accept=".jpg,.jpeg,.png,.pdf" 
                      className="absolute inset-0 opacity-0 cursor-pointer" 
                      onChange={(e) => handleFileChange(e, 'id')}
                    />
                    {idFile ? (
                      <div className="text-center">
                        <FileText className="w-12 h-12 text-primary mb-4 mx-auto" />
                        <p className="text-sm font-bold text-white truncate max-w-[200px]">{idFile.name}</p>
                      </div>
                    ) : (
                      <>
                        <Upload className="w-12 h-12 text-muted-foreground mb-4 group-hover:text-primary transition-colors" />
                        <p className="text-sm font-bold text-white">Click to upload ID</p>
                        <p className="text-xs text-muted-foreground mt-2">JPG, PNG, PDF (Max 10MB)</p>
                      </>
                    )}
                  </div>
                  <Button className="w-full font-bold h-12 rounded-xl bg-primary hover:bg-primary/90 cursor-pointer" onClick={() => setStep(2)}>Next Step</Button>
                </CardContent>
              </>
            )}

            {step === 2 && (
              <>
                <CardHeader>
                  <CardTitle className="text-white text-xl">Step 2: Proof of Address</CardTitle>
                  <CardDescription>A utility bill or bank statement (last 3 months).</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="relative p-12 border-2 border-dashed border-border rounded-2xl flex flex-col items-center justify-center bg-background/30 hover:border-primary/50 transition-colors cursor-pointer group">
                    <input 
                      type="file" 
                      accept=".jpg,.jpeg,.png,.pdf" 
                      className="absolute inset-0 opacity-0 cursor-pointer" 
                      onChange={(e) => handleFileChange(e, 'address')}
                    />
                    {addressFile ? (
                      <div className="text-center">
                        <FileText className="w-12 h-12 text-primary mb-4 mx-auto" />
                        <p className="text-sm font-bold text-white truncate max-w-[200px]">{addressFile.name}</p>
                      </div>
                    ) : (
                      <>
                        <Upload className="w-12 h-12 text-muted-foreground mb-4 group-hover:text-primary transition-colors" />
                        <p className="text-sm font-bold text-white">Upload proof of address</p>
                      </>
                    )}
                  </div>
                  <div className="flex gap-4">
                    <Button variant="outline" className="flex-1 h-12 rounded-xl font-bold cursor-pointer" onClick={() => setStep(1)}>Back</Button>
                    <Button className="flex-1 font-bold h-12 rounded-xl bg-primary hover:bg-primary/90 cursor-pointer" onClick={handleSubmit} disabled={loading || !addressFile || !idFile}>
                      {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                      Submit for Review
                    </Button>
                  </div>
                </CardContent>
              </>
            )}

            {step === 3 && (
              <CardContent className="pt-12 pb-12 flex flex-col items-center text-center">
                {userData?.kycVerified ? (
                  <>
                    <div className="w-24 h-24 rounded-full bg-accent/20 flex items-center justify-center mb-8 cyan-box-glow">
                      <CheckCircle2 className="w-12 h-12 text-accent" />
                    </div>
                    <h3 className="text-3xl font-headline font-bold mb-3 text-white">Identity Verified!</h3>
                    <p className="text-muted-foreground max-sm mb-10 leading-relaxed">
                      Your identity has been successfully verified. Payouts are now unlocked.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center mb-8">
                      <Clock className="w-12 h-12 text-primary" />
                    </div>
                    <h3 className="text-3xl font-headline font-bold mb-3 text-white">Application Received</h3>
                    <p className="text-muted-foreground max-w-sm mb-10 leading-relaxed">
                      Verification typically takes 12-24 hours. Your documents are securely stored in our vault. We'll alert you once processed.
                    </p>
                  </>
                )}
                <Button className="w-full h-14 rounded-xl font-bold text-lg cursor-pointer" asChild>
                  <Link href="/dashboard">Return to Dashboard</Link>
                </Button>
              </CardContent>
            )}
          </Card>
        </div>
      </main>
    </div>
  );
}

function StepIndicator({ currentStep, step, label }: { currentStep: number, step: number, label: string }) {
  const isActive = currentStep === step;
  const isCompleted = currentStep > step;

  return (
    <div className="flex flex-col items-center gap-2 bg-background px-4">
      <div className={cn(
        "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300",
        isActive ? "border-primary bg-primary text-primary-foreground shadow-[0_0_20px_rgba(17,179,245,0.4)]" : 
        isCompleted ? "border-primary bg-primary text-primary-foreground" : "border-border bg-secondary text-muted-foreground"
      )}>
        {isCompleted ? <CheckCircle2 className="w-6 h-6" /> : <span className="font-bold">{step}</span>}
      </div>
      <span className={cn("text-[10px] uppercase font-black tracking-[0.2em]", isActive ? "text-primary" : "text-muted-foreground")}>
        {label}
      </span>
    </div>
  );
}
