/**
 * The forecast engine.
 *
 * What this is: a probability distribution over where a price could end up,
 * built from the stock's own measured drift and volatility and simulated
 * tens of thousands of times. What it is not: a prediction. Nobody can predict
 * a price. The honest product is the *shape* of the distribution — how wide
 * the good and bad tails are, and how much of the distribution sits above
 * break-even — and that is what every number below describes.
 *
 * Two independent simulators run and their results are pooled:
 *
 *   1. Geometric Brownian Motion with Student-t shocks. The textbook price
 *      model, but with fat-tailed innovations instead of Gaussian ones,
 *      because real markets produce far more six-sigma days than a normal
 *      distribution allows.
 *   2. A stationary block bootstrap over the stock's actual historical
 *      returns. This makes no distributional assumption at all — it replays
 *      real return sequences in blocks, so genuine volatility clustering and
 *      skew survive into the simulation.
 *
 * Pooling them means neither model's blind spot decides the answer alone.
 */

import { fetchDailyHistory } from "./history";
import { FORECAST_METHODS } from "./methods";
import {
  TRADING_DAYS_PER_YEAR,
  clamp,
  conditionalVaR,
  ewmaVolatility,
  historicalVaR,
  logReturns,
  macd,
  maxDrawdown,
  mean,
  momentum12m1,
  percentileSorted,
  rsi,
  sma,
  stdDev,
} from "./indicators";

/** Longest horizon we'll simulate. Beyond a decade the bands are meaningless. */
export const MAX_HORIZON_DAYS = 3653; // ~10 years
export const MIN_HORIZON_DAYS = 7;

/**
 * The prior every stock's own measured drift is pulled towards, built the way
 * CAPM builds an expected return: a risk-free anchor plus a premium for how
 * much market risk the stock carries.
 *
 * A single flat prior for every ticker would be worse than it looks — it would
 * quietly say a stock with 80% volatility deserves the same expected return as
 * a utility, which after the variance drag below implies a catastrophic median
 * for anything risky. Scaling the premium with volatility avoids punishing a
 * stock twice for the same risk.
 *
 * Volatility is only a proxy for beta — it counts idiosyncratic risk the market
 * does not actually pay for — so the multiple is capped rather than trusted at
 * face value.
 */
const RISK_FREE_RATE = 0.04;
const EQUITY_RISK_PREMIUM = 0.045;
/** Long-run volatility of the broad market, the yardstick for the beta proxy. */
const MARKET_VOLATILITY = 0.16;
const MIN_BETA_PROXY = 0.5;
const MAX_BETA_PROXY = 2.5;

/**
 * How far true expected returns actually spread across stocks. Small, because
 * almost all of the variation you see in realised returns is noise rather than
 * a difference in underlying expectation. This is the number that makes the
 * shrinkage below aggressive, and it is the single most important guard
 * against extrapolating a lucky three-year run into a decade.
 */
const PRIOR_DRIFT_SPREAD = 0.06;

export type ForecastOutcome = {
  /** Simulated price at the horizon. */
  price: number;
  /** What the user's stake would be worth. */
  value: number;
  /** Money made or lost against the stake. */
  profit: number;
  /** Total return over the whole horizon, in percent. */
  returnPercent: number;
  /** The same return expressed per year, for comparing horizons. */
  annualizedPercent: number;
};

export type ForecastDrivers = {
  annualDriftPercent: number;
  annualVolatilityPercent: number;
  rsi: number | null;
  macdHistogram: number | null;
  momentum12m1Percent: number | null;
  gapToSma200Percent: number | null;
  maxDrawdownPercent: number;
  dailyVaR95Percent: number;
  dailyCVaR95Percent: number;
};

/** One column of the outcome histogram. */
export type ForecastBucket = {
  /** Price at the left edge of the bucket. */
  from: number;
  to: number;
  /** Share of all runs that landed inside it, 0–1. */
  share: number;
};

