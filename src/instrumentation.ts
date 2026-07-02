/**
 * @fileOverview Next.js Instrumentation Hook
 * Initializes background synchronization services on server startup.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const dns = await import('dns');
    dns.setDefaultResultOrder('ipv4first');

    const { syncPricesAndAudit } = await import('@/lib/priceSync');
    const { startCoinbaseStream, startBnbPolling } = await import('@/lib/coinbaseStream');
    const { startOandaStream, startOandaThrottledFirestoreWrite } = await import('@/lib/oandaStream');

    const initializeServices = () => {
      startCoinbaseStream();
      startBnbPolling();
      startOandaStream();
      startOandaThrottledFirestoreWrite();
      syncPricesAndAudit().catch(e => console.error('[BackgroundSync] Initial audit failed:', e.message));
      setInterval(() => {
        syncPricesAndAudit().catch(e => {
          console.error('[BackgroundSync] Audit cycle failed:', e.message);
        });
      }, 2000);
      console.log('[BackgroundSync] Institutional liquidity and risk services started.');
    };

    initializeServices();
  }
}
