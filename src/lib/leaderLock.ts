import { getAdminDb, isFirebaseAdminConfigured } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

/**
 * @fileOverview Firestore-based Leader Election
 * Ensures exactly one instance of the application handles background 
 * synchronization tasks, preventing race conditions in multi-instance deployments.
 */

// Generate a unique ID for this instance once at module load
const MY_INSTANCE_ID = `${process.env.K_REVISION || 'local'}-${Math.random().toString(36).slice(2)}-${Date.now()}`;
let isCurrentLeader = false;

/**
 * Attempts to acquire leadership or renew it if already held.
 * @returns true if this instance is the leader.
 */
export async function acquireOrRenewLeadership(): Promise<boolean> {
  if (!isFirebaseAdminConfigured()) return false;

  const db = getAdminDb();
  const leaderRef = db.collection('_system').doc('streamLeader');

  try {
    const snap = await leaderRef.get();
    const now = Date.now();

    if (!snap.exists) {
      // Seat is empty - claim it immediately
      await leaderRef.set({
        instanceId: MY_INSTANCE_ID,
        heartbeatAt: Timestamp.now()
      });
      return true;
    }

    const data = snap.data();
    const heartbeatAt = (data?.heartbeatAt as Timestamp).toDate().getTime();
    const currentLeaderId = data?.instanceId;

    // 1. Check if this instance is already the registered leader
    if (currentLeaderId === MY_INSTANCE_ID) {
      await leaderRef.update({
        heartbeatAt: Timestamp.now()
      });
      return true;
    }

    // 2. Check if the current leader has timed out (15 second safety window)
    if (now - heartbeatAt > 15000) {
      console.log(`[LeaderLock] Previous leader (${currentLeaderId}) timed out. Claiming leadership for ${MY_INSTANCE_ID}.`);
      await leaderRef.set({
        instanceId: MY_INSTANCE_ID,
        heartbeatAt: Timestamp.now()
      });
      return true;
    }

    // 3. Another instance is healthy and leading
    return false;
  } catch (err: any) {
    // Only log if it's not a standard unauthenticated error which we've already warned about
    if (!err.message.includes('unauthenticated') && err.code !== 16) {
      console.warn('[LeaderLock] Election interaction fault:', err.message);
    }
    return false;
  }
}

/**
 * Starts a background heartbeat that monitors and attempts to acquire leadership status.
 * Executes callbacks on state transitions.
 */
export function startLeaderHeartbeat(onBecomeLeader: () => void, onLoseLeadership?: () => void) {
  const check = async () => {
    const isLeader = await acquireOrRenewLeadership();

    if (isLeader && !isCurrentLeader) {
      console.log(`[LeaderLock] Transition: Instance ${MY_INSTANCE_ID} is now the active LEADER.`);
      isCurrentLeader = true;
      onBecomeLeader();
    } else if (!isLeader && isCurrentLeader) {
      console.warn(`[LeaderLock] Transition: Leadership lost to another instance.`);
      isCurrentLeader = false;
      if (onLoseLeadership) onLoseLeadership();
    }
  };

  // Immediate check at startup
  check();
  
  // Continuous heartbeat loop (5 seconds)
  setInterval(check, 5000);
}
