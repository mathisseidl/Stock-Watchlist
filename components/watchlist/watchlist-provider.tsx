"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { defaultWatchlist, type WatchlistItem } from "@/lib/mock-data";

type WatchlistContextValue = {
  items: WatchlistItem[];
  has: (symbol: string) => boolean;
  add: (item: WatchlistItem) => void;
  remove: (symbol: string) => void;
  /** Persist a hand-reordered list (drag and drop). */
  reorder: (next: WatchlistItem[]) => void;
  ready: boolean;
  isGuest: boolean;
  /** Set when a change could not be saved, so the UI can say so. */
  error: string | null;
};

const WatchlistContext = createContext<WatchlistContextValue | null>(null);

/**
 * Signed-out watchlists live here rather than in memory. Without it, adding a
 * stock and reloading silently lost the change — and because the guest seed is
 * the same five tickers a new account gets, there was no way to tell the two
 * states apart.
 */
const GUEST_KEY = "matmax-guest-watchlist";

function readGuestWatchlist(): WatchlistItem[] | null {
  try {
    const raw = localStorage.getItem(GUEST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter(
      (entry): entry is WatchlistItem =>
        Boolean(entry) &&
        typeof entry.symbol === "string" &&
        typeof entry.name === "string",
    );
  } catch {
    return null;
  }
}

function writeGuestWatchlist(items: WatchlistItem[]) {
  try {
    localStorage.setItem(GUEST_KEY, JSON.stringify(items));
  } catch {
    // Private browsing or a full quota — the list still works for this session.
  }
}

export function WatchlistProvider({ children }: { children: React.ReactNode }) {
  const [supabase] = useState(() => createClient());
  const [userId, setUserId] = useState<string | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!active) return;

      if (!user) {
        // Guests keep their list on this device. Only seed the defaults the
        // first time, so a guest who cleared theirs doesn't get it back.
        setUserId(null);
        setIsGuest(true);
        setItems(readGuestWatchlist() ?? defaultWatchlist);
        setReady(true);
        return;
      }

      setUserId(user.id);
      setIsGuest(false);
      const { data, error: loadError } = await supabase
        .from("watchlist_items")
        .select("symbol, name, position")
        .eq("user_id", user.id)
        .order("position", { ascending: true });
      if (!active) return;

      if (loadError) {
        setError("Couldn't load your watchlist. Try reloading the page.");
      } else {
        setItems(
          (data ?? []).map((row) => ({ symbol: row.symbol, name: row.name })),
        );
      }
      setReady(true);
    }

    load();

    // A session that restores late, or a sign-in/sign-out in another tab,
    // has to swap the watchlist over — otherwise the app keeps showing the
    // guest list to a signed-in user.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      load();
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const has = useCallback(
    (symbol: string) => items.some((item) => item.symbol === symbol),
    [items],
  );

  /** Apply a change locally, then save it wherever this user's list lives. */
  const commit = useCallback(
    async (
      next: WatchlistItem[],
      previous: WatchlistItem[],
      save: () => PromiseLike<{ error: unknown }>,
    ) => {
      setError(null);
      setItems(next);

      if (!userId) {
        writeGuestWatchlist(next);
        return;
      }

      const { error: writeError } = await save();
      if (writeError) {
        // Put the list back rather than showing a change that wasn't saved.
        setItems(previous);
        setError("That change couldn't be saved. Check your connection.");
      }
    },
    [userId],
  );

  const add = useCallback(
    (item: WatchlistItem) => {
      if (items.some((entry) => entry.symbol === item.symbol)) return;
      const position = items.length;
      const next = [...items, item];
      void commit(next, items, () =>
        supabase.from("watchlist_items").insert({
          user_id: userId,
          symbol: item.symbol,
          name: item.name,
          position,
        }),
      );
    },
    [commit, items, supabase, userId],
  );

  const remove = useCallback(
    (symbol: string) => {
      const next = items.filter((item) => item.symbol !== symbol);
      void commit(next, items, () =>
        supabase
          .from("watchlist_items")
          .delete()
          .eq("user_id", userId)
          .eq("symbol", symbol),
      );
    },
    [commit, items, supabase, userId],
  );

  const reorder = useCallback(
    (next: WatchlistItem[]) => {
      const previous = items;
      const sameOrder =
        next.length === previous.length &&
        next.every((item, index) => previous[index]?.symbol === item.symbol);
      if (sameOrder) return;

      // Only the rows that actually shifted need a write.
      void commit(next, previous, async () => {
        for (let index = 0; index < next.length; index++) {
          if (previous[index]?.symbol === next[index].symbol) continue;
          const result = await supabase
            .from("watchlist_items")
            .update({ position: index })
            .eq("user_id", userId)
            .eq("symbol", next[index].symbol);
          if (result.error) return result;
        }
        return { error: null };
      });
    },
    [commit, items, supabase, userId],
  );

  return (
    <WatchlistContext.Provider
      value={{ items, has, add, remove, reorder, ready, isGuest, error }}
    >
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
