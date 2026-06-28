/**
 * @fileOverview Institutional Technical Indicator Engine
 * Pure math functions for calculating trading indicators from candle data.
 */

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export function calculateSMA(data: number[], period: number) {
  const sma = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      sma.push(null);
      continue;
    }
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += data[i - j];
    }
    sma.push(sum / period);
  }
  return sma;
}

export function calculateEMA(data: number[], period: number) {
  const ema = [];
  const k = 2 / (period + 1);
  let previousEma = data[0];
  
  for (let i = 0; i < data.length; i++) {
    if (i === 0) {
      ema.push(previousEma);
      continue;
    }
    const currentEma = (data[i] - previousEma) * k + previousEma;
    ema.push(currentEma);
    previousEma = currentEma;
  }
  return ema;
}

export function calculateRSI(data: number[], period: number = 14) {
  const rsi = [];
  let gains = 0;
  let losses = 0;

  for (let i = 1; i < data.length; i++) {
    const diff = data[i] - data[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;

    if (i <= period) {
      gains += gain;
      losses += loss;
      if (i === period) {
        let avgGain = gains / period;
        let avgLoss = losses / period;
        let rs = avgGain / (avgLoss || 1);
        rsi.push(100 - (100 / (1 + rs)));
      } else {
        rsi.push(null);
      }
    } else {
      let avgGain = (rsi[rsi.length - 1] ? (gains * (period - 1) + gain) / period : gains / period);
      // Simple smoothing approximation for RSI
      const currentGain = gain;
      const currentLoss = loss;
      // Recalculate properly using previous smoothed values
      // Note: This is a simplified version for high-performance client-side calc
      const lastRsi = rsi[rsi.length - 1];
      rsi.push(lastRsi); // Placeholder for actual smoothed RSI logic
    }
  }
  
  // Real implementation for RSI smoothing
  const results = new Array(data.length).fill(null);
  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 1; i < data.length; i++) {
    const change = data[i] - data[i - 1];
    let gain = change > 0 ? change : 0;
    let loss = change < 0 ? -change : 0;

    if (i <= period) {
      avgGain += gain / period;
      avgLoss += loss / period;
      if (i === period) {
        results[i] = 100 - (100 / (1 + (avgGain / (avgLoss || 0.00001))));
      }
    } else {
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
      results[i] = 100 - (100 / (1 + (avgGain / (avgLoss || 0.00001))));
    }
  }
  return results;
}

export function calculateBollingerBands(data: number[], period: number = 20, stdDev: number = 2) {
  const upper = [];
  const lower = [];
  const middle = [];

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      upper.push(null);
      lower.push(null);
      middle.push(null);
      continue;
    }

    const slice = data.slice(i - period + 1, i + 1);
    const avg = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / period;
    const sd = Math.sqrt(variance);

    middle.push(avg);
    upper.push(avg + (sd * stdDev));
    lower.push(avg - (sd * stdDev));
  }
  return { upper, lower, middle };
}

export function calculateMACD(data: number[], fast: number = 12, slow: number = 26, signal: number = 9) {
  const fastEMA = calculateEMA(data, fast);
  const slowEMA = calculateEMA(data, slow);
  const macdLine = fastEMA.map((f, i) => (f !== null && slowEMA[i] !== null) ? f - slowEMA[i] : null);
  
  // Filter nulls for signal calculation
  const validMacd = macdLine.filter(m => m !== null) as number[];
  const signalEMA = calculateEMA(validMacd, signal);
  
  // Re-align signal with full data length
  const signalLine = new Array(data.length).fill(null);
  const offset = data.length - signalEMA.length;
  for (let i = 0; i < signalEMA.length; i++) {
    signalLine[i + offset] = signalEMA[i];
  }

  const histogram = macdLine.map((m, i) => (m !== null && signalLine[i] !== null) ? m - signalLine[i] : null);

  return { macdLine, signalLine, histogram };
}

export function calculateATR(candles: Candle[], period: number = 14) {
  const tr = [candles[0].high - candles[0].low];
  for (let i = 1; i < candles.length; i++) {
    const hl = candles[i].high - candles[i].low;
    const hpc = Math.abs(candles[i].high - candles[i - 1].close);
    const lpc = Math.abs(candles[i].low - candles[i - 1].close);
    tr.push(Math.max(hl, hpc, lpc));
  }

  const atr = new Array(candles.length).fill(null);
  let sumTr = 0;
  for (let i = 0; i < tr.length; i++) {
    if (i < period) {
      sumTr += tr[i];
      if (i === period - 1) atr[i] = sumTr / period;
    } else {
      atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period;
    }
  }
  return atr;
}
