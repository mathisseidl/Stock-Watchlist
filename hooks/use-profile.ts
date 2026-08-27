"use client";

import { useQuery } from "@tanstack/react-query";
import type { CompanyProfile } from "@/lib/market-data/types";

async function fetchProfile(symbol: string): Promise<CompanyProfile> {
  const res = await fetch(`/api/profile/${symbol}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch profile for ${symbol}`);
  }
  return res.json();
}

export function useProfile(symbol: string) {
  return useQuery({
    queryKey: ["profile", symbol],
    queryFn: () => fetchProfile(symbol),
    enabled: symbol.length > 0,
    // Company logos/metadata rarely change; don't poll them.
    staleTime: 24 * 60 * 60 * 1000,
    refetchInterval: false,
  });
}
