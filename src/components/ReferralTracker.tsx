'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { validateReferralCode } from '@/lib/referral';

/**
 * @fileOverview Global Referral Detection Component
 * Captures ?ref=CODE from URL, validates against Firestore, and persists to localStorage.
 * Optimized to save the code immediately for fast redirection logic.
 */
export function ReferralTracker() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const referralCode = searchParams.get('ref');
    
    if (referralCode && referralCode.startsWith('PF')) {
      const code = referralCode.toUpperCase();
      console.log('[ReferralTracker] URL Parameter Detected:', code);
      
      // STEP 1: Immediately save to storage so redirects can read it
      localStorage.setItem('pf_referral_code', code);
      
      // STEP 2: Validate in background
      validateReferralCode(code)
        .then(referrerUid => {
          if (referrerUid) {
            console.log('[ReferralTracker] Code verified successfully.');
          } else {
            console.warn('[ReferralTracker] Code detected in URL is invalid. Removing from session.');
            localStorage.removeItem('pf_referral_code');
          }
        })
        .catch(err => {
          console.error('[ReferralTracker] Background validation failure:', err);
        });
    }
  }, [searchParams]);

  return null;
}
