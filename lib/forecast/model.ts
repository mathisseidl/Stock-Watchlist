/**
 * The statistical model behind the forecast: how the parameters are estimated,
 * and how a path is rolled forward from them.
 *
 * This is split out from `engine.ts` on purpose. The engine fetches, presents
 * and phrases; everything here is pure arithmetic over a return series, which
 * is what lets the walk-forward backtest in `backtest.ts` refit the *exact*
 * same model at fifty points in the past and check whether its bands actually
 * held. A calibration check that ran a simplified copy of the model would be
 * measuring the copy.
 *
 * Four things separate this from a textbook Monte Carlo, and each one exists
 * because the textbook version is measurably wrong in a way a reader would
 * feel:
 *
 *   1. **Volatility has a term structure.** Today's volatility is not next
 *      decade's. Variance is pulled from its current EWMA level back toward a
 *      long-run anchor at an empirical half-life, so a week-ahead forecast
 *      reflects today's regime and a ten-year one does not pretend to.
 *   2. **The parameters are uncertain, and that uncertainty is simulated.**
 *      Drift is drawn per path from its Bayesian posterior rather than fixed at
 *      the point estimate. Over ten years, uncertainty about the mean matters
 *      more than the diffusion does — a model that ignores it draws bands far
 *      too narrow and calls them confidence.
 *   3. **Beta is measured, not guessed.** The prior an estimate is shrunk
 *      toward comes from a regression on the index, so a volatile stock that
 *      happens not to move with the market is no longer awarded a market-sized
 *      risk premium for volatility the market never paid for.
 *   4. **Shocks are fat-tailed but finite.** Student-t innovations with an
 *      outright cap: uncapped t shocks have no moment generating function, so
 *      the *average* simulated outcome would be driven by whichever single path
 *      drew the wildest number and would not settle down however many paths ran.
 */

import {
  TRADING_DAYS_PER_YEAR,
  betaTo,
  clamp,
  ewmaVolatility,
  macd,
  mean,
  momentum12m1,
  rsi,
  sma,
  stdDev,
} from "./indicators";

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

/**
 * The prior every stock's own measured drift is pulled towards, built the way
 * CAPM builds an expected return: a risk-free anchor plus a premium for how
 * much *market* risk the stock carries.
 *
 * A single flat prior for every ticker would be worse than it looks — it would
 * quietly say a stock with 80% volatility deserves the same expected return as
 * a utility, which after the variance drag implies a catastrophic median for
 * anything risky. Scaling the premium with market exposure avoids punishing a
 * stock twice for the same risk, while refusing to pay it for risk that
 * diversifies away.
 */
export const RISK_FREE_RATE = 0.04;
export const EQUITY_RISK_PREMIUM = 0.045;
/** Long-run volatility of the broad market, the yardstick the fallback uses. */
const MARKET_VOLATILITY = 0.16;
const MIN_BETA = 0.3;
const MAX_BETA = 2.5;

/**
 * How far true expected returns actually spread across stocks. Small, because
 * almost all of the variation you see in realised returns is noise rather than
 * a difference in underlying expectation. This is the number that makes the
 * shrinkage below aggressive, and it is the single most important guard
 * against extrapolating a lucky three-year run into a decade.
 */
const PRIOR_DRIFT_SPREAD = 0.06;

/**
 * Half-life of a volatility regime, in trading days.
 *
 * Equity variance is strongly mean-reverting: calm does not last, and neither
 * does a crisis. Heston fits on index options land the reversion speed around
 * 3–5 per year, which is a half-life of roughly two to three months. Sixty
 * trading days sits in the middle of that.
 */
const VOL_HALF_LIFE_DAYS = 60;
const VOL_REVERSION = Math.LN2 / VOL_HALF_LIFE_DAYS;

/**
 * Where a stock's long-run variance anchor is shrunk to, and how hard.
 *
 * The sample deviation of a stock with two years of history is itself a noisy
 * number; blending it toward a typical single-name volatility keeps a quiet
 * newly-listed stock from being modelled as permanently placid. The weight is
 * the usual n / (n + k), so a decade of data barely moves and two years moves
 * meaningfully.
 */
const PRIOR_ANNUAL_VOL = 0.3;
const VOL_PRIOR_WEIGHT_DAYS = 250;

