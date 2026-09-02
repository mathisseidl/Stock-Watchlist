import {
  buildForecast,
  NotEnoughHistoryError,
  SIMULATIONS_PER_RUN,
  type ForecastResult,
} from "@/lib/forecast/engine";
import { fetchDailyHistory } from "@/lib/forecast/history";
import { fetchHeadlines } from "@/lib/potential/news";
import { rankUniverse, type HorizonScore, type RankEntry } from "@/lib/potential/score";
import { holdPhrase, whyInFocus } from "@/lib/potential/read";
import { isoWeek } from "@/lib/potential/week";
import {
  POTENTIAL_HORIZONS_DAYS,
  type PotentialHorizon,
  type PotentialPick,
  type PotentialSnapshot,
} from "@/lib/potential/types";
import {
  POTENTIAL_UNIVERSE,
  UNIVERSE_VERSION,
  type PotentialTicker,
} from "@/lib/potential/universe";

/** Simulations run in dollars; amount only scales outcomes, so any positive value works. */
const SCORING_AMOUNT = 1000;
const PICK_COUNT = 5;

function toHorizon(h: HorizonScore): PotentialHorizon {
  return {
    horizonDays: h.horizonDays,
    label: holdPhrase(h.horizonDays),
    probabilityOfProfitPercent: h.probabilityOfProfitPercent,
    probabilityOfBeatingCashPercent: h.probabilityOfBeatingCashPercent,
    medianAnnualizedPercent: h.medianAnnualizedPercent,
    roughDrawdownPercent: h.roughDrawdownPercent,
  };
}

/** Run one stock through every horizon. History is fetched once and reused. */
async function forecastAllHorizons(
  ticker: PotentialTicker,
  asOf: string,
): Promise<RankEntry> {
  try {
    const history = await fetchDailyHistory(ticker.symbol, "5y");
    if (history.length < 200) {
      return { ticker, error: "under a year of price history" };
    }

    const results: ForecastResult[] = [];
    for (const horizonDays of POTENTIAL_HORIZONS_DAYS) {
      results.push(
        await buildForecast(
          {
            symbol: ticker.symbol,
            name: ticker.name,
            amount: SCORING_AMOUNT,
            horizonDays,
          },
          { history, asOf },
        ),
      );
    }
    return { ticker, results };
  } catch (error) {
    if (error instanceof NotEnoughHistoryError) {
      return { ticker, error: "under a year of price history" };
    }
    return {
      ticker,
      error: error instanceof Error ? error.message : "could not be simulated",
    };
  }
}

export type ComputeOptions = {
  /** UTC date (YYYY-MM-DD) to seed every simulation from. Defaults to today. */
  asOf?: string;
  /** Override the universe (tests). */
  universe?: PotentialTicker[];
  /** Log progress lines (the refresh script passes `console.log`). */
  onProgress?: (message: string) => void;
};

/**
 * One full weekly run of the screen: forecast the whole universe, rank it, and
 * assemble the snapshot. Pure of storage — the caller persists the result.
 */
export async function computeSnapshot(
  opts: ComputeOptions = {},
): Promise<PotentialSnapshot> {
  const now = new Date();
  const asOf = opts.asOf ?? now.toISOString().slice(0, 10);
  const universe = opts.universe ?? POTENTIAL_UNIVERSE;
  const log = opts.onProgress ?? (() => {});

  const entries: RankEntry[] = [];
  for (const ticker of universe) {
    log(`forecasting ${ticker.symbol}…`);
    entries.push(await forecastAllHorizons(ticker, asOf));
  }

  const { ranked, skipped } = rankUniverse(entries);
  const top = ranked.slice(0, PICK_COUNT);

  const picks: PotentialPick[] = [];
  for (let i = 0; i < top.length; i += 1) {
    const { ticker, scored, atHold } = top[i];
    log(`headlines for ${ticker.symbol}…`);
    const headlines = await fetchHeadlines(ticker.symbol, ticker.name);

    picks.push({
      rank: i + 1,
      symbol: ticker.symbol,
      name: ticker.name,
      sector: ticker.sector,
      price: atHold.price,
      score: scored.score,
      scoreBreakdown: scored.breakdown,
      suggestedHold: {
        horizonDays: scored.suggestedHold.horizonDays,
        label: holdPhrase(scored.suggestedHold.horizonDays),
        probabilityOfProfitPercent:
          scored.suggestedHold.probabilityOfProfitPercent,
        probabilityOfBeatingCashPercent:
          scored.suggestedHold.probabilityOfBeatingCashPercent,
        expectedDrawdownPercent: scored.suggestedHold.roughDrawdownPercent,
        annualizedReturnPercent: scored.suggestedHold.medianAnnualizedPercent,
      },
      horizons: scored.horizons.map(toHorizon),
      whyInFocus: whyInFocus(atHold.drivers, scored.suggestedHold),
      drivers: atHold.drivers,
      headlines: headlines.length > 0 ? headlines : undefined,
    });
  }

  return {
    isoWeek: isoWeek(now),
    asOfDate: asOf,
    generatedAt: now.toISOString(),
    universeVersion: UNIVERSE_VERSION,
    universeCount: universe.length,
    simulations: SIMULATIONS_PER_RUN,
    picks,
    runnersUp: ranked.slice(PICK_COUNT).map((r) => ({
      symbol: r.ticker.symbol,
      name: r.ticker.name,
      score: r.scored.score,
    })),
    skipped: skipped.map((s) => ({
      symbol: s.ticker.symbol,
      name: s.ticker.name,
      reason: s.reason,
    })),
  };
}
