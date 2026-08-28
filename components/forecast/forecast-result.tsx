"use client";

import { useState } from "react";
import { Activity, Landmark, Route, ShieldAlert, Target } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SegmentedControl } from "@/components/settings/setting-row";
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
 * tenth at the right, the middle outcome marked, and the colour changing where
 * your stake breaks even.
 *
 * Everything on it is labelled where it sits rather than in a caption
 * underneath. A reader asked, reasonably, what the dot was and what "10%" at
 * the ends was 10% *of* — both of which the old version expected them to
 * infer. The dot now carries its own tag on a leader line, and each end says
 * in words what reaching it would mean.
 *
 * There is deliberately no break-even label. An earlier version put one in a
 * three-column row under the bar, which pinned it to dead centre while its
 * tick sat wherever break-even actually fell — so the median could render
 * visually *left* of a label claiming to mark a lower number.
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
  // Keep the tag and its leader line clear of both edges. The median sits
  // between the two ends by construction, so this almost never bites.
  const tagAt = Math.min(82, Math.max(18, median));
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
        {/* The dot says what it is, on a leader line down to itself. */}
        <div
          className="absolute -top-9 flex -translate-x-1/2 flex-col items-center"
          style={{ left: `${tagAt}%` }}
        >
          <span className="rounded-md bg-foreground px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap text-background">
            Middle outcome
          </span>
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

      <div className="mt-2.5 flex items-start justify-between gap-6 text-[11px] leading-relaxed">
        <span className="text-left">
          <span className="block font-medium">If it goes badly</span>
          <span className="num block text-base font-semibold text-loss">
            {money(low, 0)}
          </span>
          <span className="block text-muted-foreground">
            1 run in 10 ended below this
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
  const runs = forecast.simulations.toLocaleString();
  const longHorizon = forecast.horizonDays >= LONG_HORIZON_DAYS;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
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

        {/* Says what a "run" is, once, before the word is used forty times. */}
        {guided && (
          <p className="rounded-xl bg-muted/50 p-4 text-sm leading-relaxed text-muted-foreground">
            We played the next {horizon} out{" "}
            <span className="font-medium text-foreground">{runs} times</span>,
            using how {forecast.name} has actually moved over the last five
            years — different luck each time. Each of those is a{" "}
            <span className="font-medium text-foreground">run</span>, and every
            number on this page is counted from how those {runs} runs ended.
          </p>
        )}

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
            {longHorizon && (
              <>
                {" "}
                · works out at{" "}
                <span className="num">
                  {forecast.likely.annualizedPercent >= 0 ? "+" : "−"}
                  {number(Math.abs(forecast.likely.annualizedPercent), 1)}%
                </span>{" "}
                a year
              </>
            )}
          </p>
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
          {guided && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              All {runs} endings, sorted into columns by how much you were left
              with. The bar above picks three points out of this shape; this is
              the whole of it.
            </p>
          )}
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
              If it goes really badly
            </p>
            <p className="num-display mt-1 text-xl text-loss">
              {money(forecast.stress.value)}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              1 run in 20 ended at or below this — worse than the bad end of
              the bar above.
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
              Half the runs{" "}
              <Explain text={GLOSSARY.drawdown}>dropped</Explain> at least this
              far below their own high at some point on the way — including
              runs that ended up fine. You would have had to sit through it.
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
              {forecast.symbol}&apos;s deepest real fall from a peak in the last
              five years. Not a simulation — it happened.
            </p>
          </div>
        </div>
      </Card>

      {/* ---- 4. The workings -------------------------------------------- */}
      <ForecastDetails forecast={forecast} />
    </div>
  );
}
