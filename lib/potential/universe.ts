/**
 * The Potential universe — the fixed list of companies the weekly screen is
 * allowed to choose from.
 *
 * This is the ONE place a human decides what is eligible. The forecast only
 * *orders* this list; it never adds to it. Keeping the list short, liquid and
 * spread across sectors is the editorial judgement — the screen's job is just
 * to say which few look best on the odds this week.
 *
 * Rules of thumb when editing:
 * - Large, heavily traded US listings. Yahoo needs `BRK-B`, not `BRK.B`, so
 *   avoid dotted tickers.
 * - Enough history to model — anything with under a year of daily closes is
 *   dropped by the engine and shows up in the snapshot's `skipped` list.
 * - Bump `UNIVERSE_VERSION` whenever the list changes so a stale weekly
 *   snapshot is visibly out of date.
 *
 * TODO(mathis): replace this placeholder with your own list.
 */

export type PotentialTicker = {
  symbol: string;
  name: string;
  sector: string;
};

export const POTENTIAL_UNIVERSE: PotentialTicker[] = [
  { symbol: "AAPL", name: "Apple", sector: "Technology" },
  { symbol: "MSFT", name: "Microsoft", sector: "Technology" },
  { symbol: "NVDA", name: "NVIDIA", sector: "Technology" },
  { symbol: "GOOGL", name: "Alphabet", sector: "Communication Services" },
  { symbol: "AMZN", name: "Amazon", sector: "Consumer Discretionary" },
  { symbol: "COST", name: "Costco", sector: "Consumer Staples" },
  { symbol: "KO", name: "Coca-Cola", sector: "Consumer Staples" },
  { symbol: "UNH", name: "UnitedHealth", sector: "Health Care" },
  { symbol: "LLY", name: "Eli Lilly", sector: "Health Care" },
  { symbol: "JPM", name: "JPMorgan Chase", sector: "Financials" },
  { symbol: "V", name: "Visa", sector: "Financials" },
  { symbol: "CAT", name: "Caterpillar", sector: "Industrials" },
  { symbol: "XOM", name: "Exxon Mobil", sector: "Energy" },
];

/** Bump on every edit to `POTENTIAL_UNIVERSE`. */
export const UNIVERSE_VERSION = 1;
