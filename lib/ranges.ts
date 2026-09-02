import type { CandleRange } from "@/lib/market-data/types";

export const RANGES: { key: CandleRange; label: string }[] = [
  { key: "1D", label: "Day" },
  { key: "1W", label: "Week" },
  { key: "1M", label: "Month" },
  { key: "6M", label: "6M" },
  { key: "1Y", label: "Year" },
  { key: "5Y", label: "5Y" },
  { key: "ALL", label: "All" },
];

/**
 * How each range names its own period, for figures that describe it —
 * "Day High" on the day chart, "Month High" on the month.
 */
export const RANGE_PERIOD: Record<CandleRange, string> = {
  "1D": "Day",
  "1W": "Week",
  "1M": "Month",
  "6M": "6-Month",
  "1Y": "Year",
  "5Y": "5-Year",
  ALL: "All-Time",
};

/**
 * How far back each range looks, in seconds. `ALL` has no bound — callers
 * treat it as "everything available".
 */
export const RANGE_SECONDS: Record<CandleRange, number | null> = {
  "1D": 24 * 3600,
  "1W": 7 * 24 * 3600,
  "1M": 31 * 24 * 3600,
  "6M": 183 * 24 * 3600,
  "1Y": 366 * 24 * 3600,
  "5Y": 5 * 366 * 24 * 3600,
  ALL: null,
};
