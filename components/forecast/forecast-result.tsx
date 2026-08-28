"use client";

import { useState } from "react";
import {
  Activity,
  Landmark,
  Route,
  ShieldAlert,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { SegmentedControl } from "@/components/settings/setting-row";
import { ForecastFanChart } from "@/components/forecast/forecast-fan-chart";
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
import type { ForecastOutcome, ForecastResult } from "@/lib/forecast/engine";

type Mode = "guided" | "compact";

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

/**
 * The spread on a single line.
 *
 * Three numbers in three boxes make the reader do the comparison themselves.
 * Laying them on one axis, with the money they put in marked on it, does the
 * comparison for them — you can see at a glance whether break-even sits near
 * the middle of the range or out at one end, which is the whole question.
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
  const breakEvenVisible = forecast.amount > low && forecast.amount < high;

  return (
    <div className="pt-7">
      <div className="relative">
        {/* Median flag, clamped so it never hangs off either edge. */}
        <div
          className="absolute -top-7 -translate-x-1/2 whitespace-nowrap"
          style={{ left: `${Math.min(88, Math.max(12, median))}%` }}
        >
          <span className="num rounded-md bg-foreground px-1.5 py-0.5 text-[10px] font-semibold text-background">
            {money(forecast.likely.value, 0)}
          </span>
        </div>

        <div className="relative h-3 overflow-hidden rounded-full">
          <div
            className="absolute inset-y-0 left-0 bg-loss/35"
            style={{ width: `${breakEven}%` }}
          />
          <div
            className="absolute inset-y-0 right-0 bg-gain/35"
            style={{ width: `${100 - breakEven}%` }}
          />
          {breakEvenVisible && (
            <div
              className="absolute inset-y-0 w-px bg-foreground/60"
              style={{ left: `${breakEven}%` }}
            />
          )}
          <div
            className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-foreground"
            style={{ left: `${median}%` }}
          />
        </div>
      </div>

      <div className="mt-2 flex items-start justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="text-left">
          Worst 10%
          <br />
          <span className="num text-loss">{money(low, 0)}</span>
        </span>
        <span className="text-center">
          Break even
          <br />
          <span className="num text-foreground/80">
            {money(forecast.amount, 0)}
          </span>
        </span>
        <span className="text-right">
          Best 10%
          <br />
          <span className="num text-gain">{money(high, 0)}</span>
        </span>
      </div>
    </div>
  );
}