/**
 * What the same money does sitting in cash at the risk-free rate — the honest
 * comparison, because "will it go up" is the wrong question when a savings
 * account also goes up. The question is whether the risk bought anything.
 */
export type ForecastCashComparison = {
  annualRatePercent: number;
  /** What the stake grows to in cash over the same horizon. */
  value: number;
  /** Share of runs that finished ahead of that, in percent. */
  probabilityOfBeating: number;
};

/**
 * How rough the ride was, not just where it ended.
 *
 * A forecast that only reports the destination hides the thing that actually
 * makes people sell at the bottom: the drop along the way. These are the
 * deepest peak-to-trough falls *within* each simulated path.
 */
export type ForecastJourney = {
  /** Median path's worst dip, as a positive percent. */
  medianDipPercent: number;
  /** The dip a rough run gets — 90th percentile of path drawdowns. */
  roughDipPercent: number;
};

export type ForecastResult = {
  symbol: string;
  name: string;
  /** Price the simulation started from. */
  price: number;
  amount: number;
  horizonDays: number;
  tradingDays: number;
  targetDate: string;
  generatedAt: string;
  /** 90th percentile — a good run, not a fantasy one. */
  best: ForecastOutcome;
  /** The middle of the distribution. */
  likely: ForecastOutcome;
  /** 10th percentile — a bad run that is entirely normal. */
  worst: ForecastOutcome;
  /** 5th percentile — the one-in-twenty stress case. */
  stress: ForecastOutcome;
  /** The mean of every run. Sits above the median; the gap is volatility drag. */
  expected: ForecastOutcome;
  /** Share of simulations that finish above the money you put in. */
  probabilityOfProfit: number;
  /**
   * Terminal price at every whole percentile, p0 … p100 (101 entries, rising).
   *
   * This is what lets the page answer "what are the odds of at least $X?" for
   * any X the reader drags to, instantly and without another simulation — the
   * ladder inverts to a probability by interpolation.
   */
  percentiles: number[];
  /** The shape of the whole outcome distribution, for the histogram. */
  distribution: ForecastBucket[];
  cash: ForecastCashComparison;
  journey: ForecastJourney;
  simulations: number;
  historyDays: number;
  drivers: ForecastDrivers;
  methods: string[];
};

/* ------------------------------------------------------------------ */
/* Randomness                                                          */
/* ------------------------------------------------------------------ */

