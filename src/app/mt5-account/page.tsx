"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * @fileOverview MT5 Credentials Page (REMOVED)
 * This page has been deprecated as the platform uses internal trading nodes.
 * Redirecting to the main dashboard.
 */

export default function MT5AccountPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/dashboard');
  }, [router]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="animate-pulse text-muted-foreground text-xs uppercase font-black tracking-widest">
        Redirecting to terminal...
      </div>
    </div>
  );
}