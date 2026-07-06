
import { getAdminRtdb } from './firebase-admin';

/**
 * @fileOverview Shared Realtime Database Broadcast Utility
 * Provides a high-speed mechanism for pushing price updates to the RTDB path.
 * Broadcasts to both livePrices and unified market paths.
 */

export async function broadcastToRtdb(ticks: Record<string, { price: number; bid: number; ask: number }>) {
  try {
    const rtdb = getAdminRtdb();
    const updates: Record<string, any> = {};
    const now = Date.now();

    Object.entries(ticks).forEach(([symbol, data]) => {
      const payload = {
        ...data,
        updatedAt: now
      };
      
      updates[`livePrices/${symbol}`] = payload;
      updates[`market/${symbol}`] = payload;
    });

    if (Object.keys(updates).length > 0) {
      await rtdb.ref().update(updates);
    }
  } catch (err) {
    // Silent fail for background tasks to prevent process termination
  }
}
