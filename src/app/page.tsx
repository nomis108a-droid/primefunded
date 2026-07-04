"use client";

import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { TrendingUp, ShieldCheck, Zap, Globe, ArrowRight, BarChart3, CheckCircle2, Trophy, Wallet, Instagram, Phone, Send } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { useBrandSettings } from '@/hooks/use-brand-settings';

const fadeInUp = {
  initial: { opacity: 0, y: 15 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { duration: 0.3 }
};

export default function Home() {
  const { user } = useAuth();
  const branding = useBrandSettings();

  return (
    <div className="min-h-screen bg-background selection:bg-primary selection:text-primary-foreground overflow-x-hidden">
      {/* Navbar */}
      <nav className="fixed top-0 w-full z-50 bg-background/60 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between">
          <motion.div 
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2 }}
          >
            <Link href="/" className="flex items-center gap-3 cursor-pointer">
              <Image 
                src={branding.logoUrl} 
                alt={branding.siteName}
                width={40}
                height={40}
                className="rounded-full border border-primary/20"
                data-ai-hint="site logo"
              />
              <span className="font-headline font-bold text-2xl tracking-tight text-white">{branding.siteName}</span>
            </Link>
          </motion.div>

          {/* Mobile Buttons */}
          <div className="flex md:hidden items-center gap-2">
            <Button variant="outline" size="sm" className="h-9 font-bold border-white/10" asChild>
              <Link href="/login">Login</Link>
            </Button>
            <Button size="sm" className="h-9 font-bold cyan-box-glow" asChild>
              <Link href={user ? "/challenges" : "/signup"}>Get Funded</Link>
            </Button>
          </div>
          
          <div className="hidden md:flex items-center gap-8">
            <Link href={user ? "/challenges" : "/login?redirect=/challenges"} className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">Challenges</Link>
            <Link href="/rules" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">Rules</Link>
            <Link href="/about" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">About Us</Link>
            {user ? (
              <Link href="/dashboard" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">Dashboard</Link>
            ) : (
              <Link href="/login" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">Login</Link>
            )}
            <Button className="font-bold cyan-box-glow" asChild>
              <Link href={user ? "/challenges" : "/signup"}>Get Funded</Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-48 pb-32 overflow-hidden bg-grid-white">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1200px] h-[700px] bg-primary/10 blur-[140px] rounded-full -z-10" />
        <div className="absolute bottom-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
        
        <div className="max-w-7xl mx-auto px-4 text-center">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold mb-8 uppercase tracking-wider shadow-[0_0_15px_rgba(17,179,245,0.2)]"
          >
            <span className="w-2 h-2 rounded-full bg-primary live-indicator" />
            Now Funding Up To $200,000
          </motion.div>
          
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.05 }}
            className="text-6xl md:text-8xl font-headline font-bold mb-8 leading-[1.1] tracking-tight"
          >
            Trade Like a Pro! <br />
            <span className="bg-gradient-to-r from-primary via-blue-400 to-primary bg-clip-text text-transparent cyan-glow">With Up to $200,000 Funding</span>
          </motion.h1>
          
          <motion.p 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed"
          >
            No consistency rules. News trading allowed. Daily payouts on Instant accounts. Keep 80% of your profits.
          </motion.p>

          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.12 }}
            className="flex flex-wrap justify-center gap-3 mb-12"
          >
            <HighlightBadge text="No Consistency Rules" />
            <HighlightBadge text="News Trading Allowed" />
            <HighlightBadge text="Daily Payouts (Instant)" />
          </motion.div>
          
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.15 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-6"
          >
            <Button size="lg" className="h-16 px-10 text-lg rounded-2xl font-bold transition-all hover:scale-105 hover:shadow-[0_0_40px_rgba(17,179,245,0.4)] bg-primary text-primary-foreground group" asChild>
              <Link href={user ? "/challenges" : "/signup"}>
                Start Challenge 
                <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Link>
            </Button>
            <Button variant="outline" size="lg" className="h-16 px-10 text-lg rounded-2xl font-bold border-white/10 bg-white/5 backdrop-blur-sm hover:bg-white/10" asChild>
              <Link href="/rules">View Trading Rules</Link>
            </Button>
          </motion.div>
          
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mt-24 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto"
          >
            <HighlightCard 
              icon={<Trophy className="w-8 h-8" />}
              title="Up To 10X Payouts"
              subtitle="Scale your funded account up to 10X your initial size as you hit profit targets"
            />
            <HighlightCard 
              icon={<Zap className="w-8 h-8" />}
              title="Instant Account Access"
              subtitle="Get funded instantly and start trading within minutes of purchase"
            />
            <HighlightCard 
              icon={<Wallet className="w-8 h-8" />}
              title="Up To 100% Profit Split"
              subtitle="Keep up to 100% of your profits with our monthly reward program"
            />
            <HighlightCard 
              icon={<ShieldCheck className="w-8 h-8" />}
              title="Secure & Transparent"
              subtitle={`Fully verified payouts, real MT5 accounts and 24/7 trader support`}
            />
          </motion.div>
        </div>
      </section>

      {/* Community Section */}
      <section className="py-24 relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            {/* Instagram Card */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="p-12 rounded-[3rem] bg-gradient-to-br from-[#833ab4] via-[#fd1d1d] to-[#fcb045] text-white relative overflow-hidden group shadow-2xl shadow-orange-500/20 text-center"
            >
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 blur-[120px] -mr-32 -mt-32 rounded-full" />
              <div className="absolute bottom-0 left-0 w-48 h-48 bg-black/10 blur-[100px] -ml-24 -mb-24 rounded-full" />
              
              <div className="relative z-10 space-y-8">
                <div className="w-20 h-20 bg-white/20 backdrop-blur-xl rounded-2xl flex items-center justify-center mx-auto mb-8 animate-float">
                  <Instagram className="w-12 h-12" />
                </div>
                <h2 className="text-4xl font-headline font-bold">Follow Us on Instagram</h2>
                <p className="text-xl text-white/80 leading-relaxed max-w-md mx-auto">
                  Get daily trading insights, funded trader stories and exclusive offers from our professional desk team.
                </p>
                <div className="pt-4">
                  <Button size="lg" className="h-16 px-12 text-lg rounded-2xl font-bold bg-white text-orange-600 hover:bg-white/90 transition-all hover:scale-105 w-full sm:w-auto" asChild>
                    <a href="https://www.instagram.com/primefunded.fund?utm_source=qr&igsh=Z2NwNmJzaHB1dXNh" target="_blank" rel="noopener noreferrer">
                      Follow @primefunded.fund <Instagram className="ml-2 w-6 h-6" />
                    </a>
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-32 relative bg-background">
        <div className="absolute top-0 left-0 w-full h-[300px] bg-gradient-to-b from-secondary/20 to-transparent -z-10" />
        
        <div className="max-w-7xl mx-auto px-4">
          <motion.div 
            {...fadeInUp}
            className="text-center mb-20"
          >
            <h2 className="text-4xl md:text-5xl font-headline font-bold mb-6">Built for Performance.</h2>
            <p className="text-muted-foreground max-xl mx-auto text-lg leading-relaxed">
              Our infrastructure is engineered by institutional traders to give you the competitive edge you need.
            </p>
          </motion.div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            <FeatureCard 
              icon={<CheckCircle2 className="text-primary w-8 h-8" />}
              title="No Consistency Rules"
              description="Trade any lot size, any day. Complete trading freedom for every individual style."
              delay={0.05}
            />
            <FeatureCard 
              icon={<Globe className="text-primary w-8 h-8" />}
              title="News Trading Allowed"
              description="Trade during NFP, FOMC, CPI and all major news events freely with no restrictions."
              delay={0.1}
            />
            <FeatureCard 
              icon={<Zap className="text-primary w-8 h-8" />}
              title="Daily Payouts"
              description="Instant Funding accounts receive daily payouts. Fast, reliable, and consistent withdrawals."
              delay={0.15}
            />
            <FeatureCard 
              icon={<BarChart3 className="text-primary w-8 h-8" />}
              title="80% Profit Split"
              description="Every trader keeps 80% of all profits generated. No tiers, no waiting, from day one."
              delay={0.2}
            />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-20 border-t border-white/5 bg-secondary/20 relative">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-12">
          <div className="flex flex-col items-center md:items-start gap-4">
            <div className="flex items-center gap-3">
              <Image 
                src={branding.logoUrl} 
                alt={branding.siteName}
                width={30}
                height={30}
                className="rounded-full"
                data-ai-hint="site logo"
              />
              <span className="font-headline font-bold text-2xl tracking-tight text-white">{branding.siteName}</span>
            </div>
            <p className="text-sm text-muted-foreground max-w-xs text-center md:text-left">
              The world&apos;s most transparent institutional funding firm for traders.
            </p>
            <div className="flex items-center gap-4 mt-2">
               {branding.discordUrl && <SocialIcon href={branding.discordUrl} icon={<DiscordIcon className="w-5 h-5" />} />}
               {branding.instagramUrl && <SocialIcon href={branding.instagramUrl} icon={<Instagram className="w-5 h-5" />} />}
               {branding.telegramUrl && <SocialIcon href={branding.telegramUrl} icon={<Send className="w-5 h-5" />} />}
               {branding.whatsappUrl && <SocialIcon href={branding.whatsappUrl} icon={<Phone className="w-5 h-5" />} />}
            </div>
          </div>
          
          <div className="flex flex-wrap justify-center gap-10 text-sm font-medium">
            <Link href="/about" className="text-muted-foreground hover:text-primary transition-colors">About Us</Link>
            <Link href="/rules" className="text-muted-foreground hover:text-primary transition-colors">Risk Disclosure</Link>
            <Link href="/support" className="text-muted-foreground hover:text-primary transition-colors">Contact Support</Link>
            <Link href="/login" className="text-muted-foreground hover:text-primary transition-colors">Client Area</Link>
          </div>
          
          <div className="flex flex-col items-center md:items-end gap-2">
            <p className="text-xs text-muted-foreground">© 2024 {branding.siteName} Global. All rights reserved.</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Built for Elite Traders</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function SocialIcon({ href, icon }: { href: string, icon: React.ReactNode }) {
  return (
    <a 
      href={href} 
      target="_blank" 
      rel="noopener noreferrer" 
      className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/50 transition-all hover:scale-110"
    >
      {icon}
    </a>
  );
}

function DiscordIcon(props: any) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993.023.03.07.039.084.028a19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.419-2.157 2.419zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.419-2.157 2.419z" />
    </svg>
  );
}

