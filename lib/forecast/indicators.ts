/**
 * The classical technical and statistical measures the forecast is built on.
 *
 * Every function here is deliberately plain and testable: it takes a series of
 * closes (oldest first) and returns a number. The judgement about what those
 * numbers *mean* lives in `model.ts` — this file only computes them.
 *
 * The series functions accept `ArrayLike<number>` rather than `number[]` so a
 * caller can hand them a `Float64Array.subarray()`. The walk-forward backtest
 * refits the model at dozens of points in history, and copying the return
 * series at each one would cost more than the fitting does.
 */

/** Trading days in a year. The convention every annualisation here uses. */
export const TRADING_DAYS_PER_YEAR = 252;

/** ln(pₜ / pₜ₋₁) for the whole series. Length is `closes.length - 1`. */
export function logReturns(closes: ArrayLike<number>): Float64Array {
  const out = new Float64Array(Math.max(0, closes.length - 1));
  let count = 0;
  for (let index = 1; index < closes.length; index += 1) {
    const previous = closes[index - 1];
    const current = closes[index];
    if (previous > 0 && current > 0) {
      out[count] = Math.log(current / previous);
      count += 1;
    }
  }
  return count === out.length ? out : out.subarray(0, count);
}

export function mean(values: ArrayLike<number>): number {
  if (values.length === 0) return 0;
  let total = 0;
  for (let index = 0; index < values.length; index += 1) total += values[index];
  return total / values.length;
}

/** Sample standard deviation (n − 1 denominator). */
export function stdDev(values: ArrayLike<number>): number {
  if (values.length < 2) return 0;
  const average = mean(values);
  let sum = 0;
  for (let index = 0; index < values.length; index += 1) {
    sum += (values[index] - average) ** 2;
  }
  return Math.sqrt(sum / (values.length - 1));
}

/**
 * Fisher–Pearson skewness. Negative means the left tail is the long one — the
 * usual shape for a stock, and the reason a symmetric model flatters the
 * downside.
 */
export function skewness(values: ArrayLike<number>): number {
  const n = values.length;
  if (n < 3) return 0;
  const average = mean(values);
  let m2 = 0;
  let m3 = 0;
  for (let index = 0; index < n; index += 1) {
    const d = values[index] - average;
    m2 += d * d;
    m3 += d * d * d;
  }
  m2 /= n;
  m3 /= n;
  if (m2 <= 0) return 0;
  return m3 / Math.pow(m2, 1.5);
}

/**
 * Excess kurtosis: how much fatter the tails are than a normal distribution's.
 * Zero is Gaussian. Daily equity returns typically land between 3 and 10, which
 * is the empirical fact the Student-t shocks in the simulator exist to honour.
 */
export function excessKurtosis(values: ArrayLike<number>): number {
  const n = values.length;
  if (n < 4) return 0;
  const average = mean(values);
  let m2 = 0;
  let m4 = 0;
  for (let index = 0; index < n; index += 1) {
    const d = values[index] - average;
    m2 += d * d;
    m4 += d * d * d * d;
  }
  m2 /= n;
  m4 /= n;
  if (m2 <= 0) return 0;
  return m4 / (m2 * m2) - 3;
}

export type BetaReading = {
  /** Sensitivity to the market, corrected for non-synchronous trading. */
  beta: number;
  /** The plain same-day slope, before that correction. */
  sameDayBeta: number;
  /** Same-day correlation — how much of a day's move the market explains. */
  correlation: number;
  /** Share of the stock's variance the market explains, same-day. */
  rSquared: number;
  /** Paired observations the regression actually had. */
  observations: number;
};

/** Slope, correlation and count of `asset[i]` on `market[i + offset]`. */
function regress(
  asset: ArrayLike<number>,
  market: ArrayLike<number>,
  offset: number,
): { slope: number; correlation: number; count: number } | null {
  const n = Math.min(asset.length, market.length);
  const from = Math.max(0, -offset);
  const to = Math.min(n, n - offset);

  let count = 0;
  let sumA = 0;
  let sumM = 0;
  for (let index = from; index < to; index += 1) {
    const m = market[index + offset];
    const a = asset[index];
    if (!Number.isFinite(m) || !Number.isFinite(a)) continue;
    sumA += a;
    sumM += m;
    count += 1;
  }
  if (count < 250) return null;

  const meanA = sumA / count;
  const meanM = sumM / count;
  let covariance = 0;
  let varianceA = 0;
  let varianceM = 0;
  for (let index = from; index < to; index += 1) {
    const m = market[index + offset];
    const a = asset[index];
    if (!Number.isFinite(m) || !Number.isFinite(a)) continue;
    const da = a - meanA;
    const dm = m - meanM;
    covariance += da * dm;
    varianceA += da * da;
    varianceM += dm * dm;
  }
  if (varianceA <= 0 || varianceM <= 0) return null;

  return {
    slope: covariance / varianceM,
    correlation: covariance / Math.sqrt(varianceA * varianceM),
    count,
  };
}

/** First-order autocorrelation of a series, skipping NaN pairs. */
function autocorrelation(series: ArrayLike<number>): number {
  return regress(series, series, -1)?.correlation ?? 0;
}