/**
 * Seeded PRNG (mulberry32). Deterministic on purpose: asking for the same
 * stock and horizon twice on the same day must give the same answer, or the
 * feature reads as a slot machine rather than an analysis.
 */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFrom(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Box–Muller. One call, one standard normal — the spare half is discarded. */
function standardNormal(random: () => number): number {
  let u = random();
  if (u < 1e-12) u = 1e-12;
  const v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const T_DF = 4;
/** Var(t_ν) = ν/(ν−2), so dividing by this gives unit variance. */
const T_SCALE = Math.sqrt(T_DF / (T_DF - 2));

/**
 * Standardised Student-t shock with 4 degrees of freedom.
 *
 * A χ²₄ variate is −2(ln U₁ + ln U₂), which makes the usual Z / √(χ²_ν/ν)
 * construction cheap enough to run fifty million times.
 */
function studentT(random: () => number): number {
  let u1 = random();
  let u2 = random();
  if (u1 < 1e-12) u1 = 1e-12;
  if (u2 < 1e-12) u2 = 1e-12;
  const chiSquare = -2 * (Math.log(u1) + Math.log(u2));
  const z = standardNormal(random);
  return z / Math.sqrt(chiSquare / T_DF) / T_SCALE;
}

/* ------------------------------------------------------------------ */
/* Engine                                                              */
/* ------------------------------------------------------------------ */

function outcome(
  price: number,
  entryPrice: number,
  amount: number,
  years: number,
): ForecastOutcome {
  const shares = entryPrice > 0 ? amount / entryPrice : 0;
  const value = shares * price;
  const profit = value - amount;
  const returnPercent = amount > 0 ? (profit / amount) * 100 : 0;
  const growth = amount > 0 ? value / amount : 1;
  const annualizedPercent =
    years > 0 && growth > 0 ? (Math.pow(growth, 1 / years) - 1) * 100 : 0;
  return { price, value, profit, returnPercent, annualizedPercent };
}

export type ForecastRequest = {
  symbol: string;
  name?: string;
  amount: number;
  /** Calendar days from today to the date the user picked. */
  horizonDays: number;
};

export class NotEnoughHistoryError extends Error {
  constructor(symbol: string) {
    super(`Not enough price history to model ${symbol}.`);
    this.name = "NotEnoughHistoryError";
  }
}

export async function buildForecast(
  request: ForecastRequest,
): Promise<ForecastResult> {
  const symbol = request.symbol.toUpperCase();
  const horizonDays = Math.round(
    clamp(request.horizonDays, MIN_HORIZON_DAYS, MAX_HORIZON_DAYS),
  );
  const amount = Math.max(1, request.amount);

  const history = await fetchDailyHistory(symbol, "5y");
  // Under a year of daily closes there is no volatility estimate worth
  // simulating, and a made-up band is worse than no band.
  if (history.length < 200) throw new NotEnoughHistoryError(symbol);

  const { closes } = history;
  const entryPrice = history.price > 0 ? history.price : closes[closes.length - 1];
  const returns = logReturns(closes);
  const yearsOfData = returns.length / TRADING_DAYS_PER_YEAR;

  /* --- Volatility ------------------------------------------------- */

  // EWMA carries today's regime; the full-sample deviation stops one quiet
  // fortnight from convincing the model that risk has gone away. 70/30 keeps
  // the reactivity without the amnesia.
  const dailyVol =
    0.7 * ewmaVolatility(returns) + 0.3 * stdDev(returns);
  const annualVol = dailyVol * Math.sqrt(TRADING_DAYS_PER_YEAR);

  /* --- Drift ------------------------------------------------------ */

  // Everything from here on is an *arithmetic* annual drift µ, the expected
  // return before compounding. The mean of log returns estimates µ − σ²/2, so
  // the variance term is added back here — the simulation subtracts it again
  // as the Itô correction, and taking it off twice would invent a downward
  // bias that is not in the data.
  const measuredDrift =
    mean(returns) * TRADING_DAYS_PER_YEAR + (annualVol * annualVol) / 2;

  const betaProxy = clamp(
    annualVol / MARKET_VOLATILITY,
    MIN_BETA_PROXY,
    MAX_BETA_PROXY,
  );
  const priorDrift = RISK_FREE_RATE + betaProxy * EQUITY_RISK_PREMIUM;

  // Standard error of a mean-return estimate is σ/√T. Over five years and 30%
  // vol that is ±13 points a year, which is why the raw number cannot be
  // taken at face value.
  const standardError = annualVol / Math.sqrt(Math.max(yearsOfData, 0.25));
  const reliability =
    PRIOR_DRIFT_SPREAD ** 2 /
    (PRIOR_DRIFT_SPREAD ** 2 + standardError ** 2 || 1e-9);
  let drift = priorDrift + reliability * (measuredDrift - priorDrift);

  /* --- Signal tilts ----------------------------------------------- */

  const tradingDays = Math.max(
    5,
    Math.round((horizonDays * TRADING_DAYS_PER_YEAR) / 365.25),
  );
  const years = tradingDays / TRADING_DAYS_PER_YEAR;

  // A signal that speaks to the next quarter should not be steering a ten-year
  // forecast, so each tilt is scaled down by how far past its useful life the
  // horizon runs.
  const decay = (usefulDays: number) => Math.min(1, usefulDays / tradingDays);

  const momentum = momentum12m1(closes);
  const sma200 = sma(closes, 200);
  const gap200 = sma200 && sma200 > 0 ? entryPrice / sma200 - 1 : null;
  const rsiValue = rsi(closes, 14);
  const macdValue = macd(closes);

  let tilt = 0;
  if (momentum !== null) {
    tilt += clamp(momentum, -0.6, 0.6) * 0.05 * decay(TRADING_DAYS_PER_YEAR);
  }
  if (gap200 !== null) {
    // Stretched far above its own trend line, a price has historically given
    // some of that back — so this one leans against the gap, not with it.
    tilt += -clamp(gap200, -0.5, 0.5) * 0.05 * decay(TRADING_DAYS_PER_YEAR);
  }
  if (rsiValue !== null) {
    tilt += -((rsiValue - 50) / 50) * 0.03 * decay(63);
  }
  if (macdValue) {
    tilt += clamp(macdValue.normalized * 250, -1, 1) * 0.02 * decay(63);
  }

  drift = clamp(drift + clamp(tilt, -0.08, 0.08), -0.15, 0.35);

  /* --- Simulation -------------------------------------------------- */

  const paths = tradingDays > 1260 ? 12_000 : 20_000;
  const halfPaths = paths / 2;

  // Simulation is seeded from the inputs plus the calendar day, so the answer
  // is stable if the user re-runs it and moves on tomorrow's data.
  const random = makeRandom(
    seedFrom(`${symbol}|${tradingDays}|${new Date().toISOString().slice(0, 10)}`),
  );

  const dt = 1 / TRADING_DAYS_PER_YEAR;
  const sqrtDt = Math.sqrt(dt);
  // Itô correction: the −σ²/2 term is what keeps the *median* path honest
  // when returns compound.
  const gbmStepDrift = (drift - (annualVol * annualVol) / 2) * dt;
  const gbmStepVol = annualVol * sqrtDt;

  // Historical returns recentred to zero, so the bootstrap contributes the
  // real *shape* of the distribution while the drift stays the shrunk one.
  const centred = new Float64Array(returns.length);
  const historicalMean = mean(returns);
  // The per-day log drift, ν/252 = (µ − σ²ₐₙₙ/2)/252. Since σ²_daily = σ²ₐₙₙ/252,
  // halving the daily variance is exactly that correction.
  const bootstrapDrift = drift / TRADING_DAYS_PER_YEAR - (dailyVol * dailyVol) / 2;
  for (let index = 0; index < returns.length; index += 1) {
    centred[index] = returns[index] - historicalMean + bootstrapDrift;
  }
  // Stationary bootstrap: block lengths are geometric with a mean of 20
  // trading days, which is about how long a volatility regime persists.
  const restartProbability = 1 / 20;

  const terminal = new Float64Array(paths);
  // Deepest peak-to-trough fall inside each path. Tracked in log space, where
  // the running peak is just a running maximum and the drawdown is a
  // subtraction — no exp() per step.
  const pathDrawdown = new Float64Array(paths);

  for (let path = 0; path < paths; path += 1) {
    const useGbm = path < halfPaths;
    let logPrice = Math.log(entryPrice);
    let logPeak = logPrice;
    let worstLogDrop = 0;
    let cursor = Math.floor(random() * returns.length);

    for (let step = 1; step <= tradingDays; step += 1) {
      if (useGbm) {
        logPrice += gbmStepDrift + gbmStepVol * studentT(random);
      } else {
        if (random() < restartProbability) {
          cursor = Math.floor(random() * returns.length);
        } else {
          cursor = (cursor + 1) % returns.length;
        }
        logPrice += centred[cursor];
      }

      if (logPrice > logPeak) logPeak = logPrice;
      else if (logPeak - logPrice > worstLogDrop) worstLogDrop = logPeak - logPrice;
    }

    terminal[path] = Math.exp(logPrice);
    // exp(−drop) is the trough as a fraction of the peak, so 1 − that is the
    // fall itself.
    pathDrawdown[path] = 1 - Math.exp(-worstLogDrop);
  }

  terminal.sort();
  pathDrawdown.sort();

  const p05 = percentileSorted(terminal, 0.05);
  const p10 = percentileSorted(terminal, 0.1);
  const p50 = percentileSorted(terminal, 0.5);
  const p90 = percentileSorted(terminal, 0.9);

  // The whole ladder, so the client can invert it into "odds of at least $X"
  // for any X without asking the server again.
  const percentiles: number[] = [];
  for (let index = 0; index <= 100; index += 1) {
    percentiles.push(percentileSorted(terminal, index / 100));
  }

  let winners = 0;
  let total = 0;
  for (let index = 0; index < paths; index += 1) {
    if (terminal[index] > entryPrice) winners += 1;
    total += terminal[index];
  }
  const meanPrice = total / paths;

  /* --- Cash comparison ---------------------------------------------- */

  // The price the stock would have to reach just to match a savings account,
  // which is the bar the risk actually has to clear.
  const cashPrice = entryPrice * Math.pow(1 + RISK_FREE_RATE, years);
  let beatCash = 0;
  for (let index = 0; index < paths; index += 1) {
    if (terminal[index] > cashPrice) beatCash += 1;
  }

  /* --- Outcome histogram --------------------------------------------- */

  // Trimmed to the 1st–99th percentile: one path that ended at forty times the
  // starting price would otherwise squash every meaningful bar into the first
  // column. The tails are reported as numbers elsewhere; this chart is here to
  // show the *shape*.
  const BUCKETS = 36;
  const histogramLow = percentiles[1];
  const histogramHigh = percentiles[99];
  const bucketWidth = (histogramHigh - histogramLow) / BUCKETS || 1;
  const counts = new Array<number>(BUCKETS).fill(0);
  for (let index = 0; index < paths; index += 1) {
    const value = terminal[index];
    if (value < histogramLow || value > histogramHigh) continue;
    const bucket = Math.min(
      BUCKETS - 1,
      Math.floor((value - histogramLow) / bucketWidth),
    );
    counts[bucket] += 1;
  }
  const distribution = counts.map((count, index) => ({
    from: histogramLow + index * bucketWidth,
    to: histogramLow + (index + 1) * bucketWidth,
    share: count / paths,
  }));

  const targetDate = new Date(Date.now() + horizonDays * 86_400_000);

  return {
    symbol,
    name: request.name?.trim() || symbol,
    price: entryPrice,
    amount,
    horizonDays,
    tradingDays,
    targetDate: targetDate.toISOString(),
    generatedAt: new Date().toISOString(),
    best: outcome(p90, entryPrice, amount, years),
    likely: outcome(p50, entryPrice, amount, years),
    worst: outcome(p10, entryPrice, amount, years),
    stress: outcome(p05, entryPrice, amount, years),
    expected: outcome(meanPrice, entryPrice, amount, years),
    probabilityOfProfit: (winners / paths) * 100,
    percentiles,
    distribution,
    cash: {
      annualRatePercent: RISK_FREE_RATE * 100,
      value: amount * Math.pow(1 + RISK_FREE_RATE, years),
      probabilityOfBeating: (beatCash / paths) * 100,
    },
    journey: {
      medianDipPercent: percentileSorted(pathDrawdown, 0.5) * 100,
      roughDipPercent: percentileSorted(pathDrawdown, 0.9) * 100,
    },
    simulations: paths,
    historyDays: closes.length,
    methods: FORECAST_METHODS,
    drivers: {
      annualDriftPercent: drift * 100,
      annualVolatilityPercent: annualVol * 100,
      rsi: rsiValue,
      macdHistogram: macdValue?.histogram ?? null,
      momentum12m1Percent: momentum === null ? null : momentum * 100,
      gapToSma200Percent: gap200 === null ? null : gap200 * 100,
      maxDrawdownPercent: maxDrawdown(closes) * 100,
      dailyVaR95Percent: historicalVaR(returns) * 100,
      dailyCVaR95Percent: conditionalVaR(returns) * 100,
    },
  };
}
