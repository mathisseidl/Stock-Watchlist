"use client";

import { useQuery } from "@tanstack/react-query";
import type { CandleRange, CandleSeries } from "@/lib/market-data/types";

async function fetchCandles(
  symbol: string,
  range: CandleRange,
): Promise<CandleSeries> {
  const res = await fetch(`/api/candles/${symbol}?range=${range}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch candles for ${symbol}`);
  }
  return res.json();
}

export function useCandles(symbol: string, range: CandleRange) {
  return useQuery({
    queryKey: ["candles", symbol, range],
    queryFn: () => fetchCandles(symbol, range),
    enabled: symbol.length > 0,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}

/** Percentage change across the whole series (first vs last point). */
export function seriesChangePercent(series: CandleSeries | undefined): number {
  if (!series || series.points.length < 2) return 0;
  const first = series.points[0].value;
  const last = series.points[series.points.length - 1].value;
  if (first === 0) return 0;
  return ((last - first) / first) * 100;
}
