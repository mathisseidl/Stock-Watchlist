/**
 * The forecast engine.
 *
 * What this is: a probability distribution over where a price could end up,
 * built from the stock's own measured risk and return and simulated tens of
 * thousands of times. What it is not: a prediction. Nobody can predict a
 * price. The honest product is the *shape* of the distribution — how wide the
 * good and bad tails are, and how much of it sits above break-even — and that
 * is what every number below describes.
 *
 * The statistics live in `model.ts` (estimation and path generation) and
 * `backtest.ts` (whether the resulting bands have historically held). This
 * file is the orchestration: fetch the history, fit, simulate, score, and turn
 * the result into the fields the page reads.
 *
 * Three choices here are worth knowing before reading the numbers:
 *
 *   - Returns are measured on the **dividend-adjusted** series, so a stock's
 *     yield counts toward its expected return, while prices and technical
 *     signals stay on the raw closes a reader would recognise.
 *   - Ten years of daily closes go into every estimate. Estimation error on a
 *     mean return falls with √T and it is the dominant error in the whole
 *     model, so the extra five years are worth more than any indicator here.
 *   - The result carries its own report card. `calibration` is the model
 *     re-run against this stock's real past, and it is shown whether or not it
 *     flatters the forecast.
 */

import {
  alignMarketReturns,
  fetchBenchmarkHistory,
  fetchDailyHistory,
  type DailyHistory,
} from "./history";
import { backtestModel, type ForecastCalibration } from "./backtest";
import { FORECAST_METHODS } from "./methods";
import {
  fitModel,
  makeRandom,
  MIN_HISTORY_DAYS,
  RISK_FREE_RATE,
  seedFrom,
  simulatePaths,
  toSortedPrices,
} from "./model";
import {
  TRADING_DAYS_PER_YEAR,
  clamp,
  conditionalVaR,
  excessKurtosis,
  historicalVaR,
  logReturns,
  macd,
  maxDrawdown,
  momentum12m1,
  percentileSorted,
  rsi,
  skewness,
  sma,
} from "./indicators";

export type { ForecastCalibration } from "./backtest";

/** Longest horizon we'll simulate. Beyond a decade the bands are meaningless. */
export const MAX_HORIZON_DAYS = 3653; // ~10 years
export const MIN_HORIZON_DAYS = 7;

/**
 * How much daily history every forecast is built from. Exported because the
 * page advertises it, and a number the UI types in for itself is a number that
 * drifts the first time this changes.
 */
export const HISTORY_RANGE = "10y" as const;
export const HISTORY_YEARS = 10;
export const HISTORY_TRADING_DAYS = HISTORY_YEARS * TRADING_DAYS_PER_YEAR;

/**
 * Paths per run. Long horizons get fewer, because each one costs proportionally
 * more steps and the extra precision buys nothing a reader can see — the
 * antithetic pairing in the simulator already recovers more than the shortfall.
 */
export const SIMULATIONS_PER_RUN = 20_000;
const SIMULATIONS_LONG_HORIZON = 12_000;
/** Above this many trading days a run counts as long. */
const LONG_HORIZON_TRADING_DAYS = 1260;

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
  /** The drift the simulation actually ran on, after shrinkage and tilts. */
  annualDriftPercent: number;
  /** Standard deviation of that drift — how much is genuinely unknown. */
  driftUncertaintyPercent: number;
  /** What this stock's own history alone said, before any shrinking. */
  measuredDriftPercent: number;
  /** The CAPM anchor it was shrunk toward. */
  priorDriftPercent: number;
  /** How much weight the stock's own history earned, 0–100. */
  driftReliabilityPercent: number;
  /** Net contribution of the four technical signals, annualised. */
  signalTiltPercent: number;

  /** Average volatility across *this* horizon — what the bands were drawn with. */
  annualVolatilityPercent: number;
  /** Today's EWMA level. */
  spotVolatilityPercent: number;
  /** Where volatility reverts to over the long run. */
  longRunVolatilityPercent: number;

  /** Sensitivity to the S&P 500. */
  beta: number;
  /** False when beta fell back to the volatility proxy. */
  betaMeasured: boolean;
  /** Correlation with the index, or null when it could not be measured. */
  marketCorrelation: number | null;

  /** Skew of daily returns. Negative means the sharp moves are the falls. */
  returnSkew: number;
  /** How much fatter than a bell curve the daily tails are. */
  excessKurtosis: number;

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
  /**
   * How often this model's 10–90 band actually contained the real price, over
   * this stock's own past. Null when there is not enough history to test the
   * horizon honestly.
   */
  calibration: ForecastCalibration | null;
  simulations: number;
  historyDays: number;
  drivers: ForecastDrivers;
  methods: string[];
};

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

export type ForecastOptions = {
  /**
   * Lets a caller that already holds this symbol's daily closes skip the
   * fetch — the weekly screen runs a stock through five horizons and would
   * otherwise pull the same history five times.
   */
  history?: DailyHistory;
  /**
   * Overrides the calendar day the PRNG is seeded from, so a batch job can pin
   * every run in a weekly snapshot to the same date and reproduce it.
   */
  asOf?: string;
  /**
   * Whether to run the walk-forward calibration. On by default; the weekly
   * screen turns it off, because it forecasts a whole universe at five
   * horizons each and does not display the report card.
   */
  backtest?: boolean;
};

