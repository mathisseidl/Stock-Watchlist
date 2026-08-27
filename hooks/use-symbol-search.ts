"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SymbolSearchResult } from "@/lib/market-data/types";

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

  const results = (data ?? [])
    .filter((item) => item.type === "Common Stock")
    .slice(0, limit);

  return { results, isFetching, debounced };
}
