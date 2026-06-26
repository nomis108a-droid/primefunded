"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * @fileOverview Terminal Route (DEPRECATED)
 * This page has been consolidated into the /demo route to provide a single source of truth.
 */

export default function TerminalPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/demo');
  }, [router]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="animate-pulse text-muted-foreground text-xs uppercase font-black tracking-widest">
        Redirecting to demo terminal...
      </div>
    </div>
  );
}
