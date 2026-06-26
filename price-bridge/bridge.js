const admin = require('firebase-admin');

/**
 * @fileOverview Price Bridge Node
 * Synchronizes real-time market data from Binance (Crypto) and Twelve Data (FX/Metals)
 * into Firestore for the proprietary trading terminal.
 */

// Initialize Firebase Admin
const serviceAccountKeyB64 = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_B64;
if (!serviceAccountKeyB64) {
  console.error('FIREBASE_SERVICE_ACCOUNT_KEY_B64 is missing');
  process.exit(1);
}

const serviceAccount = JSON.parse(Buffer.from(serviceAccountKeyB64, 'base64').toString('utf-8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Configurations
const TWELVE_DATA_API_KEY = process.env.TWELVE_DATA_API_KEY;
const FX_SYMBOLS = 'EUR/USD,GBP/USD,USD/JPY,XAU/USD,XAG/USD,AUD/USD,USD/CHF';
const CRYPTO_SYMBOLS = '["BTCUSDT","ETHUSDT","XRPUSDT","SOLUSDT","BNBUSDT","DOGEUSDT","ADAUSDT"]';

let priceBuffer = new Map();
let isProcessing = false;

/**
 * Flush buffer to Firestore using atomic batch writes
 */
async function flushBuffer() {
  if (isProcessing || priceBuffer.size === 0) return;
  isProcessing = true;
  
  const batch = db.batch();
  const entries = Array.from(priceBuffer.entries());
  priceBuffer.clear();

  console.log(`[Bridge] Flushing ${entries.length} price updates...`);

  entries.forEach(([symbol, data]) => {
    const docRef = db.collection('livePrices').doc(symbol);
    batch.set(docRef, {
      ...data,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  });

  try {
    await batch.commit();
  } catch (err) {
    console.error('[Bridge] Batch commit failed:', err);
  } finally {
    isProcessing = false;
  }
}

// Flush updates every 500ms to keep Firestore overhead low while maintaining real-time feel
setInterval(flushBuffer, 500);

/**
 * Binance Crypto REST Polling
 * Frequency: Every 2 seconds
 */
async function pollBinanceCrypto() {
  try {
    const url = `https://api.binance.com/api/v3/ticker/price?symbols=${encodeURIComponent(CRYPTO_SYMBOLS)}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const data = await response.json();

    if (Array.isArray(data)) {
      data.forEach(item => {
        const price = parseFloat(item.price);
        const symbol = item.symbol.replace('USDT', 'USD');
        
        // Institutional crypto spreads (approx 0.01%)
        const bid = price * 0.9999;
        const ask = price * 1.0001;

        priceBuffer.set(symbol, {
          symbol,
          pair: symbol,
          price,
          bid,
          ask,
          source: 'binance'
        });
      });
    }
  } catch (err) {
    console.error('[Bridge] Binance Polling Failed:', err.message);
  }
}

/**
 * Twelve Data FX/Metals Polling
 * Frequency: Every 10 seconds
 */
async function pollTwelveData() {
  if (!TWELVE_DATA_API_KEY) {
    console.warn('[Bridge] TWELVE_DATA_API_KEY missing. Skipping FX/Metals.');
    return;
  }

  try {
    console.log('[Bridge] Polling Twelve Data...');
    const url = `https://api.twelvedata.com/price?symbol=${FX_SYMBOLS}&apikey=${TWELVE_DATA_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.status === 'error') {
      console.error('[Bridge] Twelve Data Error:', data.message);
      return;
    }

    Object.entries(data).forEach(([rawSymbol, entry]) => {
      const price = parseFloat(entry.price);
      if (isNaN(price)) return;

      const symbol = rawSymbol.replace('/', ''); // EUR/USD -> EURUSD
      const isMetal = symbol.includes('XAU') || symbol.includes('XAG');
      
      // Tight institutional spreads
      const spreadFactor = isMetal ? 0.001 : 0.00005;

      priceBuffer.set(symbol, {
        symbol,
        pair: symbol,
        price,
        bid: price - (price * spreadFactor),
        ask: price + (price * spreadFactor),
        source: 'twelvedata'
      });
    });
  } catch (err) {
    console.error('[Bridge] Twelve Data Polling Failed:', err.message);
  }
}

// Start polling loops
setInterval(pollBinanceCrypto, 2000);
// Restored to 10s polling for accuracy
setInterval(pollTwelveData, 10000);

// Initial execution
pollBinanceCrypto();
pollTwelveData();

console.log('[Bridge] Institutional Price Bridge Initialized.');
