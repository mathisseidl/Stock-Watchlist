"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  SEARCHABLE_SYMBOL_TYPES,
  type SymbolSearchResult,
} from "@/lib/market-data/types";

async function fetchSearch(query: string): Promise<SymbolSearchResult[]> {
  const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) {
    throw new Error("Search failed");
  }
  return res.json();
}

/**
 * Debounced company/ticker lookup shared by the top-bar search and the
 * analytics symbol picker, so both resolve names the same way.
 */
export function useSymbolSearch(term: string, limit = 8) {
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(term.trim()), 250);
    return () => clearTimeout(timer);
  }, [term]);

  const { data, isFetching } = useQuery({
    queryKey: ["search", debounced],
    queryFn: () => fetchSearch(debounced),
    enabled: debounced.length > 0,
    staleTime: 60_000,
    refetchInterval: false,
  });

  // Every type the app can actually price, not just ordinary shares: an ETF
  // is how an index is reached here (SPY, QQQ, DIA), so filtering to
  // "Common Stock" alone hid every index fund from both search boxes.
  const results = (data ?? [])
    .filter((item) => SEARCHABLE_SYMBOL_TYPES.has(item.type))
    .slice(0, limit);

  return { results, isFetching, debounced };
}
