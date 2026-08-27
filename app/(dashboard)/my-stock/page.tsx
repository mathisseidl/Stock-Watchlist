"use client";

import { useState } from "react";
import Link from "next/link";
import { Star } from "lucide-react";
import { RangeSelector } from "@/components/stock/range-selector";
import { WatchlistRow } from "@/components/watchlist/watchlist-row";
import { useWatchlist } from "@/components/watchlist/watchlist-provider";
import type { CandleRange } from "@/lib/market-data/types";

export default function MyStockPage() {
  const { items, ready, isGuest } = useWatchlist();
  const [range, setRange] = useState<CandleRange>("1D");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">My Stock</h1>
          <p className="text-sm text-muted-foreground">
            Your watchlist — search any stock and add it here.
          </p>
        </div>
        <RangeSelector value={range} onChange={setRange} />
      </div>

      {isGuest && (
        <div className="flex flex-col gap-2 rounded-xl border border-primary/30 bg-accent px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="text-accent-foreground">
            You&apos;re browsing as a guest — this watchlist won&apos;t be saved.
          </span>
          <Link href="/account" className="font-semibold text-primary hover:underline">
            Sign up to save it →
          </Link>
        </div>
      )}

      {ready && items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-16 text-center">
          <Star className="size-6 text-muted-foreground" />
          <p className="text-sm font-medium">Your watchlist is empty</p>
          <p className="text-sm text-muted-foreground">
            Use the search box up top to find a stock and add it.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item, index) => (
            <WatchlistRow
              key={item.symbol}
              item={item}
              range={range}
              isFirst={index === 0}
              isLast={index === items.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