/**
 * How wrong the volatility anchor itself might be, as a log-standard-deviation
 * on variance.
 *
 * This is not estimation error — that term is added separately and is tiny on a
 * decade of daily data. It is regime uncertainty: nobody knows which
 * volatility world the next few years happen in. It is scaled by how far the
 * horizon runs past the current regime's memory, because over a single week
 * today's volatility genuinely is next week's.
 */
const VOL_REGIME_UNCERTAINTY = 0.22;

/** Student-t degrees of freedom for the diffusion shocks. */
export const T_DF = 5;
/** Var(t_ν) = ν/(ν−2), so dividing by this gives unit variance. */
const T_SCALE = Math.sqrt(T_DF / (T_DF - 2));
/**
 * Hard cap on a single day's shock, in standard deviations.
 *
 * ν = 5 keeps kurtosis finite where the ν = 4 this used to run on did not, but
 * the exponential of a t variate still has an infinite mean, so the simulated
 * *average* outcome would never converge. Eight sigma is a −15% to +18% day on
 * a typical large-cap: extreme, and real, and bounded.
 */
const SHOCK_CAP = 8;

/**
 * Mean block length for the stationary bootstrap, in trading days — about how
 * long a volatility regime persists at the daily scale.
 */
const BOOTSTRAP_BLOCK_DAYS = 20;
const BOOTSTRAP_RESTART = 1 / BOOTSTRAP_BLOCK_DAYS;

/** Minimum daily closes before any of this is worth doing. */
export const MIN_HISTORY_DAYS = 200;

/* ------------------------------------------------------------------ */
/* Randomness                                                          */
/* ------------------------------------------------------------------ */

/**
 * Seeded PRNG (mulberry32). Deterministic on purpose: asking for the same
 * stock and horizon twice on the same day must give the same answer, or the
 * feature reads as a slot machine rather than an analysis.
 */
