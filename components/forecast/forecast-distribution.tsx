"use client";

import { useState } from "react";
import { useUserSettings } from "@/components/settings/user-settings-provider";
import { cn } from "@/lib/utils";
import type { ForecastResult } from "@/lib/forecast/engine";

/**
 * Where the runs actually landed.
 *
 * The three headline outcomes are three points plucked out of a distribution;
 * this is the distribution. It is the one picture that makes the shape of the
 * risk obvious without a word of statistics: the red mass on the left is how
 * often you lose money, the green on the right is how often you don't, and the
 * long thin tail is why the average outcome is not the likely one.
 *
 * Built from divs rather than SVG so every bar is independently hoverable and
 * the whole thing reflows on a phone without a viewBox fight.
 */
export function ForecastDistribution({ forecast }: { forecast: ForecastResult }) {
  const { money, number } = useUserSettings();
  const [hovered, setHovered] = useState<number | null>(null);

  const buckets = forecast.distribution;
  if (buckets.length === 0) return null;

  const entry = forecast.price;
  const shares = entry > 0 ? forecast.amount / entry : 0;
  const peak = Math.max(...buckets.map((bucket) => bucket.share)) || 1;

  const first = buckets[0].from;
  const span = buckets[buckets.length - 1].to - first || 1;
  const positionOf = (price: number) =>
    Math.min(100, Math.max(0, ((price - first) / span) * 100));

  const active = hovered === null ? null : buckets[hovered];
  const withinRange = entry > first && entry < buckets[buckets.length - 1].to;

  return (
    <div className="flex flex-col gap-3">
      {/* Fixed-height caption so hovering never shifts the chart. */}
      <p className="min-h-[2.5rem] text-xs leading-relaxed text-muted-foreground">
        {active ? (
          <>
            <span className="num font-medium text-foreground">
              {number(active.share * 100, 1)}%
            </span>{" "}
            of runs left you with between{" "}
            <span className="num text-foreground">
              {money(shares * active.from, 0)}
            </span>{" "}
            and{" "}
            <span className="num text-foreground">
              {money(shares * active.to, 0)}
            </span>
            .
          </>
        ) : (
          <>
            Each bar is how often the simulation left you with that much.
            Everything right of the dashed line is a profit;{" "}
            <span className="num font-medium text-foreground">
              {number(forecast.probabilityOfProfit, 0)}%
            </span>{" "}
            of all runs finished there. The most extreme 1% at each end is
            trimmed off so the shape stays readable.
          </>
        )}
      </p>

      <div
        className="relative flex h-44 items-end gap-px"
        role="img"
        aria-label={`Distribution of ${forecast.simulations.toLocaleString()} simulated outcomes, leaving you with between ${money(shares * first, 0)} and ${money(shares * buckets[buckets.length - 1].to, 0)}`}
        onMouseLeave={() => setHovered(null)}
      >
        {buckets.map((bucket, index) => {
          const profitable = (bucket.from + bucket.to) / 2 >= entry;
          return (
            <div
              key={bucket.from}
              onMouseEnter={() => setHovered(index)}
              onPointerDown={() => setHovered(index)}
              className="group flex h-full flex-1 cursor-default items-end"
            >
              <div
                className={cn(
                  "w-full rounded-t-[3px] transition-opacity",
                  profitable ? "bg-gain" : "bg-loss",
                  hovered === null
                    ? "opacity-80"
                    : hovered === index
                      ? "opacity-100"
                      : "opacity-35",
                )}
                style={{
                  height: `${Math.max(1.5, (bucket.share / peak) * 100)}%`,
                }}
              />
            </div>
          );
        })}

        {withinRange && (
          <div
            className="pointer-events-none absolute inset-y-0 border-l border-dashed border-foreground/50"
            style={{ left: `${positionOf(entry)}%` }}
          />
        )}
      </div>

      <div className="relative h-8 text-[11px] text-muted-foreground">
        <span className="num absolute left-0">{money(shares * first, 0)}</span>
        {withinRange && (
          <span
            className="absolute -translate-x-1/2 text-center whitespace-nowrap text-foreground/70"
            style={{ left: `${positionOf(entry)}%` }}
          >
            break even
            <br />
            <span className="num">{money(forecast.amount, 0)}</span>
          </span>
        )}
        <span className="num absolute right-0">
          {money(shares * buckets[buckets.length - 1].to, 0)}
        </span>
      </div>
    </div>
  );
}
