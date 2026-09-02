/**
 * Sanity checks for the Potential scoring, plus a small live compute.
 *   npx tsx scripts/potential-check.mts
 */
import { loadEnvFile } from "node:process";
import assert from "node:assert/strict";
import type { ForecastResult } from "@/lib/forecast/engine";
import {
  pickSuggestedHold,
  rankUniverse,
  scoreTicker,
  horizonScore,
  HOLD_CONFIDENCE_THRESHOLD,
} from "@/lib/potential/score";
import { computeSnapshot } from "@/lib/potential/compute";
import { isoWeek } from "@/lib/potential/week";

try {
  loadEnvFile(".env.local");
} catch {}

/** Minimal ForecastResult stub — only the fields the score reads. */
function fr(
  horizonDays: number,
  o: {
    medianAnn: number;
    profit: number;
    beatCash: number;
    roughDip: number;
  },
): ForecastResult {
  return {
    horizonDays,
    likely: { annualizedPercent: o.medianAnn } as ForecastResult["likely"],
    probabilityOfProfit: o.profit,
    cash: { probabilityOfBeating: o.beatCash } as ForecastResult["cash"],
    journey: { roughDipPercent: o.roughDip } as ForecastResult["journey"],
    price: 100,
    drivers: {} as ForecastResult["drivers"],
  } as ForecastResult;
}

// --- pickSuggestedHold ---------------------------------------------------
{
  const hs = [
    fr(180, { medianAnn: 8, profit: 55, beatCash: 50, roughDip: 20 }),
    fr(365, { medianAnn: 9, profit: 60, beatCash: 62, roughDip: 22 }),
    fr(730, { medianAnn: 10, profit: 70, beatCash: 68, roughDip: 28 }),
    fr(1095, { medianAnn: 11, profit: 75, beatCash: 74, roughDip: 33 }),
    fr(1826, { medianAnn: 12, profit: 80, beatCash: 82, roughDip: 40 }),
  ].map(horizonScore);
  assert.equal(pickSuggestedHold(hs).horizonDays, 730, "shortest over the bar");
}
{
  const hs = [
    fr(180, { medianAnn: 5, profit: 40, beatCash: 30, roughDip: 30 }),
    fr(1826, { medianAnn: 6, profit: 45, beatCash: 40, roughDip: 55 }),
  ].map(horizonScore);
  assert.equal(
    pickSuggestedHold(hs).horizonDays,
    1826,
    `none clear ${HOLD_CONFIDENCE_THRESHOLD}% -> longest`,
  );
}

// --- scoreTicker exclusion --------------------------------------------------
{
  const below = [
    fr(180, { medianAnn: 2, profit: 40, beatCash: 35, roughDip: 25 }),
    fr(1826, { medianAnn: 3.5, profit: 44, beatCash: 45, roughDip: 45 }),
  ];
  const s = scoreTicker(below);
  assert.ok("excluded" in s, "sub-risk-free at every horizon -> excluded");
}

// --- rankUniverse order ---------------------------------------------------
{
  const strong = [
    fr(180, { medianAnn: 14, profit: 62, beatCash: 66, roughDip: 18 }),
    fr(365, { medianAnn: 15, profit: 68, beatCash: 72, roughDip: 20 }),
    fr(730, { medianAnn: 16, profit: 74, beatCash: 78, roughDip: 24 }),
    fr(1095, { medianAnn: 16, profit: 78, beatCash: 82, roughDip: 28 }),
    fr(1826, { medianAnn: 17, profit: 82, beatCash: 86, roughDip: 34 }),
  ];
  const weak = [
    fr(180, { medianAnn: 6, profit: 52, beatCash: 48, roughDip: 35 }),
    fr(365, { medianAnn: 6.5, profit: 55, beatCash: 55, roughDip: 40 }),
    fr(730, { medianAnn: 7, profit: 58, beatCash: 66, roughDip: 45 }),
    fr(1095, { medianAnn: 7, profit: 60, beatCash: 70, roughDip: 50 }),
    fr(1826, { medianAnn: 8, profit: 64, beatCash: 74, roughDip: 58 }),
  ];
  const dud = [fr(1826, { medianAnn: 1, profit: 30, beatCash: 20, roughDip: 60 })];
  const t = (symbol: string) => ({ symbol, name: symbol, sector: "Test" });
  const { ranked, skipped } = rankUniverse([
    { ticker: t("WEAK"), results: weak },
    { ticker: t("STRONG"), results: strong },
    { ticker: t("DUD"), results: dud },
    { ticker: t("BROKEN"), error: "no history" },
  ]);
  assert.deepEqual(
    ranked.map((r) => r.ticker.symbol),
    ["STRONG", "WEAK"],
    "strong ranks first, dud + broken excluded",
  );
  assert.deepEqual(
    skipped.map((s) => s.ticker.symbol).sort(),
    ["BROKEN", "DUD"],
  );
}

console.log("scoring checks passed.");

// --- small live compute -------------------------------------------------
const asOf = new Date().toISOString().slice(0, 10);
console.log(`\nlive compute (3 tickers, as of ${asOf})…`);
const snap = await computeSnapshot({
  asOf,
  universe: [
    { symbol: "AAPL", name: "Apple", sector: "Technology" },
    { symbol: "KO", name: "Coca-Cola", sector: "Consumer Staples" },
    { symbol: "XOM", name: "Exxon Mobil", sector: "Energy" },
  ],
  onProgress: (m) => console.log("  " + m),
});
assert.equal(snap.isoWeek, isoWeek(new Date()));
assert.ok(snap.picks.length >= 1 && snap.picks.length <= 3);
for (const p of snap.picks) {
  assert.ok(p.suggestedHold.probabilityOfBeatingCashPercent >= 0);
  assert.ok(p.suggestedHold.probabilityOfBeatingCashPercent <= 100);
  assert.equal(p.horizons.length, 5);
  // Cumulative drawdown-so-far never shrinks as the horizon lengthens.
  for (let i = 1; i < p.horizons.length; i += 1) {
    assert.ok(
      p.horizons[i].roughDrawdownPercent >=
        p.horizons[i - 1].roughDrawdownPercent - 0.001,
      `${p.symbol} drawdown monotonic`,
    );
  }
}
console.table(
  snap.picks.map((p) => ({
    rank: p.rank,
    symbol: p.symbol,
    hold: p.suggestedHold.label,
    "beatCash%": Math.round(p.suggestedHold.probabilityOfBeatingCashPercent),
    "ann%": Math.round(p.suggestedHold.annualizedReturnPercent),
    score: Number(p.score.toFixed(2)),
  })),
);
console.log("live compute ok.");
