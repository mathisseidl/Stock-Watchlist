"use client";

import Link from "next/link";
import { ChevronUp, ChevronDown, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { CompanyLogo } from "@/components/stock/company-logo";
import { ChangeBadge } from "@/components/stock/change-badge";
import { Sparkline } from "@/components/stock/sparkline";
import { useCandles, seriesChangePercent } from "@/hooks/use-candles";
import { useWatchlist } from "@/components/watchlist/watchlist-provider";
import type { CandleRange } from "@/lib/market-data/types";
import type { WatchlistItem } from "@/lib/mock-data";

export function WatchlistRow({
  item,
  range,
  isFirst,
  isLast,
}: {
  item: WatchlistItem;
  range: CandleRange;
  isFirst: boolean;
  isLast: boolean;
}) {
  const { remove, move } = useWatchlist();
  const { data: series, isLoading, isError } = useCandles(item.symbol, range);

  const changePercent = seriesChangePercent(series);
  const positive = changePercent >= 0;
  const price = series?.price ?? 0;

  return (
    <div className="flex items-center gap-4 rounded-xl border border-border bg-card px-4 py-3">
      <div className="flex flex-col">
        <button
          type="button"
          aria-label={`Move ${item.symbol} up`}
          disabled={isFirst}
          onClick={() => move(item.symbol, "up")}
          className="text-muted-foreground hover:text-foreground disabled:opacity-30"
        >
          <ChevronUp className="size-4" />
        </button>
        <button
          type="button"
          aria-label={`Move ${item.symbol} down`}
          disabled={isLast}
          onClick={() => move(item.symbol, "down")}
          className="text-muted-foreground hover:text-foreground disabled:opacity-30"
        >
          <ChevronDown className="size-4" />
        </button>
      </div>

      <Link
        href={`/stock/${item.symbol}`}
        className="flex min-w-0 flex-1 items-center gap-3 transition-opacity hover:opacity-70"
      >
        <CompanyLogo symbol={item.symbol} size="sm" />
        <div className="min-w-0">
          <p className="text-sm font-semibold">{item.symbol}</p>
          <p className="truncate text-xs text-muted-foreground">{item.name}</p>
        </div>
      </Link>

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
            <p className="num text-sm font-semibold">${price.toFixed(2)}</p>
            <ChangeBadge changePercent={changePercent} />
          </>
        )}
      </div>

      <button
        type="button"
        aria-label={`Remove ${item.symbol}`}
        onClick={() => remove(item.symbol)}
        className="text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="size-4" />
      </button>
    </div>
  );
}
