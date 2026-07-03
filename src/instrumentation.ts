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
    const { syncPricesAndAudit } = await import('@/lib/priceSync');
    const { startCoinbaseStream, startBnbPolling } = await import('@/lib/coinbaseStream');
    const { startOandaStream, startOandaThrottledFirestoreWrite } = await import('@/lib/oandaStream');

    let servicesStarted = false;

    // Delegate service management to the Leader Election engine
    startLeaderHeartbeat(() => {
      // CALLBACK: Executed when this instance becomes the Cluster Leader
      if (servicesStarted) {
        console.log('[Instrumentation] Leadership regained. Services already active on this node.');
        return;
      }
      
      console.log('[Instrumentation] Leadership acquired. Initializing institutional streams...');
      servicesStarted = true;

      // 1. Start Liquidity Streams
      startCoinbaseStream();
      startBnbPolling();
      startOandaStream();
      startOandaThrottledFirestoreWrite();

      // 2. Start Risk Engine Cycle (Leader only)
      // High-frequency monitoring of accounts with active market exposure
      syncPricesAndAudit().catch(e => console.error('[BackgroundSync] Initial audit failed:', e.message));
      
      setInterval(() => {
        syncPricesAndAudit().catch(e => {
          console.error('[BackgroundSync] Audit cycle failed:', e.message);
        });
      }, 2000);

      console.log('[BackgroundSync] Institutional liquidity and risk services started on LEADER instance.');
    }, () => {
      // CALLBACK: Executed if leadership is lost (e.g. cluster re-partitioning)
      console.warn('[Instrumentation] Critical Warning: Leadership lost. Instance is now in STANDBY mode.');
    });
  }
}
