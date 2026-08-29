"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useProStatus } from "@/hooks/use-pro";
import { PRO_TRIAL_DAYS } from "@/lib/stripe";

export function UpgradeButton() {
  const { plan } = useProStatus();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stripe only gives the trial to accounts it hasn't seen before, so match
  // that here: a lapsed subscriber goes straight to the paid plan.
  const trialEligible = !plan.hasSubscription;

  async function handleUpgrade() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.url) {
        throw new Error(data.error ?? "Could not start checkout.");
      }
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        className="w-full rounded-full"
        onClick={handleUpgrade}
        disabled={loading}
      >
        {loading
          ? "Redirecting…"
          : trialEligible
            ? `Start your ${PRO_TRIAL_DAYS}-day free trial`
            : "Upgrade to Pro — $1.99/month"}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        {trialEligible
          ? `Card required. Then $1.99/month — cancel any time before day ${PRO_TRIAL_DAYS} and you won't be charged.`
          : "Billed $1.99/month. Cancel any time."}
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
