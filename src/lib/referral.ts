
import { db } from './firebase';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  getDoc, 
  updateDoc, 
  increment, 
  serverTimestamp,
  addDoc 
} from 'firebase/firestore';

/**
 * Generates a secure, random referral ID.
 * Format: PF + 8-10 alphanumeric characters.
 * Total length: 10-12 characters.
 */
export function generateSecureReferralCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'PF';
  // Generate 8 to 10 random characters after the prefix
  const randomLength = Math.floor(Math.random() * 3) + 8; 
  for (let i = 0; i < randomLength; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Validates a referral code and returns the referrer's UID if valid.
 */
export async function validateReferralCode(code: string): Promise<string | null> {
  if (!code || code.length < 4) return null;
  
  try {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('referralCode', '==', code.toUpperCase()));
    const querySnapshot = await getDocs(q);
    
    if (!querySnapshot.empty) {
      return querySnapshot.docs[0].id;
    }
    return null;
  } catch (err) {
    console.error('Error validating referral code:', err);
    return null;
  }
}

/**
 * Processes commission for a successful challenge purchase.
 * Referrer earns 20% of the eligible challenge purchase.
 */
export async function processReferralCommission(userId: string, orderAmount: number, planType: string) {
  // Referral discount only for 1-Step, 2-Step, 3-Step (not instant)
  const isEligiblePlan = planType.includes('step');
  if (!isEligiblePlan) return;

  try {
    const userSnap = await getDoc(doc(db, 'users', userId));
    if (!userSnap.exists()) return;
    
    const userData = userSnap.data();
    const referrerId = userData.referredBy;
    
    if (!referrerId) return;

    const commissionAmount = orderAmount * 0.20;

    // 1. Update referrer stats and earnings
    const referrerRef = doc(db, 'users', referrerId);
    await updateDoc(referrerRef, {
      'referralStats.purchases': increment(1),
      'referralEarnings.pending': increment(commissionAmount),
      'referralEarnings.withdrawable': increment(commissionAmount),
      updatedAt: serverTimestamp()
    });

    // 2. Record referral event
    await addDoc(collection(db, 'referrals'), {
      referrerId,
      referredUserId: userId,
      referredUserEmail: userData.email,
      status: 'funded',
      amount: commissionAmount,
      planType,
      orderAmount,
      createdAt: serverTimestamp()
    });

    // 3. Notify Referrer
    await addDoc(collection(db, 'users', referrerId, 'notifications'), {
      title: '💰 Commission Earned!',
      message: `You earned $${commissionAmount.toFixed(2)} from a referral purchase.`,
      type: 'referral_earned',
      isRead: false,
      createdAt: serverTimestamp()
    });

  } catch (err) {
    console.error('Error processing referral commission:', err);
  }
}
