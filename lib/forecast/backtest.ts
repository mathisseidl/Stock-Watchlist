/**
 * Does this model's band actually hold?
 *
 * Every forecast on this page claims that one run in ten finishes below the
 * low end and one in ten above the high end. That is a testable claim, and an
 * untested one is decoration. So before the result is shown, the *same* model
 * is refitted at a series of points in this stock's own past — using only the
 * data that existed on each of those days — asked for a band over the same
 * horizon, and then checked against what the price went on to do.
 *
 * What comes back is a coverage rate. Eighty percent inside the 10–90 band is
 * a calibrated model. Ninety-five percent inside means the bands are too wide
 * to be useful; sixty means they are too narrow and the risk is being
 * understated, which is the failure that costs people money.
 *
 * Two honest caveats, both surfaced in the UI rather than buried here:
 *
 *   1. The windows overlap. There is not enough listed history on earth to get
 *      fifty independent five-year windows, so a stock that happened to sit
 *      inside its band through one long bull run contributes many correlated
 *      hits. The window count is reported so the reader can weight it.
 *   2. The model's *constants* — the equity risk premium, the volatility
 *      half-life — were chosen knowing how markets have behaved. Only the
 *      per-stock estimates are strictly out of sample.
 */

import { percentileSorted } from "./indicators";
import { fitModel, makeRandom, simulatePaths } from "./model";

/** Below this much training data an anchor is not a fair test of the model. */
const MIN_TRAINING_DAYS = 504;
/**
 * Longest horizon worth testing, in trading days.
 *
 * Past two years the windows overlap so heavily inside a decade of history
 * that the coverage number stops carrying information and starts carrying one
 * market cycle's luck. Reporting nothing is more honest than reporting that.
 */
const MAX_TESTABLE_HORIZON = 504;
/** Enough paths for a stable decile, far fewer than the headline run needs. */
const BACKTEST_PATHS = 800;
const MAX_WINDOWS = 40;
/** Never test on fewer than this many windows — the rate would be noise. */
const MIN_WINDOWS = 8;

export const BAND_LOW_PERCENTILE = 10;
export const BAND_HIGH_PERCENTILE = 90;
/** What a perfectly calibrated 10–90 band should score. */
export const EXPECTED_COVERAGE_PERCENT =
  BAND_HIGH_PERCENTILE - BAND_LOW_PERCENTILE;

export type ForecastCalibration = {
  /** Historical dates the model was refitted and scored at. */
  windows: number;
  /** They overlap unless this is 1 — reported so the reader can discount. */
  windowStrideDays: number;
  horizonTradingDays: number;
  /** Share of windows where the real price landed inside the 10–90 band. */
  insideBandPercent: number;
  /** Share that finished below the band. A calibrated model scores 10. */
  belowBandPercent: number;
  aboveBandPercent: number;
  /**
   * How far the real outcome ran above (positive) or below (negative) the
   * model's middle forecast, on average — a geometric mean, in percent. Near
   * zero means the drift estimate is not systematically optimistic.
   */
  medianBiasPercent: number;
  expectedInsidePercent: number;
  pathsPerWindow: number;
};

export type BacktestInput = {
  /** Raw closes, oldest first. */
  closes: ArrayLike<number>;
  /** Total-return closes, same length and order as `closes`. */
  adjCloses: ArrayLike<number>;
  /** Total-return log returns, length `closes.length - 1`. */
  returns: Float64Array;
  /** Index-aligned market returns, or null. */
  marketReturns: Float64Array | null;
  tradingDays: number;
  /** Seeds the per-window PRNGs, so a rerun reproduces the same score. */
  seed: number;
};

/**
 * Walk the model forward through history and count how often it was right
 * about the range. Returns null when there is not enough history to say
 * anything worth printing — the caller shows nothing rather than a number
 * built from three overlapping windows.
 */
export function backtestModel(input: BacktestInput): ForecastCalibration | null {
  const { closes, adjCloses, returns, marketReturns, tradingDays, seed } = input;

  if (tradingDays > MAX_TESTABLE_HORIZON) return null;

  const days = closes.length;
  const lastAnchor = days - 1 - tradingDays;
  if (lastAnchor < MIN_TRAINING_DAYS) return null;

  const span = lastAnchor - MIN_TRAINING_DAYS;
  // Anchors a quarter of a horizon apart: close enough to cover the sample,
  // far enough that consecutive windows are not the same test twice.
  let stride = Math.max(21, Math.round(tradingDays / 4));
  if (Math.floor(span / stride) + 1 > MAX_WINDOWS) {
    stride = Math.ceil(span / (MAX_WINDOWS - 1));
  }
  if (Math.floor(span / stride) + 1 < MIN_WINDOWS) return null;

  // Indicators take ArrayLike, so a typed copy can be sliced without copying
  // the training window at every anchor.
  const closeSeries = new Float64Array(days);
  for (let index = 0; index < days; index += 1) closeSeries[index] = closes[index];

  let windows = 0;
  let below = 0;
  let above = 0;
  let biasLogTotal = 0;

  for (let anchor = MIN_TRAINING_DAYS; anchor <= lastAnchor; anchor += stride) {
    const realizedFrom = adjCloses[anchor];
    const realizedTo = adjCloses[anchor + tradingDays];
    if (!(realizedFrom > 0) || !(realizedTo > 0)) continue;

    // Only what a forecaster standing on `anchor` could have seen: returns end
    // at that day's close, and so does every technical signal.
    const fit = fitModel({
      closes: closeSeries.subarray(0, anchor + 1),
      returns: returns.subarray(0, anchor),
      marketReturns: marketReturns ? marketReturns.subarray(0, anchor) : null,
      entryPrice: closeSeries[anchor],
      tradingDays,
    });

    const { logTerminal } = simulatePaths(
      fit,
      BACKTEST_PATHS,
      makeRandom(seed ^ (anchor * 2654435761)),
    );
    logTerminal.sort();

    // Percentiles commute with the log, so the band can be compared in log
    // space and never needs turning back into prices.
    const low = percentileSorted(logTerminal, BAND_LOW_PERCENTILE / 100);
    const middle = percentileSorted(logTerminal, 0.5);
    const high = percentileSorted(logTerminal, BAND_HIGH_PERCENTILE / 100);
    const realized = Math.log(realizedTo / realizedFrom);

    if (realized < low) below += 1;
    else if (realized > high) above += 1;
    biasLogTotal += realized - middle;
    windows += 1;
  }

  if (windows < MIN_WINDOWS) return null;

  const inside = windows - below - above;
  return {
    windows,
    windowStrideDays: stride,
    horizonTradingDays: tradingDays,
    insideBandPercent: (inside / windows) * 100,
    belowBandPercent: (below / windows) * 100,
    aboveBandPercent: (above / windows) * 100,
    medianBiasPercent: (Math.exp(biasLogTotal / windows) - 1) * 100,
    expectedInsidePercent: EXPECTED_COVERAGE_PERCENT,
    pathsPerWindow: BACKTEST_PATHS,
  };
}
