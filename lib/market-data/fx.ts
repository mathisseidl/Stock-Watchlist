const CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart";

const YAHOO_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
};

/**
 * How to turn a listing's local trading currency into USD.
 *
 * Yahoo returns candles in each exchange's own currency — EUR on XETRA, JPY in
 * Tokyo, and GBp (pence, a hundredth of a pound — *not* GBP) on the LSE. The
 * rest of the app formats every figure as USD, so a non-USD series is converted
 * once, here, before it leaves the provider.
 *
 * The rate is today's spot, applied to the whole series rather than each
 * candle's own date: a five-year chart would otherwise need five years of FX
 * history, and the day-to-day drift is small next to the price moves the chart
 * exists to show. `from`/`rate` are carried through to the UI so a converted
 * chart can say so.
 */
export type UsdConversion = {
  /** Multiply a local-currency figure by this to get USD. */
  rate: number;
  /** The currency converted from, as Yahoo labelled it ("EUR", "GBp", "JPY"). */
  from: string;
};

/**
 * Currencies quoted in a sub-unit. The value is `1 / (sub-units per major
 * unit)`, so `GBp` (pence) values are divided by 100 to reach pounds before
 * the pound→USD rate is applied.
 */
const SUBUNIT_FACTOR: Record<string, { major: string; factor: number }> = {
  GBp: { major: "GBP", factor: 1 / 100 },
  GBX: { major: "GBP", factor: 1 / 100 },
  ZAc: { major: "ZAR", factor: 1 / 100 },
  ILA: { major: "ILS", factor: 1 / 100 },
};

/**
 * The conversion for `currency`, or `null` when values are already in USD (or
 * the rate could not be fetched — the caller then leaves the series untouched
 * rather than showing zeros).
 */
export async function usdConversion(
  currency: string | undefined,
  revalidateSeconds: number,
): Promise<UsdConversion | null> {
  if (!currency || currency === "USD") return null;

  const subunit = SUBUNIT_FACTOR[currency];
  const major = subunit?.major ?? currency;
  const subunitFactor = subunit?.factor ?? 1;

  // A sub-unit of the dollar itself (USX and the like): just the scale, no rate.
  if (major === "USD") return { rate: subunitFactor, from: currency };

  try {
    const res = await fetch(
      `${CHART_URL}/${major}USD=X?range=1d&interval=1d`,
      { headers: YAHOO_HEADERS, next: { revalidate: revalidateSeconds } },
    );
    if (!res.ok) return null;

    const data = (await res.json()) as {
      chart?: { result?: { meta?: { regularMarketPrice?: number } }[] };
    };
    const rate = data.chart?.result?.[0]?.meta?.regularMarketPrice;
    if (typeof rate !== "number" || !(rate > 0)) return null;

    return { rate: rate * subunitFactor, from: currency };
  } catch {
    return null;
  }
}