export async function buildForecast(
  request: ForecastRequest,
  opts?: ForecastOptions,
): Promise<ForecastResult> {
  const symbol = request.symbol.toUpperCase();
  const horizonDays = Math.round(
    clamp(request.horizonDays, MIN_HORIZON_DAYS, MAX_HORIZON_DAYS),
  );
  const amount = Math.max(1, request.amount);

  const history =
    opts?.history ?? (await fetchDailyHistory(symbol, HISTORY_RANGE));
  // Under a year of daily closes there is no volatility estimate worth
  // simulating, and a made-up band is worse than no band.
  if (history.length < MIN_HISTORY_DAYS) throw new NotEnoughHistoryError(symbol);

  const { closes, adjCloses } = history;
  const entryPrice = history.price > 0 ? history.price : closes[closes.length - 1];
  // Total return, not price return: dividends are part of what a holder earns,
  // and leaving them out understates a mature payer's drift by whole points.
  const returns = logReturns(adjCloses);

  // A regression beta beats the volatility proxy it replaces, but the index is
  // a second network call and a forecast is worth more than a perfect beta.
  let marketReturns: Float64Array | null = null;
  try {
    const benchmark = await fetchBenchmarkHistory(HISTORY_RANGE);
    marketReturns = alignMarketReturns(history, benchmark);
  } catch {
    marketReturns = null;
  }

  const tradingDays = Math.max(
    5,
    Math.round((horizonDays * TRADING_DAYS_PER_YEAR) / 365.25),
  );
  const years = tradingDays / TRADING_DAYS_PER_YEAR;

  const fit = fitModel({
    closes,
    returns,
    marketReturns,
    entryPrice,
    tradingDays,
  });

  /* --- Simulation -------------------------------------------------- */

  const paths =
    tradingDays > LONG_HORIZON_TRADING_DAYS
      ? SIMULATIONS_LONG_HORIZON
      : SIMULATIONS_PER_RUN;

  // Seeded from the inputs plus the calendar day, so the answer is stable if
  // the user re-runs it and moves on tomorrow's data.
  const asOf = opts?.asOf ?? new Date().toISOString().slice(0, 10);
  const seed = seedFrom(`${symbol}|${tradingDays}|${asOf}`);
  const { logTerminal, drawdown } = simulatePaths(fit, paths, makeRandom(seed));
  const terminal = toSortedPrices(logTerminal, entryPrice);

  const p10 = percentileSorted(terminal, 0.1);
  const p50 = percentileSorted(terminal, 0.5);
  const p90 = percentileSorted(terminal, 0.9);

  // The whole ladder, so the client can invert it into "odds of at least $X"
  // for any X without asking the server again.
  const percentiles: number[] = [];
  for (let index = 0; index <= 100; index += 1) {
    percentiles.push(percentileSorted(terminal, index / 100));
  }

  // The price the stock would have to reach just to match a savings account,
  // which is the bar the risk actually has to clear.
  const cashPrice = entryPrice * Math.pow(1 + RISK_FREE_RATE, years);
  let winners = 0;
  let beatCash = 0;
  let total = 0;
  for (let index = 0; index < paths; index += 1) {
    const price = terminal[index];
    if (price > entryPrice) winners += 1;
    if (price > cashPrice) beatCash += 1;
    total += price;
  }
  const meanPrice = total / paths;

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

  /* --- The report card ------------------------------------------------ */

  const calibration =
    opts?.backtest === false
      ? null
      : backtestModel({
          closes,
          adjCloses,
          returns,
          marketReturns,
          tradingDays,
          // A different stream from the headline run, so the two cannot share
          // a lucky draw.
          seed: seed ^ 0x9e3779b9,
        });

  const targetDate = new Date(Date.now() + horizonDays * 86_400_000);
  const sma200 = sma(closes, 200);
  const gap200 = sma200 && sma200 > 0 ? entryPrice / sma200 - 1 : null;
  const momentum = momentum12m1(closes);
  const macdValue = macd(closes);

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
      medianDipPercent: percentileSorted(drawdown, 0.5) * 100,
      roughDipPercent: percentileSorted(drawdown, 0.9) * 100,
    },
    calibration,
    simulations: paths,
    historyDays: closes.length,
    methods: FORECAST_METHODS,
    drivers: {
      annualDriftPercent: fit.driftAnnual * 100,
      driftUncertaintyPercent: fit.driftPosteriorSd * 100,
      measuredDriftPercent: fit.measuredDriftAnnual * 100,
      priorDriftPercent: fit.priorDriftAnnual * 100,
      driftReliabilityPercent: fit.driftReliability * 100,
      signalTiltPercent: fit.tiltAnnual * 100,
      annualVolatilityPercent: fit.horizonAnnualVol * 100,
      spotVolatilityPercent: fit.spotAnnualVol * 100,
      longRunVolatilityPercent: fit.longRunAnnualVol * 100,
      beta: fit.beta,
      betaMeasured: fit.betaMeasured,
      marketCorrelation: fit.marketCorrelation,
      returnSkew: skewness(returns),
      excessKurtosis: excessKurtosis(returns),
      rsi: rsi(closes, 14),
      macdHistogram: macdValue?.histogram ?? null,
      momentum12m1Percent: momentum === null ? null : momentum * 100,
      gapToSma200Percent: gap200 === null ? null : gap200 * 100,
      maxDrawdownPercent: maxDrawdown(closes) * 100,
      dailyVaR95Percent: historicalVaR(returns) * 100,
      dailyCVaR95Percent: conditionalVaR(returns) * 100,
    },
  };
}
