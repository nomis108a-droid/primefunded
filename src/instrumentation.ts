/**
 * @fileOverview Next.js Instrumentation Hook
 * Initializes background synchronization services on server startup.
 * Wrapped in a leadership election to ensure exactly one responsible instance 
 * in multi-node environments.
 */

export async function register() {
  // Guard: Only run background tasks in the Node.js runtime (not Edge)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const dns = await import('dns');
    dns.setDefaultResultOrder('ipv4first');

    // Dynamic imports for leadership and streaming modules
    const { startLeaderHeartbeat } = await import('@/lib/leaderLock');
    const { syncPricesAndAudit, startGlobalPriceSync } = await import('@/lib/priceSync');
    const { startCoinbaseStream, startBnbPolling } = await import('@/lib/coinbaseStream');
    const { startOandaStream, startOandaThrottledFirestoreWrite } = await import('@/lib/oandaStream');
    const { isFirebaseAdminConfigured } = await import('@/lib/firebase-admin');

    if (!isFirebaseAdminConfigured()) {
      console.warn('[Instrumentation] Firebase Admin is NOT fully configured. Background synchronization services will be suspended.');
      return;
    }

    // 1. Start Global Listener (All Instances)
    // This ensures every server node has a local memory buffer of the latest prices
    // so that SSE streams are always fast and populated.
    startGlobalPriceSync();

    let leaderServicesStarted = false;

    // 2. Delegate service management to the Leader Election engine
    startLeaderHeartbeat(() => {
      // CALLBACK: Executed when this instance becomes the Cluster Leader
      if (leaderServicesStarted) {
        console.log('[Instrumentation] Leadership regained. Services already active on this node.');
        return;
      }
      
      console.log('[Instrumentation] Leadership acquired. Initializing institutional fetchers...');
      leaderServicesStarted = true;

      // 1. Start Liquidity Streams (Leader only)
      if (process.env.OANDA_API_KEY && process.env.OANDA_ACCOUNT_ID) {
        startOandaStream();
        startOandaThrottledFirestoreWrite();
      }

      startCoinbaseStream();
      startBnbPolling();

      // 2. Start Risk Engine Cycle (Leader only, 2s frequency)
      const auditInterval = setInterval(() => {
        syncPricesAndAudit().catch(e => {
          if (e.message.includes('unauthenticated') || e.code === 16) {
            console.error('[BackgroundSync] Terminating audit loop due to authentication failure.');
            clearInterval(auditInterval);
          }
        });
      }, 2000);

      console.log('[BackgroundSync] Institutional liquidity and risk fetchers started on LEADER instance.');
    }, () => {
      // CALLBACK: Executed if leadership is lost
      console.warn('[Instrumentation] Instance switched to STANDBY mode.');
    });
  }
}
