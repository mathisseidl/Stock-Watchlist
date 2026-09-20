"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Always a real payment — the free trial happens automatically at signup and
 * never lands here (see `isTrialActive` in lib/pro.ts). By the time this
 * button is visible, either the trial already ran out or it never applied, so
 * this is the one and only action that puts a card on file and starts the
 * recurring Stripe subscription.
 */
export function UpgradeButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        {loading ? "Redirecting…" : "Upgrade to Pro — $1.99/month"}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Billed $1.99/month. Cancel any time.
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