function OutcomeTile({
  outcome,
  label,
  caption,
  tone,
  icon: Icon,
  showCaption,
}: {
  outcome: ForecastOutcome;
  label: string;
  caption: string;
  tone: "gain" | "loss" | "neutral";
  icon: typeof TrendingUp;
  showCaption: boolean;
}) {
  const { money, number } = useUserSettings();
  const positive = outcome.profit >= 0;

  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-2xl border p-4",
        tone === "gain" && "border-gain/30 bg-gain-soft/40",
        tone === "loss" && "border-loss/30 bg-loss-soft/40",
        tone === "neutral" && "border-border",
      )}
    >
      <div className="flex items-center gap-1.5">
        <Icon
          className={cn(
            "size-3.5",
            tone === "gain" && "text-gain",
            tone === "loss" && "text-loss",
            tone === "neutral" && "text-muted-foreground",
          )}
        />
        <p className="text-xs font-semibold tracking-wide uppercase">{label}</p>
      </div>

      <p className="num-display text-2xl">{money(outcome.value)}</p>

      <p
        className={cn(
          "num text-sm font-semibold",
          positive ? "text-gain" : "text-loss",
        )}
      >
        {positive ? "+" : "−"}
        {money(Math.abs(outcome.profit))} ({positive ? "+" : "−"}
        {number(Math.abs(outcome.returnPercent), 1)}%)
      </p>

      {showCaption && (
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {caption}
        </p>
      )}

      <p className="num mt-auto pt-2 text-xs text-muted-foreground">
        {money(outcome.price)} a share ·{" "}
        {outcome.annualizedPercent >= 0 ? "+" : "−"}
        {number(Math.abs(outcome.annualizedPercent), 1)}% a year
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
  icon: typeof TrendingUp;
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
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">
              <span className="num font-semibold text-foreground">
                {money(forecast.amount, 0)}
              </span>{" "}
              into{" "}
              <span className="font-semibold text-foreground">
                {forecast.name}
                {forecast.name !== forecast.symbol
                  ? ` (${forecast.symbol})`
                  : ""}
              </span>{" "}
              at{" "}
              <span className="num text-foreground">
                {money(forecast.price)}
              </span>
              , held {horizon} to {targetDate}
            </p>
          </div>
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
            detail={`${oddsPhrase(forecast.probabilityOfProfit)} ended above ${money(forecast.amount, 0)}.`}
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

        {guided && (
          <p className="rounded-xl bg-muted/50 p-4 text-sm leading-relaxed text-muted-foreground">
            In {forecast.simulations.toLocaleString()} simulated runs of{" "}
            {forecast.name} over {horizon},{" "}
            <span className="num font-medium text-foreground">
              {number(forecast.probabilityOfProfit, 0)}%
            </span>{" "}
            finished with more money than you started with. The middle run turns{" "}
            {money(forecast.amount, 0)} into{" "}
            <span className="num font-medium text-foreground">
              {money(forecast.likely.value, 0)}
            </span>
            . One run in ten did better than {money(forecast.best.value, 0)}, and
            one in ten did worse than {money(forecast.worst.value, 0)}.
          </p>
        )}

        <div className="grid gap-3 md:grid-cols-3">
          <OutcomeTile
            outcome={forecast.best}
            label="Best case"
            caption="A strong run. One simulation in ten ended at least this high."
            tone="gain"
            icon={TrendingUp}
            showCaption={guided}
          />
          <OutcomeTile
            outcome={forecast.likely}
            label="Most likely"
            caption="The middle of the distribution — half the runs finished above this, half below."
            tone="neutral"
            icon={Target}
            showCaption={guided}
          />
          <OutcomeTile
            outcome={forecast.worst}
            label="Worst case"
            caption="A bad run, and an entirely ordinary one. One simulation in ten ended at least this low."
            tone="loss"
            icon={TrendingDown}
            showCaption={guided}
          />
        </div>
      </Card>

      {/* ---- 2. Play with it -------------------------------------------- */}
      <ForecastOddsExplorer forecast={forecast} />

      {/* ---- 3. The path ------------------------------------------------ */}
      <Card className="gap-4 p-6">
        <div>
          <h3 className="text-base font-semibold">
            Where the price could go between now and then
          </h3>
          {guided && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              Hover or tap anywhere on the cone to read the range on that date.
            </p>
          )}
        </div>
        <ForecastFanChart band={forecast.band} entryPrice={forecast.price} />
      </Card>

      {/* ---- 4. The shape ----------------------------------------------- */}
      <Card className="gap-4 p-6">
        <div>
          <h3 className="text-base font-semibold">Where the runs landed</h3>
          {guided && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              The three numbers above are just three points picked out of this.
            </p>
          )}
        </div>
        <ForecastDistribution forecast={forecast} />
      </Card>

      {/* ---- 5. The honest part ----------------------------------------- */}
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
              One run in twenty ended at or below this — a loss of{" "}
              <span className="num">
                {money(Math.abs(forecast.stress.profit))}
              </span>
              .
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
              far below its own high along the way. A rough one fell{" "}
              <span className="num">
                {number(forecast.journey.roughDipPercent, 0)}%
              </span>
              .
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
              {forecast.symbol}&apos;s deepest real fall from a peak over the
              last five years. Not a simulation — it happened.
            </p>
          </div>
        </div>
      </Card>

      {/* ---- 6. The workings -------------------------------------------- */}
      <ForecastDetails forecast={forecast} />
    </div>
  );
}
