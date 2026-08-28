"use client";

import { useEffect, useState } from "react";
import { CalendarCheck, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SettingRow, Toggle } from "@/components/settings/setting-row";
import { useUserSettings } from "@/components/settings/user-settings-provider";
import { localeFor } from "@/lib/format";
import { proDaysRemaining } from "@/lib/pro";
import type { SubscriptionResponse } from "@/app/api/subscription/route";

/**
 * The plan panel: when the paid month ends, and the switch that decides
 * whether it renews.
 *
 * The toggle is not cosmetic — it sets `cancel_at_period_end` on the live
 * Stripe subscription, so switching it off is a real cancellation that still
 * leaves every day already paid for intact.
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
  const expiryTime = plan.proExpiresAt
    ? new Date(plan.proExpiresAt).toLocaleTimeString(locale, {
        hour: "numeric",
        minute: "2-digit",
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

      <div className="flex items-start gap-3 rounded-xl bg-muted px-4 py-3">
        <CalendarCheck className="mt-0.5 size-4 shrink-0 text-primary" />
        <p className="text-sm">
          {expiryLabel ? (
            <>
              Your Pro subscription is valid until{" "}
              <span className="font-semibold">{expiryLabel}</span>
              {daysLeft !== null && (
                <span className="text-muted-foreground">
                  {" "}
                  · {daysLeft} {daysLeft === 1 ? "day" : "days"} left
                </span>
              )}
              .
            </>
          ) : (
            <>
              Your Pro access is <span className="font-semibold">open-ended</span>{" "}
              — it has no end date.
            </>
          )}
        </p>
      </div>

      {plan.hasSubscription ? (
        <>
          <SettingRow
            label="Auto-pay"
            description={
              plan.autoRenew
                ? `On. We'll charge $4.99 in the minute before your month runs out${expiryTime ? ` — around ${expiryTime} on ${expiryLabel}` : ""}, and your access rolls straight into the next month.`
                : `Off. Nothing more will be charged. You keep everything until ${expiryLabel ?? "your period ends"}, and then drop back to Free.`
            }
            control={
              <Toggle
                checked={plan.autoRenew}
                onChange={setAutoRenew}
                disabled={saving}
                label="Auto-pay"
              />
            }
          />

          {saving && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <RefreshCw className="size-3 animate-spin" />
              Saving to Stripe…
            </p>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}

          <p className="text-xs leading-relaxed text-muted-foreground">
            You can switch auto-pay off at any point — including the day before
            the next payment. Turning it back on before the period ends resumes
            billing with no gap.
            {plan.status && plan.status !== "active" && (
              <>
                {" "}
                Stripe currently reports this subscription as{" "}
                <span className="font-medium">
                  {plan.status.replace(/_/g, " ")}
                </span>
                .
              </>
            )}
          </p>
        </>
      ) : (
        // Pro that does not run through a subscription: accounts comped by
        // hand, and the ones that bought Pro before it went monthly. There is
        // no card on file and nothing to renew, so there is no switch to offer
        // them either — and no claim made about how they got it, since both
        // routes land here.
        <p className="text-sm leading-relaxed text-muted-foreground">
          Your Pro access doesn&apos;t run through a subscription — there is no
          card on file and{" "}
          <span className="font-medium text-foreground">
            nothing will ever be charged
          </span>
          . That also means there is no auto-pay to switch off.
        </p>
      )}
    </Card>
  );
}
