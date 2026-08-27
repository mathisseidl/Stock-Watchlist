import type { CandleRange } from "@/lib/market-data/types";

export const RANGES: { key: CandleRange; label: string }[] = [
  { key: "1D", label: "Day" },
  { key: "1W", label: "Week" },
  { key: "1M", label: "Month" },
  { key: "1Y", label: "Year" },
  { key: "5Y", label: "5Y" },
  { key: "ALL", label: "All" },
];
