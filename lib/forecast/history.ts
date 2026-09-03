/**
 * Daily closing prices, straight from Yahoo's chart endpoint.
 *
 * The app's normal candle fetch collapses a long window down to weekly bars,
 * which is fine for drawing a line but throws away most of the sample the
 * forecast needs: volatility and drift estimates are only as good as the
 * number of observations behind them. This asks for daily bars over the whole
 * window instead — roughly 2,500 closes for a stock with ten years of trading
 * history.
 *
 * Two price series come back, and the difference between them matters.
 * `closes` is what the ticker actually printed, which is the number a reader
 * recognises and the one every technical indicator is conventionally read
 * from. `adjCloses` adds dividends back in, and that is the series the return,
 * drift and volatility estimates are built from — modelling a 3%-yielding
 * utility off its raw price quietly deletes a third of its long-run return.
 */

const CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart";

/** The benchmark every beta is measured against. */
export const BENCHMARK_SYMBOL = "^GSPC";

export type HistoryRange = "2y" | "5y" | "10y";

export type DailyHistory = {
  /** Raw closing prices, oldest first. */
  closes: number[];
  /** The same days with dividends reinvested — the total-return series. */
  adjCloses: number[];
  /** Unix seconds matching `closes`. */
  times: number[];
  /** Latest price the exchange has published. */
  price: number;
  /** Trading days actually returned. */
  length: number;
};

type YahooChartResponse = {
  chart: {
    result:
      | {
          timestamp?: number[];
          meta?: { regularMarketPrice?: number };
          indicators?: {
            quote?: { close?: (number | null)[] }[];
            adjclose?: { adjclose?: (number | null)[] }[];
          };
        }[]
      | null;
  };
};

export async function fetchDailyHistory(
  symbol: string,
  range: HistoryRange = "10y",
): Promise<DailyHistory> {
  // `events=div|split` is what makes Yahoo return the adjusted series next to
  // the raw one; without it `adjclose` is frequently omitted entirely.
  const url =
    `${CHART_URL}/${encodeURIComponent(symbol)}` +
    `?range=${range}&interval=1d&events=div%7Csplit`;

  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    },
    // Daily bars only change once a day, so an hour of cache costs nothing and
    // keeps a page of watchlist forecasts from hammering Yahoo.
    next: { revalidate: 3600 },
  });

  if (!res.ok) {
    throw new Error(`Yahoo history request failed: ${res.status} ${symbol}`);
  }

  const data = (await res.json()) as YahooChartResponse;
  const result = data.chart.result?.[0];
  const rawCloses = result?.indicators?.quote?.[0]?.close;
  const rawAdjusted = result?.indicators?.adjclose?.[0]?.adjclose;
  const rawTimes = result?.timestamp;

  if (!result || !rawCloses || !rawTimes) {
    return { closes: [], adjCloses: [], times: [], price: 0, length: 0 };
  }

  const closes: number[] = [];
  const adjCloses: number[] = [];
  const times: number[] = [];
  for (let index = 0; index < rawTimes.length; index += 1) {
    const close = rawCloses[index];
    // Yahoo leaves holidays and halted sessions as nulls; a zero would blow up
    // the log-return that follows.
    if (typeof close !== "number" || !Number.isFinite(close) || close <= 0) {
      continue;
    }
    const adjusted = rawAdjusted?.[index];
    closes.push(close);
    // Indices pay no dividends and some listings simply have no adjusted
    // series, so the raw close is the honest fallback rather than a gap.
    adjCloses.push(
      typeof adjusted === "number" && Number.isFinite(adjusted) && adjusted > 0
        ? adjusted
        : close,
    );
    times.push(rawTimes[index]);
  }

  const last = closes.length > 0 ? closes[closes.length - 1] : 0;
  return {
    closes,
    adjCloses,
    times,
    price: result.meta?.regularMarketPrice ?? last,
    length: closes.length,
  };
}

/* ------------------------------------------------------------------ */
/* Benchmark                                                           */
/* ------------------------------------------------------------------ */

type CacheEntry = { at: number; value: Promise<DailyHistory> };
const benchmarkCache = new Map<string, CacheEntry>();
const BENCHMARK_TTL_MS = 60 * 60 * 1000;

/**
 * The index series, memoised in-process for an hour.
 *
 * Next's own fetch cache already covers the request path, but the weekly
 * screen runs outside a request — it forecasts a whole universe from a plain
 * Node script, where `next: { revalidate }` is inert and every ticker would
 * otherwise re-download the same decade of S&P 500 closes.
 */
export function fetchBenchmarkHistory(
  range: HistoryRange = "10y",
): Promise<DailyHistory> {
  const cached = benchmarkCache.get(range);
  if (cached && Date.now() - cached.at < BENCHMARK_TTL_MS) return cached.value;

  const value = fetchDailyHistory(BENCHMARK_SYMBOL, range).catch((error) => {
    // A failed benchmark must not poison the cache for the next hour — beta
    // simply falls back to the volatility proxy for this run.
    benchmarkCache.delete(range);
    throw error;
  });
  benchmarkCache.set(range, { at: Date.now(), value });
  return value;
}

/**
 * Market log returns lined up index-for-index with a stock's own return
 * series, carrying NaN wherever the two did not trade the same day.
 *
 * Yahoo stamps a daily bar with the session's opening instant in exchange
 * time, so two US listings agree to the second — but a foreign listing, a
 * half-day or a one-sided holiday will not, and pairing by position instead of
 * by date would silently regress a stock's Tuesday on the market's Monday.
 * Matching on the calendar day is what keeps the beta honest.
 */
export function alignMarketReturns(
  stock: DailyHistory,
  market: DailyHistory,
): Float64Array | null {
  if (stock.length < 2 || market.length < 2) return null;

  const dayOf = (seconds: number) => Math.floor(seconds / 86_400);
  // Day index → position in the market series, so a lookup is O(1).
  const marketAt = new Map<number, number>();
  for (let index = 0; index < market.times.length; index += 1) {
    marketAt.set(dayOf(market.times[index]), index);
  }

  const aligned = new Float64Array(stock.length - 1).fill(NaN);
  let matched = 0;
  for (let index = 1; index < stock.length; index += 1) {
    const to = marketAt.get(dayOf(stock.times[index]));
    const from = marketAt.get(dayOf(stock.times[index - 1]));
    // Both ends of the stock's step must exist in the market series, and be
    // consecutive there too — otherwise the market return spans more days.
    if (to === undefined || from === undefined || to - from !== 1) continue;
    const previous = market.adjCloses[from];
    const current = market.adjCloses[to];
    if (previous > 0 && current > 0) {
      aligned[index - 1] = Math.log(current / previous);
      matched += 1;
    }
  }

  return matched >= 250 ? aligned : null;
}
