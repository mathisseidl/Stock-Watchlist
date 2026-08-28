"use client";

import { useState } from "react";
import { Target } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useUserSettings } from "@/components/settings/user-settings-provider";
import { oddsPhrase, shareAtOrAbove } from "@/lib/forecast/read";
import { cn } from "@/lib/utils";
import type { ForecastResult } from "@/lib/forecast/engine";

/** The rungs people actually think in, as multiples of today's price. */
const PRESETS = [
  { multiple: 0.8, label: "Down 20%" },
  { multiple: 1, label: "Break even" },
  { multiple: 1.1, label: "+10%" },
  { multiple: 1.25, label: "+25%" },
  { multiple: 1.5, label: "+50%" },
  { multiple: 2, label: "Double it" },
];

const STEPS = 240;

function clamp(value: number, low: number, high: number) {
  return Math.min(Math.max(value, low), high);
}

/**
 * "What are the chances of X?" — the question every reader actually arrives
 * with, and the one a table of percentiles refuses to answer.
 *
 * The engine ships its full p0–p100 ladder of simulated ending prices, so this
 * inverts it locally: pick any target, find where it falls in the ladder, and
 * the share of runs that reached it comes straight back. No round trip, no
 * re-simulation — the number moves with the reader's finger.
 *
 * Two things here are corrections to an earlier version that misled a reader.
 * The probability is never tinted red or green: colouring a low number red
 * made "20% chance of reaching +50%" read as "80% chance you lose money",
 * which is not what it says and not true. And the counterpart share is spelled
 * out underneath with an explicit reminder of where profit actually starts,
 * because the gap between "did not reach my target" and "lost money" is the
 * whole point and the reader will not infer it.
 */
export function ForecastOddsExplorer({ forecast }: { forecast: ForecastResult }) {
  const { money, number } = useUserSettings();

  const entry = forecast.price;
  const shares = entry > 0 ? forecast.amount / entry : 0;

  // The slider spans where the runs actually went, not a fixed multiple of
  // today's price. Forcing it out to 2x so a "double it" chip is reachable
  // gave a one-year index forecast a slider that was mostly dead space at 0%.
  const lowBound = Math.min(forecast.percentiles[1], entry * 0.95);
  const highBound = Math.max(forecast.percentiles[99], entry * 1.05);
  const stepSize = (highBound - lowBound) / STEPS;

  // Opens on the 75th percentile — an ambitious but real target, always in
  // range whatever the horizon, and structurally incapable of repeating a
  // number from the card above: it is never break-even (which would read
  // "your $1,000 becomes $1,000.00"), never the median in the headline, and
  // never the chance-of-profit figure. A round +10% was tried and landed
  // almost exactly on the median for a one-year index forecast.
  const [targetPrice, setTargetPrice] = useState(() =>
    clamp(forecast.percentiles[75], lowBound, highBound),
  );

  // Only offer rungs this stock could plausibly reach over this horizon. A
  // chip that always answers "0%" teaches nothing.
  const presets = PRESETS.filter(
    (preset) =>
      entry * preset.multiple >= lowBound && entry * preset.multiple <= highBound,
  );

  const probability = shareAtOrAbove(forecast.percentiles, targetPrice);
  const targetValue = shares * targetPrice;
  const changePercent = entry > 0 ? (targetPrice / entry - 1) * 100 : 0;
  const profit = targetValue - forecast.amount;
  const aboveBreakEven = targetPrice > entry;

  return (
    <Card className="gap-5 p-6">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-accent">
          <Target className="size-4 text-accent-foreground" />
        </span>
        <div>
          <h3 className="text-base font-semibold">What are the chances?</h3>
          <p className="text-sm text-muted-foreground">
            Drag to any figure you care about. This is how often the simulation
            got there.
          </p>
        </div>
      </div>

      {/* ---- The answer ------------------------------------------------ */}
      <div className="rounded-2xl border border-border bg-muted/40 p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            {/* Deliberately not tinted. See the note at the top of the file. */}
            <p className="num-display text-5xl">{number(probability, 0)}%</p>
            <p className="mt-1 text-sm text-muted-foreground">
              of runs reached this or better
            </p>
          </div>

          <div className="text-right">
            <p className="text-xs text-muted-foreground">Target</p>
            <p className="num-display mt-0.5 text-2xl">{money(targetValue)}</p>
            <p
              className={cn(
                "num text-sm font-medium",
                profit >= 0 ? "text-gain" : "text-loss",
              )}
            >
              {profit >= 0 ? "+" : "−"}
              {money(Math.abs(profit))} ({changePercent >= 0 ? "+" : "−"}
              {number(Math.abs(changePercent), 1)}%)
            </p>
          </div>
        </div>

        <div
          className="mt-4 flex h-2 overflow-hidden rounded-full bg-border"
          role="img"
          aria-label={`${Math.round(probability)} percent of runs reached ${money(targetValue)} or better`}
        >
          <div
            className="h-full bg-primary transition-[width] duration-150"
            style={{ width: `${probability}%` }}
          />
        </div>

        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          {oddsPhrase(probability)} reached it. The other{" "}
          <span className="num">{number(100 - probability, 0)}%</span> finished
          below {money(targetValue)}
          {aboveBreakEven ? (
            <>
              {" "}
              — though that is not the same as losing money. Anything above{" "}
              <span className="num">{money(forecast.amount, 0)}</span> is still
              a profit.
            </>
          ) : (
            "."
          )}
        </p>
      </div>

      {/* ---- The control ------------------------------------------------ */}
      <div className="flex flex-col gap-3">
        <label
          htmlFor="odds-target"
          className="flex flex-wrap items-baseline justify-between gap-2 text-sm"
        >
          <span className="font-medium">Move the target</span>
          <span className="num text-xs text-muted-foreground">
            {money(targetPrice)} a share
          </span>
        </label>
        <input
          id="odds-target"
          type="range"
          min={lowBound}
          max={highBound}
          step={stepSize}
          value={targetPrice}
          onChange={(event) => setTargetPrice(Number(event.target.value))}
          aria-valuetext={`${money(targetValue)}, reached in ${Math.round(probability)} percent of runs`}
          className="h-2 w-full cursor-pointer appearance-none rounded-full bg-border accent-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        />

        <div className="flex flex-wrap gap-2">
          {presets.map((preset) => {
            const price = entry * preset.multiple;
            const selected = Math.abs(price - targetPrice) < stepSize;
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => setTargetPrice(price)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  selected
                    ? "border-primary bg-accent text-accent-foreground"
                    : "border-border hover:bg-accent",
                )}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
