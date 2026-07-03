"use client";

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { signInWithEmailAndPassword, sendPasswordResetEmail, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Mail, ChevronLeft, ShieldAlert, Eye, EyeOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { sanitizeInput } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { useBrandSettings } from '@/hooks/use-brand-settings';

function LoginContent() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [view, setView] = useState<'login' | 'forgot'>('login');
  
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();
  const { logoUrl, siteName } = useBrandSettings();

  const redirectTo = searchParams.get('redirect') || '/dashboard';

  useEffect(() => {
    if (user && !authLoading) {
      router.push(redirectTo);
    }
  }, [user, authLoading, router, redirectTo]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const sanitizedEmail = sanitizeInput(email);

    try {
      await setPersistence(auth, browserLocalPersistence);
      await signInWithEmailAndPassword(auth, sanitizedEmail, password);
      toast({ title: "Welcome back!", description: "Accessing trading terminal..." });
      router.push(redirectTo);
    } catch (error: any) {
      console.error(error);
      let msg = "Invalid email or password. Please check your credentials.";
      if (error.code === 'auth/user-not-found') msg = "No account found with this email.";
      if (error.code === 'auth/wrong-password') msg = "Incorrect password. Try again or reset it.";
      
      toast({
        variant: "destructive",
        title: "Login Failed",
        description: msg,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast({ variant: "destructive", title: "Email Required", description: "Please enter your email to receive a recovery link." });
      return;
    }
    setResetLoading(true);
    try {
      await sendPasswordResetEmail(auth, sanitizeInput(email));
      toast({ title: "Reset Link Sent", description: "Check your inbox for password recovery instructions." });
      setView('login');
    } catch (error: any) {
      toast({ variant: "destructive", title: "Reset Failed", description: error.message });
    } finally {
      setResetLoading(false);
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
          <h1 className="text-5xl font-headline font-bold mb-6 leading-tight text-white">
            {view === 'login' ? "Welcome Back, \nTrader." : "Recover Your \nAccount."}
          </h1>
          <p className="text-xl text-muted-foreground leading-relaxed">
            {view === 'login' 
              ? "The markets are moving. Log in to your dashboard to monitor your challenges and performance."
              : "Enter your email address and we'll send you a link to reset your password securely."}
          </p>
        </div>
      </div>
      
      <div className="flex flex-col justify-center items-center p-8 bg-background">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center">
            <h2 className="text-3xl font-headline font-bold text-white">
              {view === 'login' ? 'Sign In' : 'Forgot Password'}
            </h2>
            <p className="text-muted-foreground mt-2">
              {view === 'login' ? 'Enter your credentials to access your account' : 'Enter your email to receive a recovery link'}
            </p>
          </div>
          
          {view === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input id="email" type="email" placeholder="trader@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required className="h-12 bg-secondary/50 border-border/50 text-white" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <button type="button" onClick={() => setView('forgot')} className="text-xs text-primary font-bold hover:underline uppercase tracking-widest">Forgot password?</button>
                </div>
                <div className="relative">
                  <Input id="password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required className="h-12 bg-secondary/50 border-border/50 text-white pr-10" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <Button type="submit" className="w-full h-12 font-bold text-lg cyan-box-glow" disabled={loading}>
                {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
                {loading ? 'Authenticating...' : 'Sign In'}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleResetPassword} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="reset-email">Email Address</Label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input id="reset-email" type="email" placeholder="trader@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required className="h-12 pl-12 bg-secondary/50 border-border/50 text-white" />
                </div>
              </div>
              <div className="space-y-4">
                <Button type="submit" className="w-full h-12 font-bold text-lg cyan-box-glow" disabled={resetLoading}>
                  {resetLoading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
                  {resetLoading ? 'Sending...' : 'Send Recovery Link'}
                </Button>
                <button type="button" onClick={() => setView('login')} className="w-full flex items-center justify-center gap-2 text-xs font-bold text-muted-foreground hover:text-primary uppercase tracking-[0.2em]">
                  <ChevronLeft className="w-3 h-3" /> Back to Login
                </button>
              </div>
            </form>
          )}
          
          <p className="text-center text-sm text-muted-foreground">
            Don't have an account? <Link href={redirectTo !== '/dashboard' ? `/signup?redirect=${encodeURIComponent(redirectTo)}` : '/signup'} className="text-primary font-semibold hover:underline">Join {siteName}</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background flex items-center justify-center text-white">Loading Terminal...</div>}>
      <LoginContent />
    </Suspense>
  );
}