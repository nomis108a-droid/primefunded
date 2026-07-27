
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

/**
 * @fileOverview Demo Account Monitor (LEGACY)
 * This page is deprecated. All functionality is now integrated into the 
 * main Administrative Terminal at /admin.
 */

export default function AdminDemoPage() {
  const router = useRouter();

  useEffect(() => {
    // Immediate redirection to the updated master terminal
    router.replace('/admin');
  }, [router]);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center">
      <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
      <p className="text-muted-foreground text-xs uppercase font-black tracking-widest">
        Redirecting to Master Terminal...
      </p>
    </div>
  );
}
