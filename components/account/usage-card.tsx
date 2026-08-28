"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const FREE_LIMIT = 3;

export function UsageCard() {
  const [usage, setUsage] = useState<{
    isPaid: boolean;
    remaining: number | null;
  } | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/analytics")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active && data) {
          setUsage({ isPaid: Boolean(data.isPaid), remaining: data.remaining });
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  if (!usage) {
    return (
      <Card className="gap-3 p-6">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-2 w-full rounded-full" />
      </Card>
    );
  }

  if (usage.isPaid) {
    return (
      <Card className="gap-1 p-6">
        <h3 className="text-base font-semibold">Investment analysis</h3>
        <p className="text-sm text-muted-foreground">
          Unlimited on your plan. Run as many as you like.
        </p>
      </Card>
    );
  }

  const remaining = usage.remaining ?? 0;
  const used = Math.max(0, FREE_LIMIT - remaining);

  return (
    <Card className="gap-3 p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold">Investment analysis</h3>
        <p className="num text-sm text-muted-foreground">
          {used} of {FREE_LIMIT} used today
        </p>
      </div>

      <div
        className="flex gap-1.5"
        role="img"
        aria-label={`${used} of ${FREE_LIMIT} analyses used today`}
      >
        {Array.from({ length: FREE_LIMIT }).map((_, index) => (
          <span
            key={index}
            className={cn(
              "h-2 flex-1 rounded-full",
              index < used ? "bg-primary" : "bg-muted",
            )}
          />
        ))}
      </div>

      <p className="text-sm text-muted-foreground">
        {remaining > 0
          ? `${remaining} left. Your allowance resets at midnight UTC.`
          : "You've used today's allowance. It resets at midnight UTC."}{" "}
        <Link href="#plans" className="font-medium text-primary hover:underline">
          Go unlimited
        </Link>
      </p>
    </Card>
  );
}
