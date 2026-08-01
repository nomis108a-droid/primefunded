'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

/**
 * @fileOverview Global Referral Detection Component
 * Captures ?ref=CODE from URL and persists it to localStorage.
 */
export function ReferralTracker() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const referralCode = searchParams.get('ref');
    if (referralCode && referralCode.startsWith('PF')) {
      // Store the code for auto-application later
      localStorage.setItem('pf_referral_code', referralCode.toUpperCase());
    }
  }, [searchParams]);

  return null;
}
