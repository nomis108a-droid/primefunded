import { getAdminRtdb } from './firebase-admin';

/**
 * @fileOverview Shared Realtime Database Broadcast Utility
 * Provides a high-speed mechanism for pushing price updates to the RTDB path.
 */

export async function broadcastToRtdb(ticks: Record<string, { price: number; bid: number; ask: number }>) {
  try {
    const rtdb = getAdminRtdb();
    const updates: Record<string, any> = {};
    const now = Date.now();

    Object.entries(ticks).forEach(([symbol, data]) => {
      updates[`livePrices/${symbol}`] = {
        ...data,
        updatedAt: now
      };
    });

    if (Object.keys(updates).length > 0) {
      await rtdb.ref().update(updates);
    }
  } catch (err) {
    // Silent fail for background tasks to prevent process termination
  }
}
