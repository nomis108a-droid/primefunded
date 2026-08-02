"use client";

import { useState, Suspense, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, serverTimestamp, collection, increment, updateDoc, addDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle2, Loader2, Eye, EyeOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn, sanitizeInput } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { z } from 'zod';
import { useBrandSettings } from '@/hooks/use-brand-settings';
import { generateSecureReferralCode, validateReferralCode } from '@/lib/referral';

const SignupSchema = z.object({
  name: z.string().min(2, "Name is too short").max(100, "Name must be under 100 characters"),
  email: z.string().email("Invalid email format"),
  phone: z.string().min(5, "Phone number is too short").max(20, "Phone number is too long"),
  country: z.string().min(2, "Country is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

function getShortId(uid: string): string {
  if (!uid) return "00000000";
  let hash = 0;
  for (let i = 0; i < uid.length; i++) {
    hash = ((hash << 5) - hash) + uid.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash).toString().slice(0, 8).padStart(8, '0');
}

function SignupContent() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const [referralInput, setReferralInput] = useState('');
  const [loading, setLoading] = useState(false);
  
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { user: existingUser, loading: authLoading } = useAuth();
  const { logoUrl, siteName } = useBrandSettings();

  const referralCodeFromUrl = searchParams.get('ref');
  
  // CASE 2: Intelligent redirect - skip signup if already logged in
  useEffect(() => {
    if (existingUser && !authLoading) {
      const storedCode = localStorage.getItem('pf_referral_code');
      const effectiveCode = referralCodeFromUrl || storedCode;
      
      // If there's a referral context, go to challenges, otherwise dashboard
      const target = effectiveCode ? '/challenges' : (searchParams.get('redirect') || '/dashboard');
      console.log('[Signup] User already authenticated. Redirecting to:', target);
      router.push(target);
    }
  }, [existingUser, authLoading, router, searchParams, referralCodeFromUrl]);

  // CASE 1: Auto-fill referral code from storage or URL
  useEffect(() => {
    const storedCode = localStorage.getItem('pf_referral_code');
    const effectiveCode = referralCodeFromUrl || storedCode;

    if (effectiveCode && effectiveCode.startsWith('PF')) {
      setReferralInput(effectiveCode.toUpperCase());
    }
  }, [referralCodeFromUrl]);

  // Prevent flicker for logged in users
  if (authLoading || (existingUser && !authLoading)) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center text-white">
        <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground animate-pulse">
          {existingUser ? "Redirecting to Terminal..." : "Syncing Terminal Node..."}
        </p>
      </div>
    );
  }

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const validation = SignupSchema.safeParse({ name, email, phone, country, password });
    if (!validation.success) {
      toast({ variant: "destructive", title: "Validation Error", description: validation.error.errors[0].message });
      return;
    }

    if (password !== confirmPassword) {
      toast({ variant: "destructive", title: "Password Mismatch", description: "The passwords you entered do not match." });
      return;
    }

    setLoading(true);
    const sanitizedEmail = sanitizeInput(email).toLowerCase();

    try {
      // Resolve referral
      let finalReferredBy = null;
      if (referralInput) {
        finalReferredBy = await validateReferralCode(referralInput.toUpperCase());
      }

      const userCredential = await createUserWithEmailAndPassword(auth, sanitizedEmail, password);
      const user = userCredential.user;
      
      const traderId = getShortId(user.uid);
      const referralCode = generateSecureReferralCode();

      if (finalReferredBy) {
        const referrerRef = doc(db, 'users', finalReferredBy);
        updateDoc(referrerRef, {
          'referralStats.registrations': increment(1),
          updatedAt: serverTimestamp()
        });
        
        await addDoc(collection(db, 'referrals'), {
          referrerId: finalReferredBy,
          referredUserId: user.uid,
          referredUserEmail: sanitizedEmail,
          status: 'joined',
          amount: 0,
          createdAt: serverTimestamp()
        });
      }

      const userData = {
        uid: user.uid,
        traderId,
        referralCode,
        referredBy: finalReferredBy,
        referralStats: { clicks: 0, registrations: 0, purchases: 0 },
        referralEarnings: { pending: 0, approved: 0, paid: 0, withdrawable: 0 },
        name: sanitizeInput(name),
        email: sanitizedEmail,
        phone: sanitizeInput(phone),
        country: sanitizeInput(country),
        tier: 'Bronze',
        joinDate: new Date().toISOString(),
        balance: 0,
        equity: 0,
        status: 'active',
        kycVerified: false,
        kycStatus: 'none',
        createdAt: serverTimestamp()
      };

      await setDoc(doc(db, 'users', user.uid), userData);
      // Auto-login happens automatically... redirect to challenges
      router.push('/challenges');
    } catch (error: any) {
      if (error.code === 'auth/email-already-in-use') {
        toast({
          title: "Account Exists",
          description: "This email is already registered. Redirecting to sign in...",
        });
        const redirectPath = `/login?redirect=/challenges&email=${encodeURIComponent(sanitizedEmail)}`;
        router.push(redirectPath);
      } else {
        toast({
          variant: "destructive",
          title: "Registration Failed",
          description: "An error occurred during account creation. Please try again.",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-center p-20 bg-secondary relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full bg-grid-white opacity-20" />
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-12">
            <Image src={logoUrl} alt={siteName} width={50} height={50} className="rounded-full border-2 border-primary/20" />
            <span className="font-headline font-bold text-3xl tracking-tight text-white">{siteName}</span>
          </div>
          <h1 className="text-5xl font-headline font-bold mb-8 leading-tight text-white">Start Your <br />Funding Journey.</h1>
          <div className="space-y-6">
            <FeatureItem text="No Consistency Rules" />
            <FeatureItem text="News Trading Allowed" />
            <FeatureItem text="Daily Payouts (Instant)" />
            <FeatureItem text="Up to $200k in institutional capital" />
            <FeatureItem text="80% Profit Split" />
          </div>
        </div>
      </div>
      
      <div className="flex flex-col justify-center items-center p-8 bg-background overflow-y-auto">
        <div className="w-full max-w-md space-y-8 my-10">
          <div className="text-center">
            <h2 className="text-3xl font-headline font-bold text-white">Create Account</h2>
            <p className="text-muted-foreground mt-2">Join the world's most transparent funding firm</p>
          </div>
          
          <form onSubmit={handleSignup} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input id="name" placeholder="John Doe" value={name} onChange={(e) => setName(e.target.value)} required className="h-11 bg-secondary/50 text-white" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input id="email" type="email" placeholder="trader@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required className="h-11 bg-secondary/50 text-white" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" placeholder="+1 555..." value={phone} onChange={(e) => setPhone(e.target.value)} required className="h-11 bg-secondary/50 text-white" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="country">Country</Label>
                <Input id="country" placeholder="United Kingdom" value={country} onChange={(e) => setCountry(e.target.value)} required className="h-11 bg-secondary/50 text-white" />
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input id="password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required className="h-11 bg-secondary/50 text-white pr-10" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white transition-colors">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <div className="relative">
                  <Input id="confirmPassword" type={showConfirmPassword ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required className="h-11 bg-secondary/50 text-white pr-10" />
                  <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white transition-colors">
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="referral" className="flex items-center gap-2">
                Referral Code (Optional)
              </Label>
              <Input 
                id="referral" 
                placeholder="e.g. PF7X9KQ2M8" 
                value={referralInput}
                onChange={(e) => setReferralInput(e.target.value.toUpperCase())}
                readOnly={!!referralCodeFromUrl}
                className={cn(
                  "h-11 bg-secondary/50 transition-all uppercase font-mono text-xs text-white",
                  !!referralCodeFromUrl && "opacity-60 cursor-not-allowed"
                )}
              />
              {!!referralCodeFromUrl && (
                <p className="text-[10px] text-primary font-bold uppercase tracking-widest mt-1">✓ Referral Code Detected</p>
              )}
            </div>

            <Button type="submit" className="w-full h-12 font-bold text-lg cyan-box-glow" disabled={loading}>
              {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
              {loading ? 'Creating Account...' : 'Get Started'}
            </Button>
          </form>
          
          <p className="text-center text-sm text-muted-foreground">
            Already have an account? <Link href={referralCodeFromUrl ? `/login?ref=${referralCodeFromUrl}` : '/login'} className="text-primary font-semibold hover:underline">Sign In</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function FeatureItem({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
        <CheckCircle2 className="text-primary w-4 h-4" />
      </div>
      <span className="text-lg text-foreground font-medium">{text}</span>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background flex items-center justify-center text-white">Loading Terminal...</div>}>
      <SignupContent />
    </Suspense>
  );
}