function HighlightBadge({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/5 border border-primary/20 text-xs font-bold text-primary">
      <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
      {text}
    </div>
  );
}

function HighlightCard({ title, subtitle, icon }: { title: string, subtitle: string, icon: React.ReactNode }) {
  return (
    <div className="p-8 rounded-[2.5rem] bg-white/5 backdrop-blur-md border border-white/10 hover:border-primary/50 transition-all duration-300 group flex flex-col items-center text-center hover:bg-white/10 hover:scale-[1.02]">
      <div className="mb-6 p-4 bg-primary/10 rounded-2xl w-fit border border-primary/10 group-hover:scale-110 transition-transform duration-300 text-primary">
        {icon}
      </div>
      <h3 className="text-xl font-headline font-bold text-white group-hover:text-primary transition-colors cyan-glow mb-3">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{subtitle}</p>
    </div>
  );
}

function FeatureCard({ icon, title, description, delay }: { icon: React.ReactNode, title: string, description: string, delay: number }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay }}
      className="p-10 rounded-[2.5rem] bg-secondary/30 border border-white/5 hover:border-primary/30 transition-all duration-300 hover:bg-secondary/40 relative overflow-hidden group"
    >
      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 blur-3xl rounded-full -mr-16 -mt-16 group-hover:bg-primary/10 transition-colors" />
      <div className="mb-8 p-4 bg-primary/10 rounded-2xl w-fit border border-primary/10 group-hover:scale-110 transition-transform duration-300">
        {icon}
      </div>
      <h3 className="text-2xl font-headline font-bold mb-4 text-white">{title}</h3>
      <p className="text-muted-foreground leading-relaxed">
        {description}
      </p>
    </motion.div>
  );
}
