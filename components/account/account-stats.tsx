"use client";

import Link from "next/link";
import { useQueries } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChangeBadge } from "@/components/stock/change-badge";
import { useWatchlist } from "@/components/watchlist/watchlist-provider";
import { useUserSettings } from "@/components/settings/user-settings-provider";
import { seriesChangePercent } from "@/hooks/use-candles";
import type { CandleSeries } from "@/lib/market-data/types";

async function fetchCandles(symbol: string): Promise<CandleSeries> {
  const res = await fetch(`/api/candles/${symbol}?range=1M`);
  if (!res.ok) throw new Error("Failed to load candles");
  return res.json();
}

function Tile({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

/** Watchlist performance over the last month, from data the app already has. */
export function AccountStats() {
  const { items, ready } = useWatchlist();
  const { percent } = useUserSettings();

  const queries = useQueries({
    queries: items.map((item) => ({
      queryKey: ["candles", item.symbol, "1M"],
      queryFn: () => fetchCandles(item.symbol),
      enabled: items.length > 0,
      staleTime: 5 * 60 * 1000,
    })),
  });

  const loading = queries.some((query) => query.isLoading);

  const performances = items
    .map((item, index) => {
      const series = queries[index]?.data;
      if (!series || series.points.length < 2) return null;
      return { symbol: item.symbol, change: seriesChangePercent(series) };
    })
    .filter((entry): entry is { symbol: string; change: number } =>
      Boolean(entry),
    );

  const best = performances.reduce<{ symbol: string; change: number } | null>(
    (top, entry) => (!top || entry.change > top.change ? entry : top),
    null,
  );
  const worst = performances.reduce<{ symbol: string; change: number } | null>(
    (low, entry) => (!low || entry.change < low.change ? entry : low),
    null,
  );
  const average =
    performances.length > 0
      ? performances.reduce((sum, entry) => sum + entry.change, 0) /
        performances.length
      : 0;

  if (ready && items.length === 0) {
    return (
      <Card className="gap-2 p-6">
        <h3 className="text-base font-semibold">Your stats</h3>
        <p className="text-sm text-muted-foreground">
          Add a few stocks to your watchlist and this fills in with how they
          have done.
        </p>
      </Card>
    );
  }

  return (
    <Card className="gap-4 p-6">
      <div>
        <h3 className="text-base font-semibold">Your stats</h3>
        <p className="text-sm text-muted-foreground">
          Your watchlist over the last month.
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile label="Stocks tracked">
            <p className="num text-lg font-semibold">{items.length}</p>
          </Tile>

          <Tile label="Best performer">
            {best ? (
              <Link
                href={`/stock/${best.symbol}`}
                className="flex flex-col gap-1 hover:opacity-70"
              >
                <span className="text-lg font-semibold">{best.symbol}</span>
                <ChangeBadge changePercent={best.change} className="w-fit" />
              </Link>
            ) : (
              <p className="text-sm text-muted-foreground">—</p>
            )}
          </Tile>

          <Tile label="Weakest">
            {worst ? (
              <Link
                href={`/stock/${worst.symbol}`}
                className="flex flex-col gap-1 hover:opacity-70"
              >
                <span className="text-lg font-semibold">{worst.symbol}</span>
                <ChangeBadge changePercent={worst.change} className="w-fit" />
              </Link>
            ) : (
              <p className="text-sm text-muted-foreground">—</p>
            )}
          </Tile>

          <Tile label="Watchlist average">
            <p
              className={
                "num text-lg font-semibold " +
                (average >= 0 ? "text-gain" : "text-loss")
              }
            >
              {average >= 0 ? "+" : "−"}
              {percent(average)}
            </p>
          </Tile>
        </div>
      )}
    </Card>
  );
}
