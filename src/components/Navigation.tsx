"use client";

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, memo, useState, useRef } from 'react';
import Image from 'next/image';
import { 
  LayoutDashboard, 
  Trophy, 
  ShieldCheck, 
  Wallet, 
  History, 
  UserCircle, 
  HelpCircle,
  LogOut,
  ChevronRight,
  Award,
  Terminal,
  BookOpen,
  Gift,
  Users,
  ArrowRight,
  Activity
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { useBrandSettings } from '@/hooks/use-brand-settings';

const navItems = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Demo Terminal', href: '/demo', icon: Activity },
  { name: 'Challenges', href: '/challenges', icon: Trophy },
  { name: 'Referral', href: '/referral', icon: Users },
  { name: 'Giveaway', href: '/giveaway', icon: Gift },
  { name: 'Accounts', href: '/accounts', icon: ShieldCheck },
  { name: 'Payouts', href: '/payouts', icon: Wallet },
  { name: 'Certificates', href: '/certificates', icon: Award },
  { name: 'History', href: '/history', icon: History },
];

const secondaryItems = [
  { name: 'Rules', href: '/rules', icon: BookOpen },
  { name: 'KYC Verification', href: '/kyc', icon: FingerprintIcon },
  { name: 'Profile', href: '/profile', icon: UserCircle },
  { name: 'Support', href: '/support', icon: HelpCircle },
];

function FingerprintIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="cursor-pointer"
    >
      <path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.02-.3 3" />
      <path d="M7 10.78c0-1.2.2-2.4.6-3.5" />
      <path d="M11 5.48a6.39 6.39 0 0 1 5 1.5" />
      <path d="M5.22 14.82a10 10 0 0 0 1.18-4.04" />
      <path d="M14 2.15a13.3 13.3 0 0 1 3.56 1.85" />
      <path d="M2 13.5a10 10 0 0 0 5 8.66" />
      <path d="M18 10.25a6.39 6.39 0 0 0-2-3.25" />
      <path d="M6 18c.35 1.1.84 2.14 1.45 3.1" />
      <path d="M20 13.5a10 10 0 0 1-5 8.66" />
      <path d="M12 22s-4-2-4-10a4 4 0 1 1 8 0c0 8-4 10-4 10Z" />
    </svg>
  )
}

function DiscordIcon(props: any) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993.023.03.07.039.084.028a19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.419-2.157 2.419zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.419-2.157 2.419z" />
    </svg>
  );
}

export const Navigation = memo(function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const { logout, userData } = useAuth();
  const branding = useBrandSettings();

  const [clickCount, setClickCount] = useState(0);
  const [clickTimer, setClickTimer] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const routesToPrefetch = [
      '/dashboard',
      '/demo',
      '/challenges',
      '/referral',
      '/profile',
      '/payouts',
      '/accounts'
    ];
    routesToPrefetch.forEach(route => {
      router.prefetch(route);
    });
  }, [router]);

  return (
    <div className="w-64 bg-card border-r border-border h-screen sticky top-0 flex flex-col p-6 overflow-y-auto shrink-0 custom-scrollbar">
      <div 
        onClick={() => {
          setClickCount(prev => {
            const newCount = prev + 1;
            if (clickTimer) clearTimeout(clickTimer);
            const timer = setTimeout(() => setClickCount(0), 3000);
            setClickTimer(timer);
            if (newCount >= 5) {
              setClickCount(0);
              if (clickTimer) clearTimeout(clickTimer);
              window.location.href = '/admin';
            }
            return newCount;
          });
        }}
        className="flex items-center gap-3 mb-10 px-2 cursor-pointer transition-opacity hover:opacity-80"
      >
        <Image 
          src={branding.logoUrl} 
          alt={branding.siteName}
          width={40}
          height={40}
          className="rounded-full border border-primary/20"
          data-ai-hint="site logo"
        />
        <span className="font-headline font-bold text-xl tracking-tight text-white">{branding.siteName}</span>
      </div>

      <nav className="flex-1 space-y-1">
        {navItems.map((item) => (
          <Link
            key={item.name}
            href={item.href}
            prefetch={true}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all cursor-pointer",
              pathname === item.href 
                ? "bg-primary/10 text-primary border-r-2 border-primary rounded-r-none" 
                : "text-muted-foreground hover:text-foreground hover:bg-secondary"
            )}
          >
            <item.icon className="w-5 h-5" />
            {item.name}
          </Link>
        ))}
      </nav>

      <div className="mt-8 pt-8 border-t border-border space-y-4">
        {branding.discordUrl && (
          <a 
            href={branding.discordUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            className="block p-4 rounded-xl bg-[#5865F2]/10 border border-[#5865F2]/20 hover:bg-[#5865F2]/20 transition-all group"
          >
            <div className="flex items-center gap-3 mb-1.5">
              <div className="w-8 h-8 rounded-lg bg-[#5865F2] flex items-center justify-center text-white">
                <DiscordIcon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase text-[#5865F2] tracking-widest">Community</p>
                <p className="text-xs font-bold text-white">Discord Terminal</p>
              </div>
            </div>
            <p className="text-[9px] text-muted-foreground mb-3 leading-tight">Connect with 1,000+ elite traders for insights.</p>
            <div className="flex items-center justify-between text-[10px] font-bold text-[#5865F2] uppercase tracking-widest">
              Join Now <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
            </div>
          </a>
        )}

        <div className="space-y-1">
          <p className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Account</p>
          {secondaryItems.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              prefetch={true}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all cursor-pointer",
                pathname === item.href 
                  ? "bg-primary/10 text-primary border-r-2 border-primary rounded-r-none" 
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              )}
            >
              <item.icon className="w-5 h-5" />
              {item.name}
            </Link>
          ))}
          
          <button
            onClick={() => {
              logout();
            }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors mt-4 cursor-pointer"
          >
            <LogOut className="w-5 h-5" />
            Logout
          </button>
        </div>
      </div>

      <div className="mt-auto bg-secondary/50 rounded-xl p-4 border border-border">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden">
             {userData?.photoURL ? (
               <Image src={userData.photoURL} alt="Avatar" width={40} height={40} className="object-cover" />
             ) : (
               <UserCircle className="text-primary w-6 h-6" />
             )}
          </div>
          <div className="overflow-hidden">
            <p className="text-sm font-semibold truncate text-white">{userData?.name || 'Trader'}</p>
            <p className="text-xs text-muted-foreground truncate">{userData?.tier || 'Bronze Tier'}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="w-full text-xs cursor-pointer" asChild>
          <Link href="/challenges">Upgrade Plan <ChevronRight className="w-3 h-3 ml-1" /></Link>
        </Button>
      </div>
    </div>
  );
});