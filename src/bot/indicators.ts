/**
 * Technical Indicators for VN100 Bot.
 * Formulas are calibrated to match TradingView exactly.
 */

/**
 * Wilder's smoothing (equivalent to ta.rma in TradingView).
 * Critical: The first value is seeded using the SMA of the first `period` elements,
 * and then smoothed recursively.
 */
export function rma(values: number[], period: number): (number | null)[] {
  const n = values.length;
  const out: (number | null)[] = new Array(n).fill(null);

  // Find first non-NaN/valid numbers
  let validStart = -1;
  for (let i = 0; i < n; i++) {
    if (!Number.isNaN(values[i]) && values[i] !== null && values[i] !== undefined) {
      validStart = i;
      break;
    }
  }

  if (validStart === -1 || n - validStart < period) {
    return out;
  }

  // Seed with SMA
  let sum = 0;
  for (let i = validStart; i < validStart + period; i++) {
    sum += values[i];
  }
  let acc = sum / period;
  out[validStart + period - 1] = acc;

  for (let i = validStart + period; i < n; i++) {
    acc = (acc * (period - 1) + values[i]) / period;
    out[i] = acc;
  }

  return out;
}

/**
 * RSI(period) using Wilder's RMA — matches TradingView.
 */
export function calculateRsi(close: number[], period: number = 14): (number | null)[] {
  const n = close.length;
  const out: (number | null)[] = new Array(n).fill(null);
  if (n < period + 1) return out;

  const gain: number[] = new Array(n).fill(0);
  const loss: number[] = new Array(n).fill(0);

  for (let i = 1; i < n; i++) {
    const diff = close[i] - close[i - 1];
    if (diff > 0) gain[i] = diff;
    else if (diff < 0) loss[i] = -diff;
  }

  const avgGain = rma(gain, period);
  const avgLoss = rma(loss, period);

  for (let i = 0; i < n; i++) {
    const ag = avgGain[i];
    const al = avgLoss[i];
    if (ag === null || al === null) {
      out[i] = null;
      continue;
    }
    if (al === 0) {
      out[i] = 100.0;
    } else {
      out[i] = 100.0 - 100.0 / (1.0 + ag / al);
    }
  }

  return out;
}

/**
 * Bollinger Bands calculation: middle, upper, lower. ddof = 0 (population stddev).
 */
export function calculateBollinger(
  close: number[],
  period: number = 20,
  numStd: number = 2.0
): { middle: (number | null)[]; upper: (number | null)[]; lower: (number | null)[] } {
  const n = close.length;
  const middle: (number | null)[] = new Array(n).fill(null);
  const upper: (number | null)[] = new Array(n).fill(null);
  const lower: (number | null)[] = new Array(n).fill(null);

  for (let i = period - 1; i < n; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sum += close[j];
    }
    const mean = sum / period;

    let varianceSum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const diff = close[j] - mean;
      varianceSum += diff * diff;
    }
    const std = Math.sqrt(varianceSum / period); // ddof = 0

    middle[i] = mean;
    upper[i] = mean + numStd * std;
    lower[i] = mean - numStd * std;
  }

  return { middle, upper, lower };
}

/**
 * Simple Moving Average (SMA)
 */
export function calculateSma(close: number[], period: number = 50): (number | null)[] {
  const n = close.length;
  const out: (number | null)[] = new Array(n).fill(null);

  for (let i = period - 1; i < n; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sum += close[j];
    }
    out[i] = sum / period;
  }

  return out;
}

export function isCrossedAbove(series: (number | null)[], level: number): boolean {
  if (series.length < 2) return false;
  const prev = series[series.length - 2];
  const cur = series[series.length - 1];
  return prev !== null && cur !== null && prev < level && cur >= level;
}

export function isCrossedBelow(series: (number | null)[], level: number): boolean {
  if (series.length < 2) return false;
  const prev = series[series.length - 2];
  const cur = series[series.length - 1];
  return prev !== null && cur !== null && prev > level && cur <= level;
}
