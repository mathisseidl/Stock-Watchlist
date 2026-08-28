"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Star, Check, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button, buttonVariants } from "@/components/ui/button";
import { CompanyLogo } from "@/components/stock/company-logo";
import { ChangeBadge } from "@/components/stock/change-badge";
import { MarketStatus } from "@/components/stock/market-status";
import { NewsList } from "@/components/stock/news-list";
import { NewsSummaryLink } from "@/components/stock/news-summary-dialog";
import { PriceChart } from "@/components/stock/price-chart";
import { RangeSelector } from "@/components/stock/range-selector";
import { useQuotes } from "@/hooks/use-quotes";
import { useProfile } from "@/hooks/use-profile";
import { useCandles, seriesChangePercent } from "@/hooks/use-candles";
import { useWatchlist } from "@/components/watchlist/watchlist-provider";
import { useUserSettings } from "@/components/settings/user-settings-provider";
import { cn } from "@/lib/utils";
import type { CandleRange } from "@/lib/market-data/types";

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="num mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

export function StockDetail({ symbol }: { symbol: string }) {
  const { settings, ready: settingsReady, money, percent } = useUserSettings();
  const signedMoney = (value: number) =>
    `${value >= 0 ? "+" : "−"}${money(Math.abs(value))}`;
  const [range, setRange] = useState<CandleRange | null>(null);
  const activeRange = range ?? (settingsReady ? settings.defaultRange : "1D");
  const { data: profile } = useProfile(symbol);
  const { quotes, isLoading } = useQuotes([symbol]);
  const { data: series, isLoading: chartLoading } = useCandles(symbol, activeRange);
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
        Back to My Stocks
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
            <Check className="size-4 text-gain" />
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
          <div className="flex items-end gap-3">
            <Skeleton className="h-10 w-40" />
            <Skeleton className="mb-1 h-5 w-20 rounded-full" />
          </div>
        ) : hasQuote ? (
          <div>
            <div className="flex flex-wrap items-end gap-3">
              <p className="num text-4xl font-semibold tracking-tight">
                {money(quote!.currentPrice)}
              </p>
              <div className="mb-1">
                <ChangeBadge changePercent={quote!.changePercent} />
              </div>
              <span
                className={
                  "num mb-1 text-sm " +
                  (quote!.change >= 0 ? "text-gain" : "text-loss")
                }
              >
                {signedMoney(quote!.change)} today
              </span>
            </div>
            <MarketStatus className="mt-1.5" />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No live quote is available for {symbol} on the current data plan.
          </p>
        )}

        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {rangePositive ? "Up" : "Down"}{" "}
            <span
              className={"num " + (rangePositive ? "text-gain" : "text-loss")}
            >
              {percent(rangeChange)}
            </span>{" "}
            over this period
          </p>
          <RangeSelector value={activeRange} onChange={setRange} size="sm" />
        </div>

        {chartLoading ? (
          <Skeleton className="h-80 w-full rounded-xl" />
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
          <StatTile label="Open" value={money(quote!.open)} />
          <StatTile label="Day High" value={money(quote!.high)} />
          <StatTile label="Day Low" value={money(quote!.low)} />
          <StatTile
            label="Prev Close"
            value={money(quote!.previousClose)}
          />
        </div>
      )}

      <Card className="gap-3 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">Worth reading</h3>
            <p className="text-sm text-muted-foreground">
              Three free-to-read stories from the last two days, and why each
              one matters.
            </p>
          </div>
          <NewsSummaryLink symbol={symbol} />
        </div>
        <NewsList symbol={symbol} />
      </Card>

      <Card className="flex-row flex-wrap items-center justify-between gap-3 p-6">
        <div>
          <h3 className="text-base font-semibold">
            Where could {symbol} go from here?
          </h3>
          <p className="text-sm text-muted-foreground">
            Run the forecast to see the best and worst realistic outcomes on a
            date you choose.
          </p>
        </div>
        <Link
          href={`/forecast?symbol=${encodeURIComponent(symbol)}`}
          className={cn(buttonVariants(), "rounded-full")}
        >
          <Sparkles className="size-4" />
          Forecast {symbol}
        </Link>
      </Card>
    </div>
  );
}
