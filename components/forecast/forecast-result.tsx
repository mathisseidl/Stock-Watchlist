"use client";

import { useState } from "react";
import { Activity, Landmark, Route, ShieldAlert, Target } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SegmentedControl } from "@/components/settings/setting-row";
import { ForecastOddsExplorer } from "@/components/forecast/forecast-odds";
import { ForecastDistribution } from "@/components/forecast/forecast-distribution";
import { ForecastDetails } from "@/components/forecast/forecast-details";
import { Explain, GLOSSARY } from "@/components/forecast/explain";
import { useUserSettings } from "@/components/settings/user-settings-provider";
import {
  describeHorizon,
  describeRisk,
  describeVerdict,
  oddsPhrase,
} from "@/lib/forecast/read";
import { cn } from "@/lib/utils";
import type { ForecastResult } from "@/lib/forecast/engine";

type Mode = "guided" | "compact";

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

/**
 * The whole spread on one axis: worst tenth at the left edge, best tenth at
 * the right, the middle outcome marked, and the colour changing where your
 * stake breaks even.
 *
 * This replaces the three outcome cards that used to sit underneath. They
 * carried the same three numbers the axis already shows, and seeing them side
 * by side in boxes made the reader do the comparison that the axis does for
 * them.
 *
 * Note there is deliberately no "break even" label. An earlier version put one
 * in a three-column row under the bar, which pinned it to dead centre while
 * its tick sat wherever break-even actually fell — so the median could render
 * visually *left* of a label claiming to mark a lower number. The colour
 * change is the marker; the caption says what the colour means.
 */
function OutcomeRange({ forecast }: { forecast: ForecastResult }) {
  const { money } = useUserSettings();

  const low = forecast.worst.value;
  const high = forecast.best.value;
  const span = high - low || 1;
  const position = (value: number) =>
    Math.min(100, Math.max(0, ((value - low) / span) * 100));

  const breakEven = position(forecast.amount);
  const median = position(forecast.likely.value);
  const stake = money(forecast.amount, 0);

  const caption =
    forecast.amount <= low
      ? `Even the worst tenth of runs finished above your ${stake}.`
      : forecast.amount >= high
        ? `Even the best tenth of runs finished below your ${stake}.`
        : `The dot is the middle outcome. Red is where you end up below your ${stake}.`;

  return (
    <div>
      <div className="relative h-3 overflow-hidden rounded-full bg-muted">
        <div
          className="absolute inset-y-0 left-0 bg-loss/40"
          style={{ width: `${breakEven}%` }}
        />
        <div
          className="absolute inset-y-0 right-0 bg-gain/40"
          style={{ width: `${100 - breakEven}%` }}
        />
        <div
          className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-foreground"
          style={{ left: `${median}%` }}
        />
      </div>

      <div className="mt-2 flex items-baseline justify-between text-[11px] text-muted-foreground">
        <span>
          Worst 10% <span className="num text-loss">{money(low, 0)}</span>
        </span>
        <span>
          Best 10% <span className="num text-gain">{money(high, 0)}</span>
        </span>
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        {caption}
      </p>
    </div>
  );
}

