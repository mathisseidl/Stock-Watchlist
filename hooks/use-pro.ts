"use client";

import { useQuery } from "@tanstack/react-query";
import type { SubscriptionResponse } from "@/app/api/subscription/route";

export type ProStatus = SubscriptionResponse & { isGuest: boolean };

const GUEST: ProStatus = {
  isPaid: false,
  proExpiresAt: null,
  autoRenew: false,
  status: null,
  hasSubscription: false,
  isGuest: true,
};

/**
 * The signed-in user's plan, shared across every component that needs to know
 * whether a Pro feature is open. React Query dedupes it, so the four or five
 * places that ask still make one request.
 *
 * This is a convenience for rendering — the gate that matters lives on the
 * server, in each Pro route.
 */
export function useProStatus() {
  const query = useQuery<ProStatus>({
    queryKey: ["subscription"],
    queryFn: async () => {
      const res = await fetch("/api/subscription");
      if (res.status === 401) return GUEST;
      if (!res.ok) throw new Error("Failed to load your plan");
      const data = (await res.json()) as SubscriptionResponse;
      return { ...data, isGuest: false };
    },
    staleTime: 60_000,
  });

  const plan = query.data ?? GUEST;

  return {
    plan,
    isPaid: plan.isPaid,
    isGuest: plan.isGuest,
    ready: !query.isLoading,
    refetch: query.refetch,
  };
}
