"use client";

import { ShieldAlert, TrendingDown, TrendingUp, Target } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ForecastFanChart } from "@/components/forecast/forecast-fan-chart";
import { useUserSettings } from "@/components/settings/user-settings-provider";
import { cn } from "@/lib/utils";
import type { ForecastOutcome, ForecastResult } from "@/lib/forecast/engine";

/** "45 days" / "8 months" / "3.5 years", whichever reads most naturally. */
export function describeHorizon(days: number): string {
  if (days < 60) return `${Math.round(days)} days`;
  if (days < 730) {
    const months = Math.round(days / 30.44);
    return months === 1 ? "1 month" : `${months} months`;
  }
  const years = days / 365.25;
  const rounded = Math.round(years * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} years`;
}

function OutcomeTile({
  outcome,
  label,
  caption,
  tone,
  icon: Icon,
}: {
  outcome: ForecastOutcome;
  label: string;
  caption: string;
  tone: "gain" | "loss" | "neutral";
  icon: typeof TrendingUp;
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

      <p className="num text-2xl font-semibold tracking-tight">
        {money(outcome.value)}
      </p>

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

      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        {caption}
      </p>

      <p className="num mt-auto pt-2 text-xs text-muted-foreground">
        Share price {money(outcome.price)} · {outcome.annualizedPercent >= 0 ? "+" : "−"}
        {number(Math.abs(outcome.annualizedPercent), 1)}% a year
      </p>
    </div>
  );
}

function Driver({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="num mt-0.5 text-sm font-semibold">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function ForecastResultView({
  forecast,
  isSample,
}: {
  forecast: ForecastResult;
  isSample: boolean;
}) {
  const { money, number } = useUserSettings();
  const { drivers } = forecast;

  const horizon = describeHorizon(forecast.horizonDays);
  const targetDate = new Date(forecast.targetDate).toLocaleDateString("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const rsiHint =
    drivers.rsi === null
      ? undefined
      : drivers.rsi >= 70
        ? "Overbought"
        : drivers.rsi <= 30
          ? "Oversold"
          : "Neutral";

  return (
    <Card className="gap-6 p-6">
      {/* ---- What was asked ------------------------------------------ */}
      <div>
        <p className="text-sm text-muted-foreground">
          If you put{" "}
          <span className="num font-semibold text-foreground">
            {money(forecast.amount, 0)}
          </span>{" "}
          into{" "}
          <span className="font-semibold text-foreground">
            {forecast.name}
            {forecast.name !== forecast.symbol ? ` (${forecast.symbol})` : ""}
          </span>{" "}
          today at{" "}
          <span className="num text-foreground">{money(forecast.price)}</span>{" "}
          and held it for {horizon}, to {targetDate}:
        </p>
        {isSample && (
          <p className="mt-2 inline-flex rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
            Free sample — the same engine runs on any stock with Pro
          </p>
        )}
      </div>

      {/* ---- The two sides -------------------------------------------- */}
      <div className="grid gap-3 md:grid-cols-3">
        <OutcomeTile
          outcome={forecast.best}
          label="Best case"
          caption="A strong run. One simulation in ten ended at least this high."
          tone="gain"
          icon={TrendingUp}
        />
        <OutcomeTile
          outcome={forecast.likely}
          label="Most likely"
          caption="The middle of the distribution — half of the runs finished above this, half below."
          tone="neutral"
          icon={Target}
        />
        <OutcomeTile
          outcome={forecast.worst}
          label="Worst case"
          caption="A bad run, and an entirely ordinary one. One simulation in ten ended at least this low."
          tone="loss"
          icon={TrendingDown}
        />
      </div>

      {/* ---- Odds ------------------------------------------------------ */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-medium">
            <span className="num">{number(forecast.probabilityOfProfit, 0)}%</span>{" "}
            of runs finished with more money than you started with
          </p>
          <p className="num text-xs text-muted-foreground">
            {forecast.simulations.toLocaleString()} simulations ·{" "}
            {forecast.tradingDays.toLocaleString()} trading days
          </p>
        </div>
        <div
          className="flex h-2.5 overflow-hidden rounded-full bg-loss-soft"
          role="img"
          aria-label={`${Math.round(forecast.probabilityOfProfit)} percent of simulations ended in profit`}
        >
          <div
            className="h-full bg-gain"
            style={{ width: `${forecast.probabilityOfProfit}%` }}
          />
        </div>
      </div>

      {/* ---- The cone -------------------------------------------------- */}
      <div>
        <p className="mb-2 text-sm font-medium">
          Where the price could go between now and then
        </p>
        <ForecastFanChart band={forecast.band} />
      </div>

      {/* ---- The tail -------------------------------------------------- */}
      <div className="flex items-start gap-3 rounded-2xl border border-loss/25 bg-loss-soft/30 p-4">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-loss" />
        <p className="text-sm leading-relaxed">
          <span className="font-medium">The bad tail.</span> One run in twenty
          ended at or below{" "}
          <span className="num font-semibold">{money(forecast.stress.value)}</span>{" "}
          — a loss of{" "}
          <span className="num font-semibold text-loss">
            {money(Math.abs(forecast.stress.profit))}
          </span>
          . Over the last five years {forecast.symbol} has already fallen{" "}
          <span className="num">{number(drivers.maxDrawdownPercent, 1)}%</span>{" "}
          from a peak at its worst.
        </p>
      </div>

      {/* ---- What drove it --------------------------------------------- */}
      <div>
        <p className="text-sm font-medium">What the numbers were built on</p>
        <p className="mt-0.5 mb-2 text-xs leading-relaxed text-muted-foreground">
          Expected return is the <em>average</em> of every run. &ldquo;Most
          likely&rdquo; is the <em>middle</em> one, and for a volatile stock the
          middle sits below the average — a handful of enormous winners drag the
          average up. That gap is volatility drag, and it is real money.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Driver
            label="Expected return"
            value={`${drivers.annualDriftPercent >= 0 ? "+" : "−"}${number(Math.abs(drivers.annualDriftPercent), 1)}% / yr`}
            hint="Risk-adjusted, shrunk"
          />
          <Driver
            label="Volatility"
            value={`${number(drivers.annualVolatilityPercent, 1)}% / yr`}
            hint="EWMA-weighted"
          />
          <Driver
            label="RSI (14)"
            value={drivers.rsi === null ? "—" : number(drivers.rsi, 0)}
            hint={rsiHint}
          />
          <Driver
            label="Momentum 12−1"
            value={
              drivers.momentum12m1Percent === null
                ? "—"
                : `${drivers.momentum12m1Percent >= 0 ? "+" : "−"}${number(Math.abs(drivers.momentum12m1Percent), 1)}%`
            }
            hint="Past year, last month excluded"
          />
          <Driver
            label="Vs 200-day avg"
            value={
              drivers.gapToSma200Percent === null
                ? "—"
                : `${drivers.gapToSma200Percent >= 0 ? "+" : "−"}${number(Math.abs(drivers.gapToSma200Percent), 1)}%`
            }
            hint="Trend anchor"
          />
          <Driver
            label="MACD histogram"
            value={
              drivers.macdHistogram === null
                ? "—"
                : number(drivers.macdHistogram, 2)
            }
            hint="12 / 26 / 9"
          />
          <Driver
            label="Daily VaR 95%"
            value={`−${number(drivers.dailyVaR95Percent, 2)}%`}
            hint="Typical bad day"
          />
          <Driver
            label="Expected shortfall"
            value={`−${number(drivers.dailyCVaR95Percent, 2)}%`}
            hint="Average of the worst 5%"
          />
        </div>
      </div>

      {/* ---- Provenance ------------------------------------------------ */}
      <div className="border-t border-border pt-4">
        <p className="text-[11px] leading-relaxed text-muted-foreground/70">
          <span className="font-medium">Methods used:</span>{" "}
          {forecast.methods.join(" · ")}. Built from{" "}
          {forecast.historyDays.toLocaleString()} daily closes.
        </p>
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground/70">
          These are simulated probabilities, not predictions. Nobody can know
          where a price will go; what the model can say is how wide the range of
          reasonable outcomes is, given how this stock has actually behaved. Not
          investment advice.
        </p>
      </div>
    </Card>
  );
}
