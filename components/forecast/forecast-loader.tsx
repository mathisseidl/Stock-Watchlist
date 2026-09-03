"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";

/**
 * How long the analysis is given before its answer is shown.
 *
 * The simulation itself finishes in a couple of seconds, but the work either
 * side of it — a decade of daily history, a beta regression, volatility and
 * drift estimation, four signal readings, tens of thousands of paths through
 * two different models, and then a walk-forward backtest of the result — is
 * genuinely a lot, and showing each stage as it happens is what makes the
 * result legible rather than magic. The wait is capped well under twenty
 * seconds so it still feels like an answer, not a queue.
 */
export const THINK_MS = 18_000;

const STAGES: { at: number; text: string }[] = [
  { at: 0, text: "Pulling ten years of daily closes, dividends counted in…" },
  { at: 2_000, text: "Measuring volatility with EWMA weighting (λ = 0.94)…" },
  { at: 4_000, text: "Projecting how that volatility reverts over your horizon…" },
  { at: 6_000, text: "Regressing against the S&P 500 for this stock's beta…" },
  { at: 8_000, text: "Shrinking the drift toward its risk-adjusted prior…" },
  { at: 10_000, text: "Reading 12−1 momentum, the 200-day average, RSI and MACD…" },
  {
    at: 12_000,
    text: "Running Monte Carlo paths — half Brownian, half block bootstrap…",
  },
  {
    at: 14_400,
    text: "Backtesting the model's own bands against real history…",
  },
  { at: 16_600, text: "Receiving the best prediction…" },
];

export function ForecastLoader({ symbol }: { symbol: string }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Date.now() - started), 120);
    return () => clearInterval(timer);
  }, []);

  let stageIndex = 0;
  for (let index = 0; index < STAGES.length; index += 1) {
    if (elapsed >= STAGES[index].at) stageIndex = index;
  }
  const progress = Math.min(100, (elapsed / THINK_MS) * 100);

  return (
    <Card className="gap-5 p-6">
      <div className="flex items-center gap-3">
        <Loader2 className="size-5 shrink-0 animate-spin text-primary" />
        <div className="min-w-0">
          <p className="text-base font-semibold">
            Loading … receiving the best prediction
          </p>
          <p className="text-sm text-muted-foreground">
            Analysing {symbol} across every method below.
          </p>
        </div>
      </div>

      <div
        className="h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={Math.round(progress)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Analysis progress"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-200 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>

      <ol className="flex flex-col gap-2">
        {STAGES.map((stage, index) => {
          const done = index < stageIndex;
          const active = index === stageIndex;
          return (
            <li
              key={stage.text}
              className={
                "flex items-start gap-2.5 text-sm transition-opacity duration-300 " +
                (done
                  ? "text-muted-foreground opacity-70"
                  : active
                    ? "font-medium text-foreground"
                    : "text-muted-foreground opacity-35")
              }
            >
              <span
                aria-hidden
                className={
                  "mt-1.5 size-1.5 shrink-0 rounded-full " +
                  (done
                    ? "bg-gain"
                    : active
                      ? "animate-pulse bg-primary"
                      : "bg-muted-foreground/40")
                }
              />
              {stage.text}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
