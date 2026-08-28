"use client";

import Link from "next/link";
import { ChevronUp, ChevronDown, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { CompanyLogo } from "@/components/stock/company-logo";
import { ChangeBadge } from "@/components/stock/change-badge";
import { Sparkline } from "@/components/stock/sparkline";
import { NewsSummaryLink } from "@/components/stock/news-summary-dialog";
import { useCandles, seriesChangePercent } from "@/hooks/use-candles";
import { useWatchlist } from "@/components/watchlist/watchlist-provider";
import { useUserSettings } from "@/components/settings/user-settings-provider";
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
  const { money } = useUserSettings();
  const { data: series, isLoading, isError } = useCandles(item.symbol, range);

  const changePercent = seriesChangePercent(series);
  const positive = changePercent >= 0;
  const price = series?.price ?? 0;

  return (
    // Tighter gaps and padding below `sm`: on a 375px phone the fixed columns
    // left barely 100px for the name, which the "News Summary" link no longer
    // fits into.
    <div className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-3 sm:gap-4 sm:px-4">
      <div className="flex flex-col">
        <button
          type="button"
          aria-label={`Move ${item.symbol} up`}
          disabled={isFirst}
          onClick={() => move(item.symbol, "up")}
          className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
        >
          <ChevronUp className="size-4" />
        </button>
        <button
          type="button"
          aria-label={`Move ${item.symbol} down`}
          disabled={isLast}
          onClick={() => move(item.symbol, "down")}
          className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
        >
          <ChevronDown className="size-4" />
        </button>
      </div>

      {/* The logo and the name link through to the stock; the summary link
          opens a panel, so it sits outside the anchor rather than inside it. */}
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Link
          href={`/stock/${item.symbol}`}
          aria-label={`Open ${item.symbol}`}
          className="shrink-0 transition-opacity hover:opacity-70"
        >
          <CompanyLogo symbol={item.symbol} size="sm" />
        </Link>
        <div className="min-w-0">
          <Link
            href={`/stock/${item.symbol}`}
            className="block min-w-0 transition-opacity hover:opacity-70"
          >
            <p className="text-sm font-semibold">{item.symbol}</p>
            <p className="truncate text-xs text-muted-foreground">
              {item.name}
            </p>
          </Link>
          <NewsSummaryLink
            symbol={item.symbol}
            name={item.name}
            className="mt-1"
          />
        </div>
      </div>

      <div className="hidden sm:block">
        {series && series.points.length > 1 && (
          <Sparkline points={series.points} positive={positive} />
        )}
      </div>

      <div className="flex w-24 flex-col items-end sm:w-28">
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

      <button
        type="button"
        aria-label={`Remove ${item.symbol}`}
        onClick={() => remove(item.symbol)}
        className="p-1 text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="size-4" />
      </button>
    </div>
  );
}
