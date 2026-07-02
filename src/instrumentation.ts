/**
 * @fileOverview Next.js Instrumentation Hook
 * Initializes the background price synchronization loop on server startup.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Dynamic import to ensure priceSync logic is only loaded in Node.js environment
    const { syncPricesAndAudit } = await import('@/lib/priceSync');

    /**
     * Institutional Background Sync Heartbeat
     * Maintains a 2-second update frequency for market liquidity and risk auditing.
     */
    const startBackgroundLoop = () => {
      // 1. Immediate execution on boot
      syncPricesAndAudit().catch(e => console.error('[BackgroundSync] Initial execution failed:', e.message));

      // 2. Continuous 2s loop
      setInterval(() => {
        syncPricesAndAudit().catch(e => {
          // Log errors but do not crash the server process
          console.error('[BackgroundSync] cycle failed:', e.message);
        });
      }, 2000);

      console.log('[BackgroundSync] Institutional 2s price heartbeat initialized.');
    };

    startBackgroundLoop();
  }
}
