/**
 * @fileOverview Next.js Instrumentation Hook
 * Initializes background synchronization services on server startup.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Dynamic imports to ensure logic is only loaded in Node.js environment
    const { syncPricesAndAudit } = await import('@/lib/priceSync');
    const { startBinanceStream, startThrottledFirestoreWrite } = await import('@/lib/binanceStream');

    /**
     * Institutional Background Liquidity Services
     */
    const initializeServices = () => {
      // 1. Initialize Real-Time Crypto Stream
      startBinanceStream();
      startThrottledFirestoreWrite();

      // 2. Immediate Risk & FX Audit
      syncPricesAndAudit().catch(e => console.error('[BackgroundSync] Initial audit failed:', e.message));

      // 3. Continuous 2s Risk & FX Heartbeat
      setInterval(() => {
        syncPricesAndAudit().catch(e => {
          // Log errors but do not crash the server process
          console.error('[BackgroundSync] Audit cycle failed:', e.message);
        });
      }, 2000);

      console.log('[BackgroundSync] Institutional liquidity and risk services started.');
    };

    initializeServices();
  }
}
