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
    // Settle fast: callers block their UI until this resolves, and the default
    // three retries would hold a Pro user on a spinner for seconds.
    retry: 1,
  });

  const plan = query.data ?? GUEST;

  return {
    plan,
    isPaid: plan.isPaid,
    isGuest: plan.isGuest,
    /** On the free trial: Pro is open, but the first charge hasn't landed yet. */
    isTrialing: plan.status === "trialing",
    /**
     * False until the plan is actually known. Callers must wait on this before
     * showing an upsell — `plan` falls back to GUEST while loading, so acting
     * on `isPaid` early tells a paying user they haven't paid.
     */
    ready: !query.isPending,
    failed: query.isError,
    refetch: query.refetch,
  };
}
