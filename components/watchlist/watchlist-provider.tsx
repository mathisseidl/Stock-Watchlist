"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { createClient } from "@/lib/supabase/client";
import type { WatchlistItem } from "@/lib/mock-data";

type WatchlistContextValue = {
  items: WatchlistItem[];
  has: (symbol: string) => boolean;
  add: (item: WatchlistItem) => void;
  remove: (symbol: string) => void;
  move: (symbol: string, direction: "up" | "down") => void;
  ready: boolean;
};

const WatchlistContext = createContext<WatchlistContextValue | null>(null);

export function WatchlistProvider({ children }: { children: React.ReactNode }) {
  const [supabase] = useState(() => createClient());
  const [userId, setUserId] = useState<string | null>(null);
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [ready, setReady] = useState(false);

  // Load the signed-in user's watchlist from Supabase (RLS scopes it to them).
  useEffect(() => {
    let active = true;
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!active) return;
      if (!user) {
        setReady(true);
        return;
      }
      setUserId(user.id);
      const { data } = await supabase
        .from("watchlist_items")
        .select("symbol, name, position")
        .eq("user_id", user.id)
        .order("position", { ascending: true });
      if (!active) return;
      setItems(
        (data ?? []).map((row) => ({ symbol: row.symbol, name: row.name })),
      );
      setReady(true);
    }
    load();
    return () => {
      active = false;
    };
  }, [supabase]);

  const has = useCallback(
    (symbol: string) => items.some((item) => item.symbol === symbol),
    [items],
  );

  const add = useCallback(
    (item: WatchlistItem) => {
      if (!userId || items.some((e) => e.symbol === item.symbol)) return;
      const position = items.length;
      setItems((prev) => [...prev, item]);
      void supabase.from("watchlist_items").insert({
        user_id: userId,
        symbol: item.symbol,
        name: item.name,
        position,
      });
    },
    [items, supabase, userId],
  );

  const remove = useCallback(
    (symbol: string) => {
      if (!userId) return;
      setItems((prev) => prev.filter((item) => item.symbol !== symbol));
      void supabase
        .from("watchlist_items")
        .delete()
        .eq("user_id", userId)
        .eq("symbol", symbol);
    },
    [supabase, userId],
  );

  const move = useCallback(
    (symbol: string, direction: "up" | "down") => {
      if (!userId) return;
      const index = items.findIndex((item) => item.symbol === symbol);
      if (index === -1) return;
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= items.length) return;

      const next = [...items];
      [next[index], next[target]] = [next[target], next[index]];
      setItems(next);

      // Persist the new positions for the two swapped rows.
      void supabase
        .from("watchlist_items")
        .update({ position: index })
        .eq("user_id", userId)
        .eq("symbol", next[index].symbol)
        .then(() =>
          supabase
            .from("watchlist_items")
            .update({ position: target })
            .eq("user_id", userId)
            .eq("symbol", next[target].symbol),
        );
    },
    [items, supabase, userId],
  );

  return (
    <WatchlistContext.Provider value={{ items, has, add, remove, move, ready }}>
      {children}
    </WatchlistContext.Provider>
  );
}

export function useWatchlist() {
  const context = useContext(WatchlistContext);
  if (!context) {
    throw new Error("useWatchlist must be used within a WatchlistProvider");
  }
  return context;
}
