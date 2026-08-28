"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Receipt } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useUserSettings } from "@/components/settings/user-settings-provider";
import { localeFor } from "@/lib/format";
import type { Purchase } from "@/app/api/billing/route";

export function BillingCard({ isPaid }: { isPaid: boolean }) {
  const { settings } = useUserSettings();
  const [purchases, setPurchases] = useState<Purchase[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/billing")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        if (active) setPurchases(data.purchases ?? []);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);

  function amount(value: number, currency: string) {
    return new Intl.NumberFormat(localeFor(settings.numberFormat), {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(value / 100);
  }

  return (
    <Card className="gap-4 p-6">
      <div>
        <h3 className="text-base font-semibold">Billing</h3>
        <p className="text-sm text-muted-foreground">
          {isPaid
            ? "You bought Pro outright. There is no subscription and nothing renews — you will not be charged again."
            : "You're on the Free plan. Nothing has been charged."}
        </p>
      </div>

      {failed ? (
        <p className="text-sm text-muted-foreground">
          Couldn&apos;t load your payment history right now.
        </p>
      ) : purchases === null ? (
        <Skeleton className="h-14 w-full rounded-xl" />
      ) : purchases.length === 0 ? (
        <p className="text-sm text-muted-foreground">No payments yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {purchases.map((purchase) => (
            <li
              key={purchase.id}
              className="flex items-center gap-3 rounded-xl border border-border px-4 py-3"
            >
              <Receipt className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{purchase.description}</p>
                <p className="num text-xs text-muted-foreground">
                  {new Date(purchase.created * 1000).toLocaleDateString(
                    localeFor(settings.numberFormat),
                    { year: "numeric", month: "long", day: "numeric" },
                  )}
                </p>
              </div>
              <span className="num text-sm font-semibold">
                {amount(purchase.amount, purchase.currency)}
              </span>
              {purchase.receiptUrl && (
                <a
                  href={purchase.receiptUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  Receipt
                  <ExternalLink className="size-3" />
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
