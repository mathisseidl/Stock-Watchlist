import type { ForecastDrivers } from "@/lib/forecast/engine";
import { RISK_FREE_PERCENT, type HorizonScore } from "@/lib/potential/score";

/**
 * Turning the screen's numbers into a sentence. Kept out of the components so
 * the wording is decided once — same idea as `lib/forecast/read.ts`.
 */

export const IN_FOCUS_HEADING = "In focus this week";

const HOLD_LABELS: Record<number, string> = {
  180: "6 months",
  365: "1 year",
  730: "2 years",
  1095: "3 years",
  1826: "5 years",
};

/** The suggested-hold horizon as a short phrase for the card's headline number. */
export function holdPhrase(days: number): string {
  if (HOLD_LABELS[days]) return HOLD_LABELS[days];
  if (days < 365) return `${Math.round(days / 30.44)} months`;
  const years = Math.round(days / 365.25);
  return `${years} year${years === 1 ? "" : "s"}`;
}

/**
 * The line under the suggested-hold figure. It is a floor, not a peak — the
 * shortest horizon where the odds first clear the confidence bar. The odds
 * keep climbing past it (the ladder shows this), so this reads as "hold at
 * least this long" rather than "this is the best moment to sell".
 */
export const HOLD_CAPTION =
  "The shortest hold where the odds are already on your side. They keep climbing past this — see below.";

/** One plain sentence on what put this stock in focus, from its drivers. */
export function whyInFocus(drivers: ForecastDrivers, hold: HorizonScore): string {
  const momentum = drivers.momentum12m1Percent;
  const gap = drivers.gapToSma200Percent;
  const vol = drivers.annualVolatilityPercent;

  if (momentum !== null && momentum >= 25) {
    return `A strong ${Math.round(momentum)}% run over the past year keeps the odds tilted upward.`;
  }
  if (gap !== null && gap <= -8) {
    return `Trading ${Math.abs(Math.round(gap))}% below its own year-long trend, which the model reads as room to recover.`;
  }
  if (
    vol < 22 &&
    hold.roughDrawdownPercent < 28 &&
    hold.medianAnnualizedPercent >= RISK_FREE_PERCENT
  ) {
    return `A steady grower — smaller swings than most, and the simulation stays ahead of cash from ${holdPhrase(hold.horizonDays)} out.`;
  }
  // Nothing stands out in the drivers — it earned its place on the balance of
  // the two, not on a single signal.
  return `A balanced profile — the odds and the expected drawdown together score better than the flashier names this week.`;
}
