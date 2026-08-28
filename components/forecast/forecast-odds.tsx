"use client";

import { useState } from "react";
import { Target } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Explain, GLOSSARY } from "@/components/forecast/explain";
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

/**
 * "What are the chances of X?" — the question every reader actually arrives
 * with, and the one a table of percentiles refuses to answer.
 *
 * The engine ships its full p0–p100 ladder of simulated ending prices, so this
 * inverts it locally: pick any target, find where it falls in the ladder, and
 * the share of runs that reached it comes straight back. No round trip, no
 * re-simulation — the number moves with the reader's finger, which is what
 * turns a report into something worth playing with.
 */
export function ForecastOddsExplorer({ forecast }: { forecast: ForecastResult }) {
  const { money, number } = useUserSettings();

  const entry = forecast.price;
  const shares = entry > 0 ? forecast.amount / entry : 0;

  // The slider spans where the runs actually went, not a fixed multiple of
  // today's price. Forcing it out to 2× so a "Double it" chip is reachable
  // would give a one-year index forecast a slider that is mostly dead space
  // reading 0%. Break-even is pulled in either way — it is the anchor every
  // other number is read against.
  const lowBound = Math.min(forecast.percentiles[1], entry * 0.95);
  const highBound = Math.max(forecast.percentiles[99], entry * 1.05);
  const stepSize = (highBound - lowBound) / STEPS;

  // Only offer the rungs this stock could plausibly reach over this horizon.
  // A chip that always answers "0%" teaches nothing.
  const presets = PRESETS.filter(
    (preset) =>
      entry * preset.multiple >= lowBound && entry * preset.multiple <= highBound,
  );

  const [targetPrice, setTargetPrice] = useState(entry);

  const probability = shareAtOrAbove(forecast.percentiles, targetPrice);
  const targetValue = shares * targetPrice;
  const changePercent = entry > 0 ? (targetPrice / entry - 1) * 100 : 0;
  const profit = targetValue - forecast.amount;

  const tone = probability >= 50 ? "gain" : "loss";

  return (
    <Card className="gap-5 p-6">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-accent">
          <Target className="size-4 text-accent-foreground" />
        </span>
        <div>
          <h3 className="text-base font-semibold">What are the chances?</h3>
          <p className="text-sm text-muted-foreground">
            Pick any number you care about. This is how often the simulation
            got there.
          </p>
        </div>
      </div>

      {/* ---- The answer ------------------------------------------------ */}
      <div className="rounded-2xl border border-border bg-muted/40 p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p
              className={cn(
                "num-display text-5xl",
                tone === "gain" ? "text-gain" : "text-loss",
              )}
            >
              {number(probability, 0)}%
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {oddsPhrase(probability)} ended at or above this
            </p>
          </div>

          <div className="text-right">
            <p className="text-xs text-muted-foreground">
              Your {money(forecast.amount, 0)} becomes
            </p>
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
          aria-label={`${Math.round(probability)} percent probability`}
        >
          <div
            className={cn(
              "h-full transition-[width] duration-150",
              tone === "gain" ? "bg-gain" : "bg-loss",
            )}
            style={{ width: `${probability}%` }}
          />
        </div>
      </div>

      {/* ---- The control ------------------------------------------------ */}
      <div className="flex flex-col gap-3">
        <label
          htmlFor="odds-target"
          className="flex flex-wrap items-baseline justify-between gap-2 text-sm"
        >
          <span className="font-medium">Target share price</span>
          <span className="num text-muted-foreground">
            {money(targetPrice)} · today {money(entry)}
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
          aria-valuetext={`${money(targetPrice)}, reached in ${Math.round(probability)} percent of runs`}
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

      <p className="text-xs leading-relaxed text-muted-foreground">
        Read from{" "}
        <Explain text={GLOSSARY.monteCarlo}>
          {forecast.simulations.toLocaleString()} simulated runs
        </Explain>{" "}
        of {forecast.symbol}. A probability is not a promise — it is how the
        model&apos;s runs fell, given how this stock has actually behaved.
      </p>
    </Card>
  );
}
