import type { CandleRange } from "@/lib/market-data/types";

export const RANGES: { key: CandleRange; label: string }[] = [
  { key: "1D", label: "Day" },
  { key: "1W", label: "Week" },
  { key: "1M", label: "Month" },
  { key: "1Y", label: "Year" },
  { key: "5Y", label: "5Y" },
  { key: "ALL", label: "All" },
];

/**
 * How far back each range looks, in seconds. `ALL` has no bound — callers
 * treat it as "everything available".
 */
export const RANGE_SECONDS: Record<CandleRange, number | null> = {
  "1D": 24 * 3600,
  "1W": 7 * 24 * 3600,
  "1M": 31 * 24 * 3600,
  "1Y": 366 * 24 * 3600,
  "5Y": 5 * 366 * 24 * 3600,
  ALL: null,
};
