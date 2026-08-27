"use client";

import { useQuery } from "@tanstack/react-query";
import type { NewsItem } from "@/lib/market-data/types";

async function fetchNews(symbol: string): Promise<NewsItem[]> {
  const res = await fetch(`/api/news/${symbol}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch news for ${symbol}`);
  }
  return res.json();
}

export function useNews(symbol: string) {
  return useQuery({
    queryKey: ["news", symbol],
    queryFn: () => fetchNews(symbol),
    enabled: symbol.length > 0,
    staleTime: 15 * 60 * 1000,
    refetchInterval: false,
  });
}
