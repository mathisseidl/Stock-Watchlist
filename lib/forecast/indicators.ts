/**
 * The classical technical and statistical measures the forecast is built on.
 *
 * Every function here is deliberately plain and testable: it takes a series of
 * closes (oldest first) and returns a number. The judgement about what those
 * numbers *mean* lives in `engine.ts` — this file only computes them.
 */

/** Trading days in a year. The convention every annualisation here uses. */
export const TRADING_DAYS_PER_YEAR = 252;

/** ln(pₜ / pₜ₋₁) for the whole series. Length is `closes.length - 1`. */
export function logReturns(closes: number[]): number[] {
  const out: number[] = [];
  for (let index = 1; index < closes.length; index += 1) {
    const previous = closes[index - 1];
    const current = closes[index];
    if (previous > 0 && current > 0) out.push(Math.log(current / previous));
  }
  return out;
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  let total = 0;
  for (const value of values) total += value;
  return total / values.length;
}

/** Sample standard deviation (n − 1 denominator). */
export function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const average = mean(values);
  let sum = 0;
  for (const value of values) sum += (value - average) ** 2;
  return Math.sqrt(sum / (values.length - 1));
}

/**
 * RiskMetrics EWMA volatility (λ = 0.94 for daily data).
 *
 * A flat standard deviation treats a return from three years ago as being as
 * informative as yesterday's. Exponential weighting does not, which is why it
 * reacts to a volatility regime change in days rather than months.
 */
export function ewmaVolatility(returns: number[], lambda = 0.94): number {
  if (returns.length === 0) return 0;
  // Seed with the variance of the oldest slice so the recursion starts from
  // something real rather than from the first squared return.
  const seed = returns.slice(0, Math.min(60, returns.length));
  let variance = Math.max(stdDev(seed) ** 2, 1e-12);
  for (const value of returns) {
    variance = lambda * variance + (1 - lambda) * value * value;
  }
  return Math.sqrt(variance);
}

/** Simple moving average of the last `period` closes. */
export function sma(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  let total = 0;
  for (let index = closes.length - period; index < closes.length; index += 1) {
    total += closes[index];
  }
  return total / period;
}

/** Exponential moving average series, same length as `values`. */
export function ema(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const out: number[] = [values[0]];
  for (let index = 1; index < values.length; index += 1) {
    out.push(values[index] * k + out[index - 1] * (1 - k));
  }
  return out;
}

/**
 * Wilder's RSI. 0–100; above 70 is conventionally "overbought", below 30
 * "oversold". Returns null when there isn't enough history to seed it.
 */
export function rsi(closes: number[], period = 14): number | null {
  if (closes.length <= period) return null;

  let avgGain = 0;
  let avgLoss = 0;
  for (let index = 1; index <= period; index += 1) {
    const change = closes[index] - closes[index - 1];
    if (change >= 0) avgGain += change;
    else avgLoss -= change;
  }
  avgGain /= period;
  avgLoss /= period;

  // Wilder smoothing across the remainder of the series.
  for (let index = period + 1; index < closes.length; index += 1) {
    const change = closes[index] - closes[index - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export type MacdReading = {
  macd: number;
  signal: number;
  histogram: number;
  /** Histogram as a fraction of price, so it compares across tickers. */
  normalized: number;
};

/** MACD(12, 26, 9) — the standard Appel parameters. */
export function macd(closes: number[]): MacdReading | null {
  if (closes.length < 35) return null;
  const fast = ema(closes, 12);
  const slow = ema(closes, 26);
  const line = fast.map((value, index) => value - slow[index]);
  const signalLine = ema(line, 9);

  const macdValue = line[line.length - 1];
  const signal = signalLine[signalLine.length - 1];
  const histogram = macdValue - signal;
  const price = closes[closes.length - 1];

  return {
    macd: macdValue,
    signal,
    histogram,
    normalized: price > 0 ? histogram / price : 0,
  };
}

/**
 * Jegadeesh–Titman 12−1 momentum: the return over the past twelve months
 * *excluding* the most recent one. Skipping the last month is the whole point
 * — it strips out the short-term reversal that otherwise contaminates the
 * signal.
 */
export function momentum12m1(closes: number[]): number | null {
  const skip = 21;
  const lookback = 252;
  if (closes.length < lookback + skip + 1) return null;
  const end = closes[closes.length - 1 - skip];
  const start = closes[closes.length - 1 - skip - lookback];
  if (start <= 0) return null;
  return end / start - 1;
}

/** Deepest peak-to-trough fall in the sample, as a positive fraction. */
export function maxDrawdown(closes: number[]): number {
  let peak = closes[0] ?? 0;
  let worst = 0;
  for (const close of closes) {
    if (close > peak) peak = close;
    if (peak > 0) {
      const drop = 1 - close / peak;
      if (drop > worst) worst = drop;
    }
  }
  return worst;
}

/**
 * Linear-interpolated percentile of an ALREADY SORTED ascending array.
 * `p` is a fraction, so the 5th percentile is 0.05.
 */
export function percentileSorted(sorted: ArrayLike<number>, p: number): number {
  const n = sorted.length;
  if (n === 0) return 0;
  if (n === 1) return sorted[0];
  const position = Math.min(Math.max(p, 0), 1) * (n - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

/** Historical (non-parametric) Value at Risk over the sample, as a positive loss fraction. */
export function historicalVaR(returns: number[], confidence = 0.95): number {
  if (returns.length === 0) return 0;
  const sorted = [...returns].sort((a, b) => a - b);
  const cutoff = percentileSorted(sorted, 1 - confidence);
  return Math.max(0, -cutoff);
}

/** Conditional VaR / expected shortfall: the average loss *beyond* the VaR line. */
export function conditionalVaR(returns: number[], confidence = 0.95): number {
  if (returns.length === 0) return 0;
  const sorted = [...returns].sort((a, b) => a - b);
  const count = Math.max(1, Math.floor(sorted.length * (1 - confidence)));
  let total = 0;
  for (let index = 0; index < count; index += 1) total += sorted[index];
  return Math.max(0, -(total / count));
}

export function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}
