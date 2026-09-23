"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { SubscriptionResponse } from "@/app/api/subscription/route";

/**
 * The checkout success page already confirmed Pro with Stripe server-side —
 * seed that straight into the shared `useProStatus` cache instead of letting
 * the header/sidebar make their own round trip to `/api/subscription` and
 * find out a beat later. Same data, zero propagation gap.
 */
export function SeedProStatus({ data }: { data: SubscriptionResponse }) {
  const queryClient = useQueryClient();

  useEffect(() => {
    queryClient.setQueryData(["subscription"], { ...data, isGuest: false });
  }, [queryClient, data]);

  return null;
}
