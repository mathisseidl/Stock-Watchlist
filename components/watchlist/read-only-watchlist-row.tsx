"use client";

import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { CompanyLogo } from "@/components/stock/company-logo";
import { ChangeBadge } from "@/components/stock/change-badge";
import { Sparkline } from "@/components/stock/sparkline";
import { useCandles, seriesChangePercent } from "@/hooks/use-candles";
import { useUserSettings } from "@/components/settings/user-settings-provider";
import type { CandleRange } from "@/lib/market-data/types";
import type { WatchlistItem } from "@/lib/mock-data";

export function ReadOnlyWatchlistRow({
  item,
  range,
}: {
  item: WatchlistItem;
  range: CandleRange;
}) {
  const { data: series, isLoading, isError } = useCandles(item.symbol, range);
  const { money } = useUserSettings();

  const changePercent = seriesChangePercent(series);
  const positive = changePercent >= 0;
  const price = series?.price ?? 0;

  return (
    <Link
      href={`/stock/${item.symbol}`}
      className="flex items-center gap-4 rounded-xl border border-border bg-card px-4 py-3 transition-opacity hover:opacity-80"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <CompanyLogo symbol={item.symbol} size="sm" />
        <div className="min-w-0">
          <p className="text-sm font-semibold">{item.symbol}</p>
          <p className="truncate text-xs text-muted-foreground">{item.name}</p>
        </div>
      </div>

      <div className="hidden sm:block">
        {series && series.points.length > 1 && (
          <Sparkline points={series.points} positive={positive} />
        )}
      </div>

      <div className="flex w-28 flex-col items-end">
        {isLoading ? (
          <Skeleton className="h-4 w-16" />
        ) : isError || price === 0 ? (
          <span className="text-xs text-muted-foreground">No data</span>
        ) : (
          <>
            <p className="num text-sm font-semibold">{money(price)}</p>
            <ChangeBadge changePercent={changePercent} />
          </>
        )}
      </div>
    </Link>
  );
}
