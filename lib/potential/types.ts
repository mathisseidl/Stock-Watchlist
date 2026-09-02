import type { ForecastDrivers } from "@/lib/forecast/engine";

/** How many stocks the weekly screen surfaces. */
export const POTENTIAL_PICK_COUNT = 6;

/**
 * The horizons every Potential candidate is simulated at, in calendar days —
 * six months through five years. The suggested hold is chosen from these, and
 * the pick card draws a small odds ladder across them.
 */
export const POTENTIAL_HORIZONS_DAYS = [180, 365, 730, 1095, 1826] as const;

/** One simulated horizon for a candidate. */
export type PotentialHorizon = {
  horizonDays: number;
  /** "6 months", "1 year", … (from `describeHorizon`). */
  label: string;
  /** Share of runs finishing above the entry price, %. */
  probabilityOfProfitPercent: number;
  /** Share of runs finishing above cash grown at the risk-free rate, %. */
  probabilityOfBeatingCashPercent: number;
  /** Median run's return restated per year, %. */
  medianAnnualizedPercent: number;
  /** 90th-percentile peak-to-trough dip along the path to here, %. */
  roughDrawdownPercent: number;
};

/** A stock that made the weekly cut. */
export type PotentialPick = {
  rank: number;
  symbol: string;
  name: string;
  sector: string;
  /** Entry price the simulation started from. */
  price: number;
  /** The risk-adjusted score it was ranked by (see `lib/potential/score.ts`). */
  score: number;
  scoreBreakdown: {
    medianAnnualizedPercent: number;
    probBeatCashPercent: number;
    roughDrawdownPercent: number;
  };
  suggestedHold: {
    horizonDays: number;
    label: string;
    probabilityOfProfitPercent: number;
    probabilityOfBeatingCashPercent: number;
    expectedDrawdownPercent: number;
    annualizedReturnPercent: number;
  };
  horizons: PotentialHorizon[];
  /** One plain sentence on what put it in focus, from its drivers. */
  whyInFocus: string;
  drivers: ForecastDrivers;
  /** This week's headline(s), frozen with the snapshot. */
  headlines?: { title: string; url: string; source: string; datetime: number }[];
  /** Stage 2: a short neutral "what's going on" note written by Claude. */
  note?: string;
};

/** One weekly run of the whole screen. Stored as a JSON row. */
export type PotentialSnapshot = {
  /** ISO week the run belongs to, e.g. "2026-W36". */
  isoWeek: string;
  /** UTC date the simulations were seeded from. */
  asOfDate: string;
  generatedAt: string;
  universeVersion: number;
  universeCount: number;
  /** Monte Carlo paths per simulation, for the explainer. */
  simulations: number;
  /** The stocks in focus, best first. */
  picks: PotentialPick[];
  /** Ranked below the cut. */
  runnersUp: { symbol: string; name: string; score: number }[];
  /** Names that could not be scored (no history, below risk-free, fetch error). */
  skipped: { symbol: string; name: string; reason: string }[];
};
