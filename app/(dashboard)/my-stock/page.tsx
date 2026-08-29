"use client";

import { useState } from "react";
import Link from "next/link";
import { Star } from "lucide-react";
import { RangeSelector } from "@/components/stock/range-selector";
import { WatchlistList } from "@/components/watchlist/watchlist-list";
import { AlertList } from "@/components/stock/alert-list";
import { WatchlistStats } from "@/components/watchlist/watchlist-stats";
import { useUserSettings } from "@/components/settings/user-settings-provider";
import { useWatchlist } from "@/components/watchlist/watchlist-provider";
import type { CandleRange } from "@/lib/market-data/types";

export default function MyStockPage() {
  const { items, ready, isGuest, error } = useWatchlist();
  const { settings, ready: settingsReady } = useUserSettings();
  const [range, setRange] = useState<CandleRange | null>(null);

  // Falls back to the user's preferred range until they pick one by hand.
  const activeRange = range ?? (settingsReady ? settings.defaultRange : "1D");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">My Stocks</h1>
        <p className="text-sm text-muted-foreground">
          Your watchlist — search any stock and add it here.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
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
          {/* One range drives both the rows below and the summary further
              down, so the two can never disagree about the period. */}
          <div className="flex justify-end">
            <RangeSelector value={activeRange} onChange={setRange} size="sm" />
          </div>
          <WatchlistList range={activeRange} />
        </div>
      )}

      {isGuest && (
        <div className="flex flex-col gap-2 rounded-xl border border-primary/30 bg-accent px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="text-accent-foreground">
            You&apos;re not signed. This watchlist is saved on this local device
            only.
          </span>
          <Link
            href="/account"
            className="font-semibold text-primary hover:underline"
          >
            Sign in for free →
          </Link>
        </div>
      )}

      {ready && items.length > 0 && <WatchlistStats range={activeRange} />}

      <AlertList />
    </div>
  );
}
