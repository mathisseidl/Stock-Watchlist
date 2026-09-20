"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useProStatus } from "@/hooks/use-pro";
import { PRO_TRIAL_DAYS } from "@/lib/pro";

/**
 * Either starts the free trial or pays for Pro — never both at once, and
 * never automatically. `trialEligible` (see lib/pro.ts) is the one signal
 * that decides which: it's only true for an account that has never clicked
 * to start a trial and never had a Stripe subscription.
 *
 * Starting the trial never touches Stripe — it just stamps `trial_started_at`
 * on the profile, no card involved. Paying always does, and is the only
 * action that puts a card on file and creates the recurring subscription.
 */
export function UpgradeButton() {
  const { plan, refetch } = useProStatus();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleStartTrial() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/trial/start", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Couldn't start the trial.");
      }
      await refetch();
      // The account page that hosts this button is a server component — it
      // needs a re-render to stop showing this button and start showing the
      // trial countdown instead.
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

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
        onClick={plan.trialEligible ? handleStartTrial : handleUpgrade}
        disabled={loading}
      >
        {loading
          ? "Loading…"
          : plan.trialEligible
            ? `Start your ${PRO_TRIAL_DAYS}-day free trial`
            : "Upgrade to Pro — $1.99/month"}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        {plan.trialEligible
          ? "No bank card needed for the free trial."
          : "Billed $1.99/month. Cancel any time."}
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
