"use client";

import { useQuery } from "@tanstack/react-query";
import type { PotentialResponse } from "@/app/api/potential/route";

/**
 * This week's "Potential" screen. One request, shared across the page — the
 * numbers only change when the weekly job re-runs, so this can sit stale for a
 * good while.
 */
export function usePotential() {
  return useQuery<PotentialResponse>({
    queryKey: ["potential"],
    queryFn: async () => {
      const res = await fetch("/api/potential");
      if (!res.ok) throw new Error("Failed to load Potential");
      return res.json();
    },
    staleTime: 5 * 60_000,
  });
}
