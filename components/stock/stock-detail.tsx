"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Star, Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CompanyLogo } from "@/components/stock/company-logo";
import { ChangeBadge } from "@/components/stock/change-badge";
import { NewsList } from "@/components/stock/news-list";
import { PriceChart } from "@/components/stock/price-chart";
import { RangeSelector } from "@/components/stock/range-selector";
import { useQuotes } from "@/hooks/use-quotes";
import { useProfile } from "@/hooks/use-profile";
import { useCandles, seriesChangePercent } from "@/hooks/use-candles";
import { useWatchlist } from "@/components/watchlist/watchlist-provider";
import type { CandleRange } from "@/lib/market-data/types";

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

export function StockDetail({ symbol }: { symbol: string }) {
  const [range, setRange] = useState<CandleRange>("1D");
  const { data: profile } = useProfile(symbol);
  const { quotes, isLoading } = useQuotes([symbol]);
  const { data: series, isLoading: chartLoading } = useCandles(symbol, range);
  const { has, add, remove } = useWatchlist();

  const quote = quotes[symbol];
  const hasQuote = Boolean(quote && quote.currentPrice > 0);

  const rangeChange = seriesChangePercent(series);
  const rangePositive = rangeChange >= 0;
  const inWatchlist = has(symbol);

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/my-stock"
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to My Stock
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <CompanyLogo symbol={symbol} size="lg" />
          <div>
            <h1 className="text-2xl font-semibold">{symbol}</h1>
            <p className="text-sm text-muted-foreground">
              {profile?.name ?? "—"}
              {profile?.exchange ? ` · ${profile.exchange}` : ""}
            </p>
          </div>
        </div>
        {inWatchlist ? (
          <Button
            variant="outline"
            className="rounded-full"
            onClick={() => remove(symbol)}
          >
            <Check className="size-4 text-emerald-600" />
            In watchlist
          </Button>
        ) : (
          <Button
            className="rounded-full"
            onClick={() => add({ symbol, name: profile?.name ?? symbol })}
          >
            <Star className="size-4" />
            Add to watchlist
          </Button>
        )}
      </div>

      <Card className="gap-4 p-6">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading live quote…</p>
        ) : hasQuote ? (
          <div className="flex items-end gap-3">
            <p className="text-4xl font-semibold tracking-tight">
              ${quote!.currentPrice.toFixed(2)}
            </p>
            <div className="mb-1">
              <ChangeBadge changePercent={quote!.changePercent} />
            </div>
            <span
              className={
                "mb-1 text-sm " +
                (quote!.change >= 0 ? "text-emerald-600" : "text-red-500")
              }
            >
              {quote!.change >= 0 ? "+" : ""}
              {quote!.change.toFixed(2)} today
            </span>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No live quote is available for {symbol} on the current data plan.
          </p>
        )}

        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {rangePositive ? "Up" : "Down"}{" "}
            <span className={rangePositive ? "text-emerald-600" : "text-red-500"}>
              {Math.abs(rangeChange).toFixed(2)}%
            </span>{" "}
            over this period
          </p>
          <RangeSelector value={range} onChange={setRange} size="sm" />
        </div>

        {chartLoading ? (
          <div className="flex h-80 items-center justify-center text-sm text-muted-foreground">
            Loading chart…
          </div>
        ) : series && series.points.length > 1 ? (
          <PriceChart points={series.points} positive={rangePositive} />
        ) : (
          <div className="flex h-80 items-center justify-center text-sm text-muted-foreground">
            No chart data available for {symbol}.
          </div>
        )}
      </Card>

      {hasQuote && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Open" value={`$${quote!.open.toFixed(2)}`} />
          <StatTile label="Day High" value={`$${quote!.high.toFixed(2)}`} />
          <StatTile label="Day Low" value={`$${quote!.low.toFixed(2)}`} />
          <StatTile
            label="Prev Close"
            value={`$${quote!.previousClose.toFixed(2)}`}
          />
        </div>
      )}

      <Card className="gap-3 p-6">
        <h3 className="text-base font-semibold">Latest News</h3>
        <NewsList symbol={symbol} />
      </Card>
    </div>
  );
}
