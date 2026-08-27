"use client";

import { useQueries } from "@tanstack/react-query";
import type { Quote } from "@/lib/market-data/types";

async function fetchQuote(symbol: string): Promise<Quote> {
  const res = await fetch(`/api/quote/${symbol}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch quote for ${symbol}`);
  }
  return res.json();
}

export function useQuotes(symbols: string[]) {
  const results = useQueries({
    queries: symbols.map((symbol) => ({
      queryKey: ["quote", symbol],
      queryFn: () => fetchQuote(symbol),
    })),
  });

  const quotes: Record<string, Quote | undefined> = {};
  const errors: Record<string, boolean> = {};

  symbols.forEach((symbol, index) => {
    quotes[symbol] = results[index]?.data;
    errors[symbol] = results[index]?.isError ?? false;
  });

  return {
    quotes,
    errors,
    isLoading: results.some((result) => result.isLoading),
    hasAnyError: results.some((result) => result.isError),
  };
}
