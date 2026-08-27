"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { RangeSelector } from "@/components/stock/range-selector";
import { ReadOnlyWatchlistRow } from "@/components/watchlist/read-only-watchlist-row";
import { createClient } from "@/lib/supabase/client";
import type { CandleRange } from "@/lib/market-data/types";
import type { WatchlistItem } from "@/lib/mock-data";

type LoadState = "loading" | "ok" | "not-found" | "not-allowed";

export function FriendWatchlist({ username }: { username: string }) {
  const [supabase] = useState(() => createClient());
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [range, setRange] = useState<CandleRange>("1D");

  useEffect(() => {
    let active = true;
    async function load() {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", username.toLowerCase())
        .maybeSingle();
      if (!active) return;
      if (!profile) {
        setState("not-found");
        return;
      }
      // RLS only returns these rows if the viewer is this user or their friend.
      const { data } = await supabase
        .from("watchlist_items")
        .select("symbol, name, position")
        .eq("user_id", profile.id)
        .order("position", { ascending: true });
      if (!active) return;
      if (!data || data.length === 0) {
        // Could be an empty list or no permission; both show as nothing to see.
        setItems([]);
        setState("ok");
        return;
      }
      setItems(data.map((row) => ({ symbol: row.symbol, name: row.name })));
      setState("ok");
    }
    load();
    return () => {
      active = false;
    };
  }, [supabase, username]);

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/community"
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to Community
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">@{username}</h1>
          <p className="text-sm text-muted-foreground">
            Your friend&apos;s watchlist
          </p>
        </div>
        <RangeSelector value={range} onChange={setRange} />
      </div>

      {state === "loading" ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : state === "not-found" ? (
        <p className="text-sm text-muted-foreground">
          No user found with that username.
        </p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing to show — they haven&apos;t added any stocks, or you&apos;re
          not friends yet.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <ReadOnlyWatchlistRow key={item.symbol} item={item} range={range} />
          ))}
        </div>
      )}
    </div>
  );
}
