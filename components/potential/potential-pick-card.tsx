"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Card, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CompanyLogo } from "@/components/stock/company-logo";
import { ChangeBadge } from "@/components/stock/change-badge";
import { Sparkline } from "@/components/stock/sparkline";
import { useCandles, seriesChangePercent } from "@/hooks/use-candles";
import { useUserSettings } from "@/components/settings/user-settings-provider";
import { HOLD_CAPTION } from "@/lib/potential/read";
import { cn } from "@/lib/utils";
import type { PotentialPick } from "@/lib/potential/types";

function OddsLadder({ pick }: { pick: PotentialPick }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs text-muted-foreground">Chance of beating cash</p>
      <div className="flex flex-col gap-1">
        {pick.horizons.map((h) => {
          const active = h.horizonDays === pick.suggestedHold.horizonDays;
          return (
            <div key={h.horizonDays} className="flex items-center gap-2">
              <span
                className={cn(
                  "w-12 shrink-0 text-right text-[11px]",
                  active
                    ? "font-semibold text-foreground"
                    : "text-muted-foreground",
                )}
              >
                {h.label}
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full",
                    active ? "bg-gain" : "bg-gain/40",
                  )}
                  style={{
                    width: `${Math.max(2, Math.min(100, h.probabilityOfBeatingCashPercent))}%`,
                  }}
                />
              </div>
              <span
                className={cn(
                  "num w-9 shrink-0 text-right text-[11px]",
                  active
                    ? "font-semibold text-foreground"
                    : "text-muted-foreground",
                )}
              >
                {Math.round(h.probabilityOfBeatingCashPercent)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function PotentialPickCard({ pick }: { pick: PotentialPick }) {
  const { data: series, isLoading } = useCandles(pick.symbol, "6M");
  const { money } = useUserSettings();

  const change = seriesChangePercent(series);
  const positive = change >= 0;
  const price = series?.price ?? pick.price;

  return (
    <Card className="gap-4 p-0">
      <div className="flex flex-col gap-4 p-4 sm:p-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
            {pick.rank}
          </span>
          <CompanyLogo symbol={pick.symbol} size="md" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{pick.symbol}</p>
            <p className="truncate text-xs text-muted-foreground">
              {pick.name} &middot; {pick.sector}
            </p>
          </div>
          <div className="hidden sm:block">
            {series && series.points.length > 1 && (
              <Sparkline points={series.points} positive={positive} />
            )}
          </div>
          <div className="flex w-24 flex-col items-end gap-1">
            {isLoading ? (
              <Skeleton className="h-4 w-16" />
            ) : (
              <>
                <p className="num text-sm font-semibold">{money(price)}</p>
                <ChangeBadge changePercent={change} />
              </>
            )}
          </div>
        </div>

        {/* Suggested hold */}
        <div className="rounded-xl border border-border p-3.5">
          <p className="text-xs text-muted-foreground">Suggested hold</p>
          <p className="num-display mt-0.5 text-2xl">
            {pick.suggestedHold.label}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {HOLD_CAPTION}
          </p>
        </div>

        <OddsLadder pick={pick} />

        {pick.headlines && pick.headlines.length > 0 && (
          <div className="flex flex-col gap-1.5 border-t border-border pt-3">
            <p className="text-xs text-muted-foreground">This week</p>
            {pick.headlines.map((h) => (
              <a
                key={h.url}
                href={h.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-start gap-1 text-sm hover:text-primary"
              >
                <span className="min-w-0 flex-1">{h.title}</span>
                <ArrowUpRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground group-hover:text-primary" />
              </a>
            ))}
          </div>
        )}
      </div>

      <CardFooter className="gap-4 text-sm">
        <Link
          href={`/stock/${pick.symbol}`}
          className="font-medium text-muted-foreground hover:text-foreground"
        >
          Full page
        </Link>
        <Link
          href={`/forecast?symbol=${encodeURIComponent(pick.symbol)}`}
          className="font-medium text-muted-foreground hover:text-foreground"
        >
          Run a forecast
        </Link>
      </CardFooter>
    </Card>
  );
}
