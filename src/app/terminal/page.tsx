'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * @fileOverview Terminal Route (DELETED)
 * Consolidated into /demo to maintain a single source of truth for trading logic.
 */

export default function TerminalPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/demo');
  }, [router]);

  return null;
}
