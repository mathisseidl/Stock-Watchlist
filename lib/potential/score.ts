import type { ForecastResult } from "@/lib/forecast/engine";
import type { PotentialTicker } from "@/lib/potential/universe";

/**
 * How the weekly screen ranks a curated list of stocks. Every number here is
 * something the explainer can print — no black box.
 *
 * For each stock the engine is run at five horizons (6mo … 5y). From those:
 *
 *   1. `pickSuggestedHold` — the shortest horizon at which the simulation ends
 *      ahead of a savings account in at least 65% of runs. If none clear that,
 *      the longest horizon stands (and its odds are shown honestly).
 *
 *   2. `scoreTicker` — a risk-adjusted number, read *at the suggested-hold
 *      horizon*:
 *
 *        score = medianAnnualisedReturn
 *              × (chanceOfBeatingCash / 100)
 *              ÷ (roughDrawdown + 8)
 *
 *      "Expected yearly gain, weighted by how reliably it beats cash, divided
 *      by how deep a bad stretch runs." Higher is better. A stock whose median
 *      run never beats the risk-free rate at any horizon is excluded outright.
 *
 * Chance-of-beating-cash rather than raw chance-of-profit keeps this in step
 * with the engine's own view that the bar to clear is a savings account, not
 * zero.
 */

/** % chance of ending ahead of cash the suggested hold must clear. */
export const HOLD_CONFIDENCE_THRESHOLD = 65;
/** Matches the engine's `RISK_FREE_RATE`. */
export const RISK_FREE_PERCENT = 4;
/** Added to the drawdown so a very calm stock cannot score near-infinite. */
export const DRAWDOWN_FLOOR = 8;

export type HorizonScore = {
  horizonDays: number;
  medianAnnualizedPercent: number;
  probabilityOfProfitPercent: number;
  probabilityOfBeatingCashPercent: number;
  roughDrawdownPercent: number;
};

export type ScoredTicker = {
  score: number;
  suggestedHold: HorizonScore;
  horizons: HorizonScore[];
  breakdown: {
    medianAnnualizedPercent: number;
    probBeatCashPercent: number;
    roughDrawdownPercent: number;
  };
};

/** One horizon's `ForecastResult` reduced to the numbers the screen uses. */
export function horizonScore(result: ForecastResult): HorizonScore {
  return {
    horizonDays: result.horizonDays,
    medianAnnualizedPercent: result.likely.annualizedPercent,
    probabilityOfProfitPercent: result.probabilityOfProfit,
    probabilityOfBeatingCashPercent: result.cash.probabilityOfBeating,
    roughDrawdownPercent: result.journey.roughDipPercent,
  };
}

/** The shortest horizon clearing the confidence bar, else the longest. */
export function pickSuggestedHold(horizons: HorizonScore[]): HorizonScore {
  const ascending = [...horizons].sort((a, b) => a.horizonDays - b.horizonDays);
  const cleared = ascending.find(
    (h) => h.probabilityOfBeatingCashPercent >= HOLD_CONFIDENCE_THRESHOLD,
  );
  return cleared ?? ascending[ascending.length - 1];
}

export function scoreTicker(
  results: ForecastResult[],
): ScoredTicker | { excluded: string } {
  if (results.length === 0) return { excluded: "no simulation results" };

  const horizons = results.map(horizonScore);

  const beatsRiskFreeSomewhere = horizons.some(
    (h) => h.medianAnnualizedPercent > RISK_FREE_PERCENT,
  );
  if (!beatsRiskFreeSomewhere) {
    return {
      excluded: "the simulation never beats a savings account, at any horizon",
    };
  }

  const suggestedHold = pickSuggestedHold(horizons);
  const score =
    (suggestedHold.medianAnnualizedPercent *
      (suggestedHold.probabilityOfBeatingCashPercent / 100)) /
    (suggestedHold.roughDrawdownPercent + DRAWDOWN_FLOOR);

  return {
    score,
    suggestedHold,
    horizons,
    breakdown: {
      medianAnnualizedPercent: suggestedHold.medianAnnualizedPercent,
      probBeatCashPercent: suggestedHold.probabilityOfBeatingCashPercent,
      roughDrawdownPercent: suggestedHold.roughDrawdownPercent,
    },
  };
}

export type RankEntry = {
  ticker: PotentialTicker;
  results?: ForecastResult[];
  /** Set when the stock could not be simulated at all. */
  error?: string;
};

export type RankedTicker = {
  ticker: PotentialTicker;
  scored: ScoredTicker;
  /** The forecast at the suggested-hold horizon, for price + drivers. */
  atHold: ForecastResult;
  results: ForecastResult[];
};

export type SkippedTicker = { ticker: PotentialTicker; reason: string };

/**
 * Score every candidate and order them best-first. `compute.ts` slices the top
 * `POTENTIAL_PICK_COUNT` off `ranked`; everything below is a runner-up.
 */
export function rankUniverse(entries: RankEntry[]): {
  ranked: RankedTicker[];
  skipped: SkippedTicker[];
} {
  const ranked: RankedTicker[] = [];
  const skipped: SkippedTicker[] = [];

  for (const entry of entries) {
    if (entry.error || !entry.results || entry.results.length === 0) {
      skipped.push({
        ticker: entry.ticker,
        reason: entry.error ?? "no price history",
      });
      continue;
    }

    const scored = scoreTicker(entry.results);
    if ("excluded" in scored) {
      skipped.push({ ticker: entry.ticker, reason: scored.excluded });
      continue;
    }

    const atHold =
      entry.results.find(
        (r) => r.horizonDays === scored.suggestedHold.horizonDays,
      ) ?? entry.results[entry.results.length - 1];

    ranked.push({ ticker: entry.ticker, scored, atHold, results: entry.results });
  }

  ranked.sort((a, b) => {
    if (b.scored.score !== a.scored.score) return b.scored.score - a.scored.score;
    const bc =
      b.scored.suggestedHold.probabilityOfBeatingCashPercent -
      a.scored.suggestedHold.probabilityOfBeatingCashPercent;
    if (bc !== 0) return bc;
    const dd =
      a.scored.suggestedHold.roughDrawdownPercent -
      b.scored.suggestedHold.roughDrawdownPercent;
    if (dd !== 0) return dd;
    return a.ticker.symbol.localeCompare(b.ticker.symbol);
  });

  return { ranked, skipped };
}
