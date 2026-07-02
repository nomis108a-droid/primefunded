export const runtime = 'nodejs';

/**
 * @fileOverview Next.js Instrumentation Hook
 * Initializes background synchronization services on server startup.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // DNS preference must be inside the nodejs check to prevent Edge runtime crashes
    const dns = await import('dns');
    dns.setDefaultResultOrder('ipv4first');

    // Dynamic imports to ensure logic is only loaded in Node.js environment
    const { syncPricesAndAudit } = await import('@/lib/priceSync');
    const { startCoinbaseStream, startBnbPolling } = await import('@/lib/coinbaseStream');
    const { startOandaStream, startOandaThrottledFirestoreWrite } = await import('@/lib/oandaStream');

    /**
     * Institutional Background Liquidity Services
     */
    const initializeServices = () => {
      // 1. Initialize Real-Time Crypto Stream (Coinbase WebSocket + CoinGecko Fallback)
      startCoinbaseStream();
      startBnbPolling();

      // 2. Initialize Real-Time FX/Metals Stream (HTTP Persistence)
      startOandaStream();
      startOandaThrottledFirestoreWrite();

      // 3. Immediate Risk Audit
      syncPricesAndAudit().catch(e => console.error('[BackgroundSync] Initial audit failed:', e.message));

      // 4. Continuous 2s Risk Engine Heartbeat
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