/** One headline statistic in the hero's stat row. */
function KeyStat({
  label,
  value,
  detail,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail: React.ReactNode;
  icon: typeof Target;
  tone?: "gain" | "loss" | "neutral";
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border p-3.5">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </p>
      <p
        className={cn(
          "num-display text-xl",
          tone === "gain" && "text-gain",
          tone === "loss" && "text-loss",
        )}
      >
        {value}
      </p>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {detail}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The page                                                            */
/* ------------------------------------------------------------------ */

export function ForecastResultView({
  forecast,
  isSample,
}: {
  forecast: ForecastResult;
  isSample: boolean;
}) {
  const { money, number } = useUserSettings();
  const [mode, setMode] = useState<Mode>("guided");
  const guided = mode === "guided";

  const horizon = describeHorizon(forecast.horizonDays);
  const targetDate = new Date(forecast.targetDate).toLocaleDateString("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const risk = describeRisk(forecast.drivers.annualVolatilityPercent);
  const upside = forecast.likely.profit >= 0;
  const beatsCash = forecast.cash.probabilityOfBeating;

  return (
    <div className="flex flex-col gap-4">
      {/* ---- Reading level ---------------------------------------------- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {forecast.simulations.toLocaleString()} simulated futures for{" "}
          <span className="font-medium text-foreground">{forecast.symbol}</span>
        </p>
        <SegmentedControl
          label="How much explanation to show"
          value={mode}
          onChange={setMode}
          options={[
            { value: "guided", label: "Explain everything" },
            { value: "compact", label: "Just the numbers" },
          ]}
        />
      </div>

      {/* ---- 1. The answer ---------------------------------------------- */}
      <Card className="gap-6 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="min-w-0 text-sm text-muted-foreground">
            <span className="num font-semibold text-foreground">
              {money(forecast.amount, 0)}
            </span>{" "}
            into{" "}
            <span className="font-semibold text-foreground">
              {forecast.name}
              {forecast.name !== forecast.symbol ? ` (${forecast.symbol})` : ""}
            </span>
            , held {horizon} to {targetDate}
          </p>
          {isSample && (
            <span className="shrink-0 rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
              Free sample
            </span>
          )}
        </div>

        <div>
          <p className="text-sm font-medium text-muted-foreground">
            {describeVerdict(forecast.probabilityOfProfit)}
          </p>
          <div className="mt-1 flex flex-wrap items-end gap-x-4 gap-y-1">
            <p className="num-display text-5xl">
              {money(forecast.likely.value)}
            </p>
            <p
              className={cn(
                "num mb-1.5 text-lg font-semibold",
                upside ? "text-gain" : "text-loss",
              )}
            >
              {upside ? "+" : "−"}
              {money(Math.abs(forecast.likely.profit))} ({upside ? "+" : "−"}
              {number(Math.abs(forecast.likely.returnPercent), 1)}%)
            </p>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            the <Explain text={GLOSSARY.median}>middle outcome</Explain> — half
            the runs did better than this, half did worse
          </p>
        </div>

        <OutcomeRange forecast={forecast} />

        <div className="grid gap-3 sm:grid-cols-3">
          <KeyStat
            icon={Target}
            label="Chance of a profit"
            value={`${number(forecast.probabilityOfProfit, 0)}%`}
            tone={forecast.probabilityOfProfit >= 50 ? "gain" : "loss"}
            detail={`${oddsPhrase(forecast.probabilityOfProfit)} ended in profit.`}
          />
          <KeyStat
            icon={Landmark}
            label="Chance of beating cash"
            value={`${number(beatsCash, 0)}%`}
            tone={beatsCash >= 50 ? "gain" : "loss"}
            detail={
              <>
                A savings account at{" "}
                <Explain text={GLOSSARY.riskFree}>
                  {number(forecast.cash.annualRatePercent, 0)}%
                </Explain>{" "}
                would reach {money(forecast.cash.value, 0)}.
              </>
            }
          />
          <KeyStat
            icon={Activity}
            label="How rough a ride"
            value={risk.label}
            detail={`${risk.detail} ${number(forecast.drivers.annualVolatilityPercent, 0)}% swing a year.`}
          />
        </div>
      </Card>

      {/* ---- 2. Play with it -------------------------------------------- */}
      <ForecastOddsExplorer forecast={forecast} />

      {/* ---- 3. The shape ----------------------------------------------- */}
      <Card className="gap-4 p-6">
        <div>
          <h3 className="text-base font-semibold">Where the runs landed</h3>
          {guided && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              Every simulated ending, sorted into columns. The numbers above are
              just three points picked out of this shape.
            </p>
          )}
        </div>
        <ForecastDistribution forecast={forecast} />
      </Card>

      {/* ---- 4. The honest part ----------------------------------------- */}
      <Card className="gap-4 border-loss/25 p-6">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-loss-soft">
            <ShieldAlert className="size-4 text-loss" />
          </span>
          <div>
            <h3 className="text-base font-semibold">Before you get excited</h3>
            {guided && (
              <p className="mt-0.5 text-sm text-muted-foreground">
                The upside is the easy half of a forecast. This is the other
                one.
              </p>
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-loss/25 bg-loss-soft/30 p-4">
            <p className="text-xs font-medium text-muted-foreground">
              The bad tail
            </p>
            <p className="num-display mt-1 text-xl text-loss">
              {money(forecast.stress.value)}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              One run in twenty ended at or below this.
            </p>
          </div>

          <div className="rounded-xl border border-border p-4">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Route className="size-3.5" />
              The ride down
            </p>
            <p className="num-display mt-1 text-xl">
              −{number(forecast.journey.medianDipPercent, 0)}%
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              The typical run{" "}
              <Explain text={GLOSSARY.drawdown}>dipped</Explain> at least this
              far below its own high along the way.
            </p>
          </div>

          <div className="rounded-xl border border-border p-4">
            <p className="text-xs font-medium text-muted-foreground">
              Already happened
            </p>
            <p className="num-display mt-1 text-xl">
              −{number(forecast.drivers.maxDrawdownPercent, 0)}%
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              {forecast.symbol}&apos;s deepest real fall from a peak in five
              years. Not a simulation — it happened.
            </p>
          </div>
        </div>
      </Card>

      {/* ---- 5. The workings -------------------------------------------- */}
      <ForecastDetails forecast={forecast} />
    </div>
  );
}
