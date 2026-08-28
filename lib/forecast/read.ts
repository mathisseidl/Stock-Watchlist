/**
 * Turning the forecast's numbers into things a person can say out loud.
 *
 * The engine deals in percentiles and log returns. Nobody thinks that way —
 * they think "what are the odds", "how long", "is that a lot". Everything in
 * this file is the translation layer, kept away from the components so the
 * wording is decided in one place rather than re-improvised in five.
 */

/** "45 days" / "8 months" / "3.5 years", whichever reads most naturally. */
export function describeHorizon(days: number): string {
  if (days < 60) return `${Math.round(days)} days`;
  if (days < 730) {
    const months = Math.round(days / 30.44);
    return months === 1 ? "1 month" : `${months} months`;
  }
  const years = days / 365.25;
  const rounded = Math.round(years * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} years`;
}

/**
 * A percentage restated as odds, because "62%" is a statistic and "about 6 in
 * 10" is a feeling. Deliberately vague at the extremes — claiming "1 in 847"
 * from twenty thousand simulations would be false precision.
 */
export function oddsPhrase(percent: number): string {
  if (percent >= 99) return "almost every run";
  if (percent <= 1) return "almost no runs";
  if (percent >= 90) return `more than 9 runs in 10`;
  if (percent <= 10) return `fewer than 1 run in 10`;
  const inTen = Math.round(percent / 10);
  if (inTen >= 1 && inTen <= 9) return `about ${inTen} runs in 10`;
  return `about ${Math.round(percent)} runs in 100`;
}

/**
 * How much risk this stock carries, in the only terms a newcomer can act on.
 * The cut-offs are annualised volatility: the broad market runs near 16%, a
 * steady large-cap 20–25%, a single high-growth name 40%+.
 */
export function describeRisk(annualVolatilityPercent: number): {
  label: string;
  detail: string;
  /** 1–4, for the meter. */
  level: number;
} {
  if (annualVolatilityPercent < 18) {
    return {
      label: "Steady",
      detail: "Moves less than the market average does.",
      level: 1,
    };
  }
  if (annualVolatilityPercent < 30) {
    return {
      label: "Normal",
      detail: "Swings about as much as a typical large company.",
      level: 2,
    };
  }
  if (annualVolatilityPercent < 45) {
    return {
      label: "Choppy",
      detail: "Noticeably rougher than the market. Expect real drops.",
      level: 3,
    };
  }
  return {
    label: "Wild",
    detail: "Very large swings in both directions are normal here.",
    level: 4,
  };
}

/**
 * The one-sentence verdict at the top of the result.
 *
 * Written from the probability of profit rather than the median, because the
 * median alone can look handsome while a majority of runs still lose money.
 */
export function describeVerdict(probabilityOfProfit: number): string {
  if (probabilityOfProfit >= 70) return "The odds lean your way";
  if (probabilityOfProfit >= 55) return "Slightly more upside than downside";
  if (probabilityOfProfit >= 45) return "It's close to a coin flip";
  if (probabilityOfProfit >= 30) return "The odds lean against you";
  return "Most runs end below where you started";
}
