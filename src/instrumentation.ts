/**
 * @fileOverview Next.js Instrumentation Hook
 * Initializes background synchronization services on server startup.
 * Wrapped in a leadership election to ensure exactly one responsible instance 
 * in multi-node environments.
 */

export async function register() {
  // Guard: Only run background tasks in the Node.js runtime (not Edge)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Unblock the main startup thread to allow the server to report "Ready" faster
    // Deferring all heavy imports and service starts
    setTimeout(async () => {
      try {
        const dns = await import('dns');
        dns.setDefaultResultOrder('ipv4first');

        const { startLeaderHeartbeat } = await import('@/lib/leaderLock');
        const { syncPricesAndAudit, startGlobalPriceSync } = await import('@/lib/priceSync');
        const { startCoinbaseStream, startBnbPolling } = await import('@/lib/coinbaseStream');
        const { startOandaStream, startOandaThrottledFirestoreWrite } = await import('@/lib/oandaStream');
        const { getAdminServices } = await import('@/lib/firebase-admin');

        let leaderServicesStarted = false;

        // Resilient Startup Loop: Retries until Firebase Admin is ready
        const initInterval = setInterval(() => {
          const services = getAdminServices();
          if (!services) {
            console.warn('[Instrumentation] Waiting for Firebase Admin credentials...');
            return;
          }
          
          clearInterval(initInterval);
          console.log('[Instrumentation] Initializing background tasks...');

          // 1. Start Global Listener (All Instances)
          startGlobalPriceSync();

          // 2. Delegate Master services to Leader Election
          startLeaderHeartbeat(() => {
            if (leaderServicesStarted) return;
            
            console.log('[Instrumentation] Leadership acquired. Starting master fetchers...');
            leaderServicesStarted = true;

            if (process.env.OANDA_API_KEY && process.env.OANDA_ACCOUNT_ID) {
              startOandaStream();
              startOandaThrottledFirestoreWrite();
            }

            startCoinbaseStream();
            startBnbPolling();

            // Periodic risk audit loop
            setInterval(() => {
              syncPricesAndAudit().catch(() => {});
            }, 5000);
          }, () => {
            leaderServicesStarted = false;
          });
        }, 5000);

      } catch (err: any) {
        console.error('[Instrumentation] Fatal Registry Fault:', err.message);
      }
    }, 500); // 500ms delay to ensure main loop is free
  }
}