/**
 * Beta against a benchmark, corrected for non-synchronous trading
 * (Scholes–Williams 1977).
 *
 * `market` is index-aligned with `asset`, carrying NaN on any day the two
 * series did not both trade. Without that, a holiday mismatch would regress
 * today's stock return on yesterday's market return and hand back a beta of
 * roughly zero. Those days are skipped rather than filled.
 *
 * The plain same-day slope is still biased toward zero whenever the two
 * markets do not close at the same instant, and this app happily forecasts
 * European and Asian listings against a US index: a German close lands hours
 * before New York's, so a good deal of the stock's response to today's US
 * session only shows up in *tomorrow's* German close. Summing the lagged,
 * same-day and leading slopes and dividing by 1 + 2ρ recovers what the same-day
 * regression drops. For a US listing the two off-diagonal slopes are near zero
 * and the correction does nothing, which is exactly what it should do.
 */
export function betaTo(
  asset: ArrayLike<number>,
  market: ArrayLike<number>,
): BetaReading | null {
  const sameDay = regress(asset, market, 0);
  // Under a year of overlap the slope is too noisy to be worth preferring over
  // the volatility proxy it would be replacing.
  if (!sameDay) return null;

  const lagged = regress(asset, market, -1);
  const leading = regress(asset, market, 1);

  let beta = sameDay.slope;
  if (lagged && leading) {
    const rho = autocorrelation(market);
    const denominator = 1 + 2 * rho;
    // A market autocorrelation near −0.5 would blow the correction up; below
    // that floor the uncorrected slope is the safer answer.
    if (denominator > 0.3) {
      beta = (lagged.slope + sameDay.slope + leading.slope) / denominator;
    }
  }

  return {
    beta,
    sameDayBeta: sameDay.slope,
    correlation: sameDay.correlation,
    rSquared: sameDay.correlation * sameDay.correlation,
    observations: sameDay.count,
  };
}

/**
 * RiskMetrics EWMA volatility (λ = 0.94 for daily data).
 *
 * A flat standard deviation treats a return from three years ago as being as
 * informative as yesterday's. Exponential weighting does not, which is why it
 * reacts to a volatility regime change in days rather than months.
 */
export function ewmaVolatility(
  returns: ArrayLike<number>,
  lambda = 0.94,
): number {
  const n = returns.length;
  if (n === 0) return 0;

  // Seed with the variance of the oldest slice so the recursion starts from
  // something real rather than from the first squared return.
  const seedLength = Math.min(60, n);
  let seedMean = 0;
  for (let index = 0; index < seedLength; index += 1) seedMean += returns[index];
  seedMean /= seedLength;
  let seedVariance = 0;
  for (let index = 0; index < seedLength; index += 1) {
    seedVariance += (returns[index] - seedMean) ** 2;
  }
  seedVariance /= Math.max(1, seedLength - 1);

  let variance = Math.max(seedVariance, 1e-12);
  for (let index = 0; index < n; index += 1) {
    variance = lambda * variance + (1 - lambda) * returns[index] * returns[index];
  }
  return Math.sqrt(variance);
}

/** Simple moving average of the last `period` closes. */
export function sma(closes: ArrayLike<number>, period: number): number | null {
  if (closes.length < period) return null;
  let total = 0;
  for (let index = closes.length - period; index < closes.length; index += 1) {
    total += closes[index];
  }
  return total / period;
}

/** Exponential moving average series, same length as `values`. */
export function ema(values: ArrayLike<number>, period: number): number[] {
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
export function rsi(closes: ArrayLike<number>, period = 14): number | null {
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
export function macd(closes: ArrayLike<number>): MacdReading | null {
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
export function momentum12m1(closes: ArrayLike<number>): number | null {
  const skip = 21;
  const lookback = 252;
  if (closes.length < lookback + skip + 1) return null;
  const end = closes[closes.length - 1 - skip];
  const start = closes[closes.length - 1 - skip - lookback];
  if (start <= 0) return null;
  return end / start - 1;
}

/** Deepest peak-to-trough fall in the sample, as a positive fraction. */
export function maxDrawdown(closes: ArrayLike<number>): number {
  let peak = closes.length > 0 ? closes[0] : 0;
  let worst = 0;
  for (let index = 0; index < closes.length; index += 1) {
    const close = closes[index];
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

/** A sorted ascending copy. Typed-array `sort` is numeric by default. */
function ascending(values: ArrayLike<number>): Float64Array {
  const copy = new Float64Array(values.length);
  for (let index = 0; index < values.length; index += 1) copy[index] = values[index];
  copy.sort();
  return copy;
}

/** Historical (non-parametric) Value at Risk over the sample, as a positive loss fraction. */
export function historicalVaR(
  returns: ArrayLike<number>,
  confidence = 0.95,
): number {
  if (returns.length === 0) return 0;
  const cutoff = percentileSorted(ascending(returns), 1 - confidence);
  return Math.max(0, -cutoff);
}

/** Conditional VaR / expected shortfall: the average loss *beyond* the VaR line. */
export function conditionalVaR(
  returns: ArrayLike<number>,
  confidence = 0.95,
): number {
  if (returns.length === 0) return 0;
  const sorted = ascending(returns);
  const count = Math.max(1, Math.floor(sorted.length * (1 - confidence)));
  let total = 0;
  for (let index = 0; index < count; index += 1) total += sorted[index];
  return Math.max(0, -(total / count));
}

export function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}
