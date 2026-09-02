"use client";

import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { PriceChart } from "@/components/stock/price-chart";
import { RangeSelector } from "@/components/stock/range-selector";
import { useCandles, seriesChangePercent } from "@/hooks/use-candles";
import { useUserSettings } from "@/components/settings/user-settings-provider";
import type { CandleRange } from "@/lib/market-data/types";

/**
 * The price-history block from the stock page — the "Up X% over this period"
 * line, the range tabs and the chart itself, plus the converted-to-USD note
 * for a foreign listing. Pulled out so the forecast can show the exact same
 * chart under its result.
 *
 * Range is uncontrolled by default (its own state, starting on the reader's
 * default range). The stock page passes `range`/`onRangeChange` so its stat
 * tiles stay on the same period as the chart — both `useCandles` calls share
 * one request through the query cache.
 */
export function PriceHistory({
  symbol,
  range: controlledRange,
  onRangeChange,
}: {
  symbol: string;
  range?: CandleRange;
  onRangeChange?: (range: CandleRange) => void;
}) {
  const { settings, ready, percent, money } = useUserSettings();
  const [ownRange, setOwnRange] = useState<CandleRange | null>(null);
  const activeRange =
    controlledRange ?? ownRange ?? (ready ? settings.defaultRange : "1D");

  const changeRange = (next: CandleRange) => {
    setOwnRange(next);
    onRangeChange?.(next);
  };

  const { data: series, isLoading } = useCandles(symbol, activeRange);
  const rangeChange = seriesChangePercent(series);
  const rangePositive = rangeChange >= 0;

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {rangePositive ? "Up" : "Down"}{" "}
          <span className={"num " + (rangePositive ? "text-gain" : "text-loss")}>
            {percent(rangeChange)}
          </span>{" "}
          over this period
        </p>
        <RangeSelector value={activeRange} onChange={changeRange} size="sm" />
      </div>

      {isLoading ? (
        <Skeleton className="h-80 w-full rounded-xl" />
      ) : series && series.points.length > 1 ? (
        <PriceChart
          points={series.points}
          positive={rangePositive}
          session={series.session}
          range={activeRange}
        />
      ) : (
        <div className="flex h-80 items-center justify-center text-sm text-muted-foreground">
          No chart data available for {symbol}.
        </div>
      )}

      {series?.convertedFrom && (
        <p className="text-xs text-muted-foreground">
          {symbol} trades in {series.convertedFrom}. Every figure here is
          converted to USD at today&rsquo;s rate
          {series.convertedRate && !/[a-z]/.test(series.convertedFrom)
            ? ` (1 ${series.convertedFrom} = ${money(series.convertedRate)})`
            : ""}
          , so a run of older prices is valued at the current rate rather than
          the rate back then.
        </p>
      )}
    </>
  );
}
