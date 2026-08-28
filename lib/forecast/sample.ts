/**
 * The one forecast anybody can run without paying.
 *
 * The S&P 500 is the right thing to give away: it is the index nearly every
 * reader already has a feel for, so the bands the engine draws can be sanity-
 * checked against their own intuition before they decide whether the same
 * machinery is worth pointing at a stock they actually hold.
 */
export const SAMPLE_FORECAST = {
  symbol: "^GSPC",
  name: "S&P 500",
} as const;

export function isSampleSymbol(symbol: string): boolean {
  return symbol.trim().toUpperCase() === SAMPLE_FORECAST.symbol;
}
