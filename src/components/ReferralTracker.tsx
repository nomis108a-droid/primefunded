'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { validateReferralCode } from '@/lib/referral';

/**
 * @fileOverview Global Referral Detection Component
 * Captures ?ref=CODE from URL, validates against Firestore, and persists to localStorage.
 */
export function ReferralTracker() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const referralCode = searchParams.get('ref');
    
    if (referralCode && referralCode.startsWith('PF')) {
      const code = referralCode.toUpperCase();
      console.log('[ReferralTracker] URL Parameter Detected:', code);
      
      // Immediate validation check to prevent storing invalid codes
      validateReferralCode(code)
        .then(referrerUid => {
          if (referrerUid) {
            console.log('[ReferralTracker] Code verified successfully. Storing in session.');
            localStorage.setItem('pf_referral_code', code);
          } else {
            console.warn('[ReferralTracker] Code detected in URL is invalid or does not exist.');
          }
        })
        .catch(err => {
          console.error('[ReferralTracker] Background validation failure:', err);
        });
    }
  }, [searchParams]);

  return null;
}