export function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedFrom(text: string): number {
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

/**
 * Standardised, capped Student-t shock.
 *
 * A χ²_ν variate for even ν is −2·Σ ln Uᵢ over ν/2 uniforms, which makes the
 * usual Z / √(χ²_ν/ν) construction cheap enough to run tens of millions of
 * times. ν = 5 is odd, so the χ² is built from two logs plus one squared
 * normal — still three cheap draws.
 */
function studentT(random: () => number): number {
  let u1 = random();
  let u2 = random();
  if (u1 < 1e-12) u1 = 1e-12;
  if (u2 < 1e-12) u2 = 1e-12;
  const extra = standardNormal(random);
  const chiSquare = -2 * (Math.log(u1) + Math.log(u2)) + extra * extra;
  const z = standardNormal(random);
  const t = z / Math.sqrt(chiSquare / T_DF) / T_SCALE;
  return clamp(t, -SHOCK_CAP, SHOCK_CAP);
}

/* ------------------------------------------------------------------ */
/* Fitting                                                             */
/* ------------------------------------------------------------------ */

export type ModelFit = {
  /** Trading days the fit was tuned for — the volatility path has this length. */
  tradingDays: number;

  /** Annual arithmetic drift, after shrinkage and signal tilts. */
  driftAnnual: number;
  /** Posterior standard deviation of that drift. Drawn per path. */
  driftPosteriorSd: number;
  /** The raw sample estimate, before any shrinkage. */
  measuredDriftAnnual: number;
  /** The CAPM anchor it was shrunk toward. */
  priorDriftAnnual: number;
  /** Weight the sample estimate earned, 0–1. */
  driftReliability: number;
  /** Net contribution of the four technical signals, annualised. */
  tiltAnnual: number;

  beta: number;
  /** Whether beta came from a regression or the volatility fallback. */
  betaMeasured: boolean;
  marketCorrelation: number | null;

  /** Daily variance at each simulated step, index 0 = the first day. */
  stepVariance: Float64Array;
  /** √stepVariance, cached. */
  stepVolatility: Float64Array;
  /** Log-sd of the per-path variance multiplier. */
  volLogSd: number;

  /** Annualised: today's EWMA level. */
  spotAnnualVol: number;
  /** Annualised: the long-run anchor variance reverts to. */
  longRunAnnualVol: number;
  /** Annualised: the average over *this* horizon — what the bands reflect. */
  horizonAnnualVol: number;
  /** Annualised: the plain full-sample deviation. */
  sampleAnnualVol: number;

  /**
   * The historical returns, centred and divided by their own deviation, so
   * they carry pure *shape* — skew, fat tails, volatility clustering — with the
   * level of risk supplied by the volatility path instead.
   */
  shape: Float64Array;
};

export type FitInput = {
  /** Raw closes, oldest first. Technical signals are read from these. */
  closes: ArrayLike<number>;
  /** Total-return log returns, length `closes.length - 1`. */
  returns: ArrayLike<number>;
  /** Index-aligned market returns, NaN where unmatched. Null skips the regression. */
  marketReturns: ArrayLike<number> | null;
  /** The price the paths start from. */
  entryPrice: number;
  tradingDays: number;
};

/**
 * A signal that speaks to the next quarter should not be steering a ten-year
 * forecast. Each tilt is scaled by how much of the horizon falls inside its
 * useful life, which is the same as spreading a fixed total effect across the
 * whole holding period.
 */
function decay(usefulDays: number, tradingDays: number): number {
  return Math.min(1, usefulDays / tradingDays);
}

export function fitModel(input: FitInput): ModelFit {
  const { closes, returns, marketReturns, entryPrice, tradingDays } = input;
  const n = returns.length;
  const yearsOfData = n / TRADING_DAYS_PER_YEAR;

  /* --- Volatility, and its term structure --------------------------- */

  const sampleDailyVol = stdDev(returns);
  const sampleVariance = Math.max(sampleDailyVol ** 2, 1e-12);
  const spotVariance = Math.max(ewmaVolatility(returns) ** 2, 1e-12);

  // Long-run anchor: the stock's own full-sample variance, shrunk toward a
  // typical single-name variance by how much history is actually behind it.
  const priorVariance = PRIOR_ANNUAL_VOL ** 2 / TRADING_DAYS_PER_YEAR;
  const sampleWeight = n / (n + VOL_PRIOR_WEIGHT_DAYS);
  const longRunVariance =
    sampleWeight * sampleVariance + (1 - sampleWeight) * priorVariance;

  // v(t) = v∞ + (v₀ − v∞)·e^(−κt): today's level decaying into the anchor.
  const stepVariance = new Float64Array(tradingDays);
  const stepVolatility = new Float64Array(tradingDays);
  for (let step = 0; step < tradingDays; step += 1) {
    const v =
      longRunVariance +
      (spotVariance - longRunVariance) * Math.exp(-VOL_REVERSION * (step + 1));
    stepVariance[step] = Math.max(v, 1e-12);
    stepVolatility[step] = Math.sqrt(stepVariance[step]);
  }

  // The horizon average of that path, in closed form — this is the single
  // volatility number the result reports, because it is the one the bands were
  // actually drawn with.
  const kh = VOL_REVERSION * tradingDays;
  const horizonVariance =
    longRunVariance +
    (spotVariance - longRunVariance) * ((1 - Math.exp(-kh)) / (kh || 1));

  const annualise = (dailyVariance: number) =>
    Math.sqrt(Math.max(dailyVariance, 1e-12) * TRADING_DAYS_PER_YEAR);
  const sampleAnnualVol = annualise(sampleVariance);
  const spotAnnualVol = annualise(spotVariance);
  const longRunAnnualVol = annualise(longRunVariance);
  const horizonAnnualVol = annualise(horizonVariance);

  // How wrong the variance level might be over this horizon. The regime term
  // grows as the horizon outruns the current regime's memory; the 2/n term is
  // the sampling error of a variance estimate.
  const regimeWeight = 1 - Math.exp(-kh);
  const volLogSd = Math.sqrt(
    (VOL_REGIME_UNCERTAINTY * regimeWeight) ** 2 + 2 / Math.max(n, 2),
  );

  /* --- Drift -------------------------------------------------------- */

  // Everything from here on is an *arithmetic* annual drift µ, the expected
  // return before compounding. The mean of log returns estimates µ − σ²/2, so
  // the variance term is added back here — the simulation subtracts it again
  // as the Itô correction, and taking it off twice would invent a downward
  // bias that is not in the data. The variance added back is the sample's own,
  // since that is the one those log returns were generated under.
  const measuredDriftAnnual =
    mean(returns) * TRADING_DAYS_PER_YEAR + sampleVariance * TRADING_DAYS_PER_YEAR / 2;

  const regression = marketReturns ? betaTo(returns, marketReturns) : null;
  const beta = clamp(
    regression ? regression.beta : sampleAnnualVol / MARKET_VOLATILITY,
    MIN_BETA,
    MAX_BETA,
  );
  const priorDriftAnnual = RISK_FREE_RATE + beta * EQUITY_RISK_PREMIUM;

  // Standard error of a mean-return estimate is σ/√T. Over ten years and 30%
  // vol that is still ±9 points a year, which is why the raw number cannot be
  // taken at face value.
  const standardError = sampleAnnualVol / Math.sqrt(Math.max(yearsOfData, 0.25));
  const driftReliability =
    PRIOR_DRIFT_SPREAD ** 2 /
    (PRIOR_DRIFT_SPREAD ** 2 + standardError ** 2 || 1e-9);
  const shrunkDrift =
    priorDriftAnnual + driftReliability * (measuredDriftAnnual - priorDriftAnnual);

  // Normal–normal conjugacy: the same weight that shrinks the mean also gives
  // the posterior variance, τ²σ²/(τ²+σ²) = reliability · σ². This is the number
  // that stops a ten-year band from being drawn as though the expected return
  // were known exactly.
  const driftPosteriorSd = standardError * Math.sqrt(driftReliability);

  /* --- Signal tilts -------------------------------------------------- */

  const momentum = momentum12m1(closes);
  const sma200 = sma(closes, 200);
  const gap200 = sma200 && sma200 > 0 ? entryPrice / sma200 - 1 : null;
  const rsiValue = rsi(closes, 14);
  const macdValue = macd(closes);

  let tilt = 0;
  if (momentum !== null) {
    tilt +=
      clamp(momentum, -0.6, 0.6) * 0.05 * decay(TRADING_DAYS_PER_YEAR, tradingDays);
  }
  if (gap200 !== null) {
    // Stretched far above its own trend line, a price has historically given
    // some of that back — so this one leans against the gap, not with it.
    tilt +=
      -clamp(gap200, -0.5, 0.5) * 0.05 * decay(TRADING_DAYS_PER_YEAR, tradingDays);
  }
  if (rsiValue !== null) {
    tilt += -((rsiValue - 50) / 50) * 0.03 * decay(63, tradingDays);
  }
  if (macdValue) {
    tilt += clamp(macdValue.normalized * 250, -1, 1) * 0.02 * decay(63, tradingDays);
  }
  const tiltAnnual = clamp(tilt, -0.08, 0.08);

  const driftAnnual = clamp(shrunkDrift + tiltAnnual, -0.15, 0.35);

  /* --- Bootstrap shape ---------------------------------------------- */

  // Stripped of both its level and its scale. Replaying these with the
  // volatility path above is what keeps the two simulators pointed at the same
  // risk — the old version let the bootstrap carry the sample's volatility
  // while the parametric half carried today's, so in a changed regime the two
  // halves were quietly modelling different stocks.
  const shape = new Float64Array(n);
  const centre = mean(returns);
  const scale = sampleDailyVol > 0 ? 1 / sampleDailyVol : 0;
  for (let index = 0; index < n; index += 1) {
    shape[index] = (returns[index] - centre) * scale;
  }

  return {
    tradingDays,
    driftAnnual,
    driftPosteriorSd,
    measuredDriftAnnual,
    priorDriftAnnual,
    driftReliability,
    tiltAnnual,
    beta,
    betaMeasured: regression !== null,
    marketCorrelation: regression ? regression.correlation : null,
    stepVariance,
    stepVolatility,
    volLogSd,
    spotAnnualVol,
    longRunAnnualVol,
    horizonAnnualVol,
    sampleAnnualVol,
    shape,
  };
}

/* ------------------------------------------------------------------ */
/* Simulation                                                          */
/* ------------------------------------------------------------------ */

export type SimulationResult = {
  /**
   * Terminal log return of each path, unsorted — the caller decides whether it
   * wants prices, and sorting a Float64Array is numeric by default.
   */
  logTerminal: Float64Array;
  /** Deepest peak-to-trough fall inside each path, ascending, as fractions. */
  drawdown: Float64Array;
};

/**
 * Roll `paths` futures forward and sort them.
 *
 * Half the paths run Geometric Brownian Motion with capped Student-t shocks —
 * the textbook price model, with innovations that admit real markets produce
 * far more six-sigma days than a normal distribution allows. The other half is
 * a stationary block bootstrap (Politis–Romano) over the stock's own return
 * shapes, which makes no distributional assumption at all: it replays real
 * sequences in geometric-length blocks, so genuine volatility clustering and
 * skew survive into the simulation. Pooling them means neither model's blind
 * spot decides the answer alone.
 *
 * Paths are run in antithetic pairs. The mate re-uses the pair's parameter
 * draws with the sign flipped — and, on the parametric half, the negated shock
 * sequence too. Two negatively correlated paths carry more information than
 * two independent ones, so the reported percentiles settle down for free
 * rather than by simulating more of them.
 */
export function simulatePaths(
  fit: ModelFit,
  paths: number,
  random: () => number,
): SimulationResult {
  const steps = fit.tradingDays;
  const logTerminal = new Float64Array(paths);
  const drawdown = new Float64Array(paths);

  const shape = fit.shape;
  const shapeLength = shape.length;
  const shocks = new Float64Array(steps);
  // First half parametric, second half bootstrap. Both counts stay even, so
  // no antithetic pair ever straddles the boundary.
  const parametricPaths = Math.floor(paths / 4) * 2;
  const halfVariance = fit.volLogSd ** 2 / 2;

  for (let pair = 0; pair * 2 < paths; pair += 1) {
    const first = pair * 2;
    const useGbm = first < parametricPaths;

    // Shared across the pair, negated for the mate: the two parameter draws,
    // and on the parametric half the whole shock sequence.
    const zDrift = standardNormal(random);
    const zVol = standardNormal(random);
    if (useGbm) {
      for (let step = 0; step < steps; step += 1) shocks[step] = studentT(random);
    }

    for (let mate = 0; mate < 2; mate += 1) {
      const index = first + mate;
      if (index >= paths) break;
      const sign = mate === 0 ? 1 : -1;

      // Drift drawn from its posterior rather than fixed. The clamp is a
      // sanity rail, not a modelling choice — it only ever bites on a stock
      // whose history is short enough to make the posterior very wide.
      const drift = clamp(
        fit.driftAnnual + sign * zDrift * fit.driftPosteriorSd,
        -0.4,
        0.5,
      );
      const dailyDrift = drift / TRADING_DAYS_PER_YEAR;
      // Lognormal multiplier with mean 1 on *variance*, so the average level
      // of risk is preserved and only the uncertainty about it is added.
      const varianceScale = Math.exp(sign * zVol * fit.volLogSd - halfVariance);
      const volScale = Math.sqrt(varianceScale);

      // Everything runs in log space relative to the entry price: the running
      // peak is a running maximum and the drawdown a subtraction, so there is
      // no exp() inside the step loop.
      let logPrice = 0;
      let logPeak = 0;
      let worstLogDrop = 0;
      let cursor = useGbm ? 0 : Math.floor(random() * shapeLength);

      for (let step = 0; step < steps; step += 1) {
        const variance = fit.stepVariance[step] * varianceScale;
        let move: number;
        if (useGbm) {
          move = fit.stepVolatility[step] * volScale * shocks[step] * sign;
        } else {
          if (step > 0) {
            if (random() < BOOTSTRAP_RESTART) {
              cursor = Math.floor(random() * shapeLength);
            } else {
              // Circular, as the stationary bootstrap prescribes.
              cursor = (cursor + 1) % shapeLength;
            }
          }
          move = fit.stepVolatility[step] * volScale * shape[cursor];
        }
        // Itô correction against the variance actually used this step: this is
        // what keeps the *median* path honest when returns compound.
        logPrice += dailyDrift - variance / 2 + move;

        if (logPrice > logPeak) logPeak = logPrice;
        else if (logPeak - logPrice > worstLogDrop) {
          worstLogDrop = logPeak - logPrice;
        }
      }

      logTerminal[index] = logPrice;
      // exp(−drop) is the trough as a fraction of the peak, so 1 − that is the
      // fall itself.
      drawdown[index] = 1 - Math.exp(-worstLogDrop);
    }
  }

  drawdown.sort();
  return { logTerminal, drawdown };
}

/**
 * The log-space terminals `simulatePaths` produces, turned into prices and
 * sorted. Kept separate because the backtest only needs three percentiles and
 * can skip building the price array until after it sorts.
 */
export function toSortedPrices(
  logTerminals: Float64Array,
  entryPrice: number,
): Float64Array {
  const prices = new Float64Array(logTerminals.length);
  for (let index = 0; index < logTerminals.length; index += 1) {
    prices[index] = entryPrice * Math.exp(logTerminals[index]);
  }
  prices.sort();
  return prices;
}
