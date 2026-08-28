"use client";

import { useState } from "react";
import {
  Activity,
  CircleHelp,
  Landmark,
  ShieldAlert,
  Target,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { ForecastDistribution } from "@/components/forecast/forecast-distribution";
import { ForecastDetails } from "@/components/forecast/forecast-details";
import { Explain, GLOSSARY } from "@/components/forecast/explain";
import { useUserSettings } from "@/components/settings/user-settings-provider";
import { describeHorizon, describeRisk, describeVerdict, oddsPhrase } from "@/lib/forecast/read";
import { cn } from "@/lib/utils";
import type { ForecastResult } from "@/lib/forecast/engine";

/** Past about eighteen months a total return stops being intuitive on its own. */
const LONG_HORIZON_DAYS = 550;

/** `oddsPhrase` returns a fragment; this starts a sentence with it. */
function sentenceCase(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

/**
 * The whole spread on one axis: the unlucky tenth at the left edge, the lucky
 * tenth at the right, the middle outcome marked and priced, and the colour
 * changing where your stake breaks even.
 *
 * Everything is labelled where it sits rather than in a caption underneath. A
 * reader asked what the dot was and what "10%" at the ends was 10% *of* — both
 * of which the old version expected them to infer.
 *
 * There is deliberately no break-even label. An earlier version put one in a
 * three-column row under the bar, which pinned it to dead centre while its
 * tick sat wherever break-even actually fell — so the median could render
 * visually *left* of a label claiming to mark a lower number.
 */
function OutcomeRange({ forecast }: { forecast: ForecastResult }) {
  const { money } = useUserSettings();
  const [explaining, setExplaining] = useState(false);

  const low = forecast.worst.value;
  const high = forecast.best.value;
  const span = high - low || 1;
  const position = (value: number) =>
    Math.min(100, Math.max(0, ((value - low) / span) * 100));

  const breakEven = position(forecast.amount);
  const median = position(forecast.likely.value);
  // Keep the tag, its leader line and the price under it clear of both edges.
  // The median sits between the two ends by construction, so this rarely bites.
  const tagAt = Math.min(78, Math.max(22, median));
  const stake = money(forecast.amount, 0);

  const caption =
    forecast.amount <= low
      ? `Even the unluckiest tenth of runs finished above your ${stake}.`
      : forecast.amount >= high
        ? `Even the luckiest tenth of runs finished below your ${stake}.`
        : `The red stretch is where you end up with less than the ${stake} you put in.`;

  return (
    <div className="pt-9">
      <div className="relative">
        <div
          className="absolute -top-9 flex -translate-x-1/2 flex-col items-center"
          style={{ left: `${tagAt}%` }}
        >
          {/* Opens upward, over the headline, so it never covers the bar or
              shifts the layout underneath it. */}
          {explaining && (
            <span className="absolute bottom-full left-1/2 mb-2 w-56 -translate-x-1/2 rounded-lg border border-border bg-popover p-2.5 text-[11px] leading-relaxed font-normal text-muted-foreground shadow-lg">
              Half the runs did better than this midpoint value, half did worse.
            </span>
          )}
          <button
            type="button"
            onClick={() => setExplaining((previous) => !previous)}
            aria-expanded={explaining}
            className="flex items-center gap-1 rounded-md bg-foreground px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap text-background"
          >
            Middle outcome
            <CircleHelp className="size-3 opacity-70" />
          </button>
          <span aria-hidden className="h-2.5 w-px bg-foreground/50" />
        </div>

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
      </div>

      <div className="relative mt-2.5 flex items-start justify-between gap-6 text-[11px] leading-relaxed">
        <span className="text-left">
          <span className="block font-medium">If it goes badly</span>
          <span className="num block text-base font-semibold text-loss">
            {money(low, 0)}
          </span>
          <span className="block text-muted-foreground">
            1 run in 10 ended below this
          </span>
        </span>

        {/* The midpoint's own price, sitting under its dot. */}
        <span
          className="absolute top-0 -translate-x-1/2 text-center"
          style={{ left: `${tagAt}%` }}
        >
          <span className="num block text-base font-semibold">
            {money(forecast.likely.value, 0)}
          </span>
        </span>

        <span className="text-right">
          <span className="block font-medium">If it goes well</span>
          <span className="num block text-base font-semibold text-gain">
            {money(high, 0)}
          </span>
          <span className="block text-muted-foreground">
            1 run in 10 ended above this
          </span>
        </span>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
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

/**
 * One of the three downside answers.
 *
 * Labelled with the question it answers rather than a noun. "The ride down"
 * told the reader nothing; "How rough does it get on the way?" tells them
 * what they are about to find out.
 */
function DownsideTile({
  question,
  value,
  tone,
  children,
}: {
  question: string;
  value: string;
  tone: "loss" | "neutral";
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-xl border p-4",
        tone === "loss"
          ? "border-loss/25 bg-loss-soft/30"
          : "border-border",
      )}
    >
      <p className="text-xs font-medium">{question}</p>
      <p
        className={cn(
          "num-display mt-1.5 text-2xl",
          tone === "loss" && "text-loss",
        )}
      >
        {value}
      </p>
      <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
        {children}
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

  const horizon = describeHorizon(forecast.horizonDays);
  const targetDate = new Date(forecast.targetDate).toLocaleDateString("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const risk = describeRisk(forecast.drivers.annualVolatilityPercent);
  const upside = forecast.likely.profit >= 0;
  const beatsCash = forecast.cash.probabilityOfBeating;
  const runs = forecast.simulations.toLocaleString();
  const longHorizon = forecast.horizonDays >= LONG_HORIZON_DAYS;

  // The dip is measured from each run's *own* peak, not from what you paid —
  // so it cannot be quoted as "your $1,000 became $X". Walking through the
  // median outcome instead keeps it concrete without making it wrong.
  const dipFrom = forecast.likely.value;
  const dipTo = dipFrom * (1 - forecast.journey.medianDipPercent / 100);
  const historicalLow =
    forecast.amount * (1 - forecast.drivers.maxDrawdownPercent / 100);

  return (
    <div className="flex flex-col gap-4">
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

        <p className="rounded-xl bg-muted/50 p-4 text-sm leading-relaxed text-muted-foreground">
          We played the next {horizon} out{" "}
          <span className="font-medium text-foreground">{runs} times</span>,
          using how {forecast.name} has actually moved over the last five years.
        </p>

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
          {longHorizon && (
            <p className="mt-1 text-sm text-muted-foreground">
              works out at{" "}
              <span className="num">
                {forecast.likely.annualizedPercent >= 0 ? "+" : "−"}
                {number(Math.abs(forecast.likely.annualizedPercent), 1)}%
              </span>{" "}
              a year
            </p>
          )}
        </div>

        <OutcomeRange forecast={forecast} />

        <div className="grid gap-3 sm:grid-cols-3">
          <KeyStat
            icon={Target}
            label="Chance of a profit"
            value={`${number(forecast.probabilityOfProfit, 0)}%`}
            tone={forecast.probabilityOfProfit >= 50 ? "gain" : "loss"}
            detail={`${sentenceCase(oddsPhrase(forecast.probabilityOfProfit))} ended with more than the ${money(forecast.amount, 0)} you put in.`}
          />
          <KeyStat
            icon={Landmark}
            label="Chance of beating cash"
            value={`${number(beatsCash, 0)}%`}
            tone={beatsCash >= 50 ? "gain" : "loss"}
            detail={
              <>
                Cash in a{" "}
                <Explain text={GLOSSARY.riskFree}>
                  {number(forecast.cash.annualRatePercent, 0)}% savings account
                </Explain>{" "}
                reaches {money(forecast.cash.value, 0)} with no risk at all.
                That is the bar this has to clear to be worth doing.
              </>
            }
          />
          <KeyStat
            icon={Activity}
            label="How rough a ride"
            value={risk.label}
            detail={`In a normal year it drifts about ${number(forecast.drivers.annualVolatilityPercent, 0)}% away from where it started, up or down. ${risk.detail}`}
          />
        </div>
      </Card>

      {/* ---- 2. The shape ----------------------------------------------- */}
      <Card className="gap-4 p-6">
        <div>
          <h3 className="text-base font-semibold">Where the runs landed</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            All {runs} endings, sorted into columns by how much you were left
            with.
          </p>
        </div>
        <ForecastDistribution forecast={forecast} />
      </Card>

      {/* ---- 3. The honest part ----------------------------------------- */}
      <Card className="gap-4 border-loss/25 p-6">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-loss-soft">
            <ShieldAlert className="size-4 text-loss" />
          </span>
          <div>
            <h3 className="text-base font-semibold">Before you get excited</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Three ways this could hurt: how badly it could end, how bad it
              could feel on the way there, and what has already happened for
                real.
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <DownsideTile
            question="How badly could it end?"
            value={money(forecast.stress.value)}
            tone="loss"
          >
            1 run in 20 — a 5% chance — finished here or lower. You would be
            down{" "}
            <span className="num font-medium text-foreground">
              {money(Math.abs(forecast.stress.profit))}
            </span>{" "}
            of the {money(forecast.amount, 0)} you put in.
          </DownsideTile>

          <DownsideTile
            question="How bad does it feel on the way?"
            value={`−${number(forecast.journey.medianDipPercent, 0)}%`}
            tone="neutral"
          >
            Nothing climbs in a straight line. Half the runs fell at least this
            far from their own best moment before the end — a position worth{" "}
            <span className="num text-foreground">{money(dipFrom, 0)}</span>{" "}
            sliding back to{" "}
            <span className="num text-foreground">{money(dipTo, 0)}</span>.
            That is the moment people sell.
          </DownsideTile>

          <DownsideTile
            question="Has that really happened?"
            value={`−${number(forecast.drivers.maxDrawdownPercent, 0)}%`}
            tone="neutral"
          >
            Yes — this is not a simulation. {forecast.symbol} really fell this
            far from a peak in the last five years. Anyone who bought at that
            top watched {money(forecast.amount, 0)} show as{" "}
            <span className="num text-foreground">
              {money(historicalLow, 0)}
            </span>{" "}
            at the bottom.
          </DownsideTile>
        </div>
      </Card>

      {/* ---- 4. The workings -------------------------------------------- */}
      <ForecastDetails forecast={forecast} />
    </div>
  );
}
