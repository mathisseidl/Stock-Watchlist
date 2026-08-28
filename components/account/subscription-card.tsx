"use client";

import { useEffect, useState } from "react";
import { CalendarCheck, RefreshCw, RotateCcw, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useUserSettings } from "@/components/settings/user-settings-provider";
import { localeFor } from "@/lib/format";
import { proDaysRemaining } from "@/lib/pro";
import type { SubscriptionResponse } from "@/app/api/subscription/route";

/**
 * The plan panel: when the paid month ends, and the two ways to stop it
 * renewing.
 *
 * Both controls write the same thing — `cancel_at_period_end` on the live
 * Stripe subscription — because there is only one honest way to stop a
 * subscription here: no further charge, and every day already paid for kept.
 * They exist separately because they answer different questions. The toggle is
 * the mechanism ("should this bill again?"); the Cancel button is the
 * intention ("I want out"), and someone looking to leave should not have to
 * work out that a switch labelled "auto-pay" is the exit.
 *
 * Cancelling asks for confirmation. Resuming does not — nothing is lost by
 * turning billing back on, and a confirm step there would only be friction.
 */
export function SubscriptionCard({
  initialExpiresAt,
}: {
  initialExpiresAt: string | null;
}) {
  const { settings } = useUserSettings();
  const [plan, setPlan] = useState<SubscriptionResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/subscription")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("failed"))))
      .then((data: SubscriptionResponse) => {
        if (active) setPlan(data);
      })
      .catch(() => {
        // Fall back to what the server already rendered rather than showing
        // an empty card.
        if (active) {
          setPlan({
            isPaid: Boolean(initialExpiresAt),
            proExpiresAt: initialExpiresAt,
            autoRenew: false,
            status: null,
            hasSubscription: false,
          });
        }
      });
    return () => {
      active = false;
    };
  }, [initialExpiresAt]);

  async function setAutoRenew(next: boolean) {
    if (!plan) return;
    const previous = plan;
    setPlan({ ...plan, autoRenew: next });
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/subscription", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoRenew: next }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPlan(previous);
        setError(data.error ?? "That change didn't save.");
        return;
      }
      setPlan(data as SubscriptionResponse);
    } catch {
      setPlan(previous);
      setError("Couldn't reach the server. Try again in a moment.");
    } finally {
      setSaving(false);
    }
  }

  if (!plan) {
    return (
      <Card className="gap-3 p-6">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-3 w-64" />
        <Skeleton className="h-10 w-full rounded-xl" />
      </Card>
    );
  }

  if (!plan.isPaid) return null;

  const locale = localeFor(settings.numberFormat);
  const daysLeft = proDaysRemaining(plan.proExpiresAt);
  const expiryLabel = plan.proExpiresAt
    ? new Date(plan.proExpiresAt).toLocaleDateString(locale, {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <Card className="gap-4 p-6">
      <div>
        <h3 className="text-base font-semibold">Your subscription</h3>
        <p className="text-sm text-muted-foreground">
          MATMAX Pro · <span className="num">$4.99</span> a month.
        </p>
      </div>

      {expiryLabel && (
        <div className="flex items-start gap-3 rounded-xl bg-muted px-4 py-3">
          <CalendarCheck className="mt-0.5 size-4 shrink-0 text-primary" />
          <p className="text-sm">
            Your Pro subscription is valid until{" "}
            <span className="font-semibold">{expiryLabel}</span>
            {daysLeft !== null && (
              <span className="text-muted-foreground">
                {" "}
                · {daysLeft} {daysLeft === 1 ? "day" : "days"} left
              </span>
            )}
            .
          </p>
        </div>
      )}

      {plan.hasSubscription && (
        <>
          {/* Cancel is the way out; resuming is the way back in before the
              period ends. */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border px-4 py-3">
            {plan.autoRenew ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Done with Pro? Cancel whenever you like.
                </p>
                <Button
                  variant="destructive"
                  className="rounded-full"
                  disabled={saving}
                  onClick={() => setConfirmOpen(true)}
                >
                  <XCircle className="size-4" />
                  Cancel Pro subscription
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm">
                  <span className="font-medium">Your subscription is cancelled.</span>{" "}
                  <span className="text-muted-foreground">
                    Pro stays on until {expiryLabel ?? "the period ends"}, then
                    your account drops to Free.
                  </span>
                </p>
                <Button
                  className="rounded-full"
                  disabled={saving}
                  onClick={() => setAutoRenew(true)}
                >
                  <RotateCcw className="size-4" />
                  Resume Pro
                </Button>
              </>
            )}
          </div>

          {saving && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <RefreshCw className="size-3 animate-spin" />
              Saving to Stripe…
            </p>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}

          <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <DialogContent className="max-w-md">
              <div className="pr-8">
                <DialogTitle>Cancel your Pro subscription?</DialogTitle>
                <DialogDescription className="mt-1">
                  Nothing more will be charged.
                </DialogDescription>
              </div>

              <ul className="flex flex-col gap-2 text-sm">
                <li className="flex gap-2.5">
                  <span aria-hidden className="text-gain">
                    ✓
                  </span>
                  <span>
                    You keep Pro until{" "}
                    <span className="font-semibold">
                      {expiryLabel ?? "your period ends"}
                    </span>
                    {daysLeft !== null && ` — that's ${daysLeft} more ${daysLeft === 1 ? "day" : "days"}`}
                    .
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <span aria-hidden className="text-muted-foreground">
                    →
                  </span>
                  <span>
                    After that, forecasts on any stock and the AI news briefings
                    close, and your account drops to Free.
                  </span>
                </li>
              </ul>

              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  variant="outline"
                  className="rounded-full"
                  onClick={() => setConfirmOpen(false)}
                >
                  Keep Pro
                </Button>
                <Button
                  variant="destructive"
                  className="rounded-full"
                  disabled={saving}
                  onClick={async () => {
                    await setAutoRenew(false);
                    setConfirmOpen(false);
                  }}
                >
                  {saving ? "Cancelling…" : "Yes, cancel Pro"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </>
      )}
    </Card>
  );
}
