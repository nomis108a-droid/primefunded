
const WebSocket = require('ws');
const admin = require('firebase-admin');

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
const BINANCE_STREAMS = 'btcusdt@trade/ethusdt@trade/xrpusdt@trade/solusdt@trade/bnbusdt@trade/dogeusdt@trade';

let priceBuffer = new Map();
let isProcessing = false;

/**
 * Flush buffer to Firestore
 */
async function flushBuffer() {
  if (isProcessing || priceBuffer.size === 0) return;
  isProcessing = true;
  
  const batch = db.batch();
  const entries = Array.from(priceBuffer.entries());
  priceBuffer.clear();

  console.log(`Flushing ${entries.length} price updates...`);

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
    console.error('Batch commit failed:', err);
  } finally {
    isProcessing = false;
  }
}

// Periodically flush updates (every 500ms)
setInterval(flushBuffer, 500);

/**
 * Binance WebSocket Connection
 */
function connectBinance() {
  console.log('Connecting to Binance WebSocket...');
  const ws = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${BINANCE_STREAMS}`);

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.data && msg.data.s) {
        const binanceSymbol = msg.data.s; // e.g. BTCUSDT
        const price = parseFloat(msg.data.p);
        const symbol = binanceSymbol.replace('USDT', 'USD');
        
        // Use tight crypto spreads
        const spread = 0.0001; 
        priceBuffer.set(symbol, {
          symbol,
          pair: symbol,
          price,
          bid: price - (price * spread),
          ask: price + (price * spread),
          source: 'binance'
        });
      }
    } catch (e) {
      console.error('Binance parse error:', e);
    }
  });

  ws.on('ping', () => ws.pong());
  
  ws.on('error', (err) => console.error('Binance WS Error:', err));
  
  ws.on('close', () => {
    console.log('Binance WS closed. Reconnecting in 3s...');
    setTimeout(connectBinance, 3000);
  });
}

/**
 * Twelve Data Polling
 */
async function pollTwelveData() {
  if (!TWELVE_DATA_API_KEY) {
    console.warn('TWELVE_DATA_API_KEY missing. Skipping FX/Metals polling.');
    return;
  }

  try {
    const url = `https://api.twelvedata.com/price?symbol=${FX_SYMBOLS}&apikey=${TWELVE_DATA_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.status === 'error') {
      console.error('Twelve Data Error:', data.message);
      return;
    }

    Object.entries(data).forEach(([rawSymbol, entry]) => {
      const price = parseFloat(entry.price);
      if (isNaN(price)) return;

      const symbol = rawSymbol.replace('/', ''); // EUR/USD -> EURUSD
      const isMetal = symbol.includes('XAU') || symbol.includes('XAG');
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
    console.error('Twelve Data Polling Failed:', err);
  }
}

// Initialize feeds
connectBinance();
setInterval(pollTwelveData, 5000);
pollTwelveData();

console.log('Price Bridge Node Initialized.');
