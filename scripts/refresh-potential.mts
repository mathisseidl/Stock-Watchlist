/**
 * Recompute the weekly "Potential" screen and store it.
 *
 * Run by hand for now:
 *   npm run refresh:potential            # seed today
 *   npm run refresh:potential 2026-09-07 # pin the as-of date
 *
 * Stage 2 wires this same script into a Monday GitHub Action. It runs the full
 * forecast engine over the universe (a few minutes of CPU), so it is a script,
 * not a serverless route.
 */
import { loadEnvFile } from "node:process";
import { computeSnapshot } from "@/lib/potential/compute";
import { writeSnapshot } from "@/lib/potential/store";

try {
  loadEnvFile(".env.local");
} catch {
  // Fall back to whatever is already in the environment (CI secrets).
}

async function main() {
  // `|| undefined` so an empty arg (a schedule-triggered CI run passes "")
  // falls back to today rather than becoming a blank seed date.
  const asOf = process.argv[2] || undefined;
  console.log(`Computing Potential snapshot${asOf ? ` as of ${asOf}` : ""}…`);
  const started = Date.now();

  const snapshot = await computeSnapshot({
    asOf,
    onProgress: (m) => console.log(`  ${m}`),
  });

  console.log(`\nDone in ${Math.round((Date.now() - started) / 1000)}s.\n`);
  console.table(
    snapshot.picks.map((p) => ({
      rank: p.rank,
      symbol: p.symbol,
      hold: p.suggestedHold.label,
      "beatCash%": Math.round(p.suggestedHold.probabilityOfBeatingCashPercent),
      "ann%": Math.round(p.suggestedHold.annualizedReturnPercent),
      "roughDip%": Math.round(p.suggestedHold.expectedDrawdownPercent),
      score: Number(p.score.toFixed(2)),
    })),
  );
  if (snapshot.runnersUp.length) {
    console.log(
      "runners-up:",
      snapshot.runnersUp.map((r) => r.symbol).join(", "),
    );
  }
  for (const s of snapshot.skipped) {
    console.log(`skipped ${s.symbol} — ${s.reason}`);
  }

  await writeSnapshot(snapshot);
  console.log(`\nSaved snapshot for ${snapshot.isoWeek}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
