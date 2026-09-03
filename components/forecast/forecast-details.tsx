"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Explain, GLOSSARY } from "@/components/forecast/explain";
import { useUserSettings } from "@/components/settings/user-settings-provider";
import { describeBeta } from "@/lib/forecast/read";
import { TRADING_DAYS_PER_YEAR } from "@/lib/forecast/indicators";
import { cn } from "@/lib/utils";
import { HISTORY_YEARS, type ForecastResult } from "@/lib/forecast/engine";

/** The rungs of the ladder worth printing. Symmetric around the median. */
const LADDER = [
  { percentile: 5, label: "Worst 5%" },
  { percentile: 10, label: "Worst 10%" },
  { percentile: 25, label: "Poor quarter" },
  { percentile: 50, label: "Median" },
  { percentile: 75, label: "Good quarter" },
  { percentile: 90, label: "Best 10%" },
  { percentile: 95, label: "Best 5%" },
];

function Driver({
  label,
  value,
  hint,
  explain,
}: {
  label: string;
  value: string;
  hint: string;
  explain: string;
}) {
  return (
    <div className="rounded-xl border border-border p-3">
      <p className="text-xs text-muted-foreground">
        <Explain text={explain}>{label}</Explain>
      </p>
      <p className="num mt-1 text-sm font-semibold">{value}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}

/**
 * The workings.
 *
 * Collapsed by default — a first-time reader who opens the page and meets a
 * MACD histogram closes the tab. But it is never *removed*, because the reader
 * who does want it is the reader most likely to pay, and a forecast that won't
 * show its inputs is a horoscope.
 */
export function ForecastDetails({ forecast }: { forecast: ForecastResult }) {
  const { money, number } = useUserSettings();
  const [open, setOpen] = useState(false);
  const { drivers } = forecast;

  const shares = forecast.price > 0 ? forecast.amount / forecast.price : 0;
  const years = forecast.tradingDays / TRADING_DAYS_PER_YEAR;

  const rsiHint =
    drivers.rsi === null
      ? "No reading"
      : drivers.rsi >= 70
        ? "Overbought"
        : drivers.rsi <= 30
          ? "Oversold"
          : "Neutral";

  const signed = (value: number, digits = 1) =>
    `${value >= 0 ? "+" : "−"}${number(Math.abs(value), digits)}`;

  return (
    <div className="rounded-2xl border border-border">
      <button
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <span>
          <span className="text-sm font-semibold">Show the full workings</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            Every percentile, how the expected return was reached, sixteen
            measured inputs, and the {forecast.methods.length}{" "}
            named methods behind them.
          </span>
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="flex flex-col gap-6 border-t border-border p-5">
          {/* ---- The ladder --------------------------------------------- */}
          <div>
            <p className="text-sm font-medium">
              Every outcome, by{" "}
              <Explain text={GLOSSARY.percentile}>percentile</Explain>
            </p>
            <div className="mt-3 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Outcome</TableHead>
                    <TableHead className="text-right">Share price</TableHead>
                    <TableHead className="text-right">Your stake</TableHead>
                    <TableHead className="text-right">Profit</TableHead>
                    <TableHead className="text-right">Per year</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {LADDER.map((rung) => {
                    const price = forecast.percentiles[rung.percentile];
                    const value = shares * price;
                    const profit = value - forecast.amount;
                    const growth =
                      forecast.amount > 0 ? value / forecast.amount : 1;
                    const perYear =
                      years > 0 && growth > 0
                        ? (Math.pow(growth, 1 / years) - 1) * 100
                        : 0;
                    return (
                      <TableRow
                        key={rung.percentile}
                        className={cn(rung.percentile === 50 && "bg-muted/50")}
                      >
                        <TableCell className="whitespace-nowrap">
                          <span
                            className={cn(
                              rung.percentile === 50 && "font-semibold",
                            )}
                          >
                            {rung.label}
                          </span>
                          <span className="num ml-1.5 text-xs text-muted-foreground">
                            P{rung.percentile}
                          </span>
                        </TableCell>
                        <TableCell className="num text-right">
                          {money(price)}
                        </TableCell>
                        <TableCell className="num text-right">
                          {money(value)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "num text-right",
                            profit >= 0 ? "text-gain" : "text-loss",
                          )}
                        >
                          {profit >= 0 ? "+" : "−"}
                          {money(Math.abs(profit))}
                        </TableCell>
                        <TableCell className="num text-right">
                          {signed(perYear)}%
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* ---- Mean vs median ----------------------------------------- */}
          <div className="rounded-xl border border-border bg-muted/40 p-4">
            <p className="text-sm font-medium">
              Why the average beats the middle
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              The average run ends at{" "}
              <span className="num text-foreground">
                {money(forecast.expected.value)}
              </span>
              , the middle one at{" "}
              <span className="num text-foreground">
                {money(forecast.likely.value)}
              </span>
              . A handful of enormous winners drag the average up, so the
              typical result is the lower of the two. That gap is{" "}
              <Explain text={GLOSSARY.volatilityDrag}>volatility drag</Explain>,
              and it is real money.
            </p>
          </div>

          {/* ---- How the expected return was arrived at ------------------ */}
          <div className="rounded-xl border border-border bg-muted/40 p-4">
            <p className="text-sm font-medium">
              Where the{" "}
              <Explain text={GLOSSARY.drift}>expected return</Explain> came from
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Its own{" "}
              <Explain text={GLOSSARY.totalReturn}>total return</Explain> over
              the sample worked out at{" "}
              <span className="num text-foreground">
                {signed(drivers.measuredDriftPercent)}%
              </span>{" "}
              a year — but a single stock&rsquo;s track record is mostly luck,
              so it is pulled toward{" "}
              <span className="num text-foreground">
                {signed(drivers.priorDriftPercent)}%
              </span>
              , the return its{" "}
              <Explain text={GLOSSARY.beta}>market exposure</Explain> alone
              would earn. Its own history kept{" "}
              <span className="num text-foreground">
                {number(drivers.driftReliabilityPercent, 0)}%
              </span>{" "}
              of the weight. The four signals below then moved it{" "}
              <span className="num text-foreground">
                {signed(drivers.signalTiltPercent, 2)}%
              </span>
              , landing at{" "}
              <span className="num text-foreground">
                {signed(drivers.annualDriftPercent)}%
              </span>{" "}
              — give or take{" "}
              <span className="num text-foreground">
                {number(drivers.driftUncertaintyPercent, 1)}%
              </span>
              , which every run{" "}
              <Explain text={GLOSSARY.driftUncertainty}>draws for itself</Explain>{" "}
              rather than pretending away.
            </p>
          </div>

          {/* ---- Measured inputs ---------------------------------------- */}
          <div>
            <p className="text-sm font-medium">What the numbers were built on</p>

            <p className="mt-3 text-xs font-medium text-muted-foreground">
              Return and market exposure
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Driver
                label="Expected return"
                value={`${signed(drivers.annualDriftPercent)}% / yr`}
                hint={`± ${number(drivers.driftUncertaintyPercent, 1)}% either way`}
                explain={GLOSSARY.drift}
              />
              <Driver
                label="Beta to the S&P 500"
                value={number(drivers.beta, 2)}
                hint={
                  drivers.betaMeasured
                    ? `${describeBeta(drivers.beta)} · r ${
                        drivers.marketCorrelation === null
                          ? "—"
                          : number(drivers.marketCorrelation, 2)
                      }`
                    : "Estimated from volatility"
                }
                explain={GLOSSARY.beta}
              />
              <Driver
                label="Momentum 12−1"
                value={
                  drivers.momentum12m1Percent === null
                    ? "—"
                    : `${signed(drivers.momentum12m1Percent)}%`
                }
                hint="Past year, last month excluded"
                explain={GLOSSARY.momentum}
              />
              <Driver
                label="Signal tilt"
                value={`${signed(drivers.signalTiltPercent, 2)}% / yr`}
                hint="All four signals, netted"
                explain={GLOSSARY.drift}
              />
            </div>

            <p className="mt-4 text-xs font-medium text-muted-foreground">
              Volatility, and where it is heading
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Driver
                label="Over this horizon"
                value={`${number(drivers.annualVolatilityPercent, 1)}% / yr`}
                hint="What the bands were drawn with"
                explain={GLOSSARY.volatility}
              />
              <Driver
                label="Right now"
                value={`${number(drivers.spotVolatilityPercent, 1)}% / yr`}
                hint="EWMA, λ = 0.94"
                explain={GLOSSARY.volatility}
              />
              <Driver
                label="Long-run level"
                value={`${number(drivers.longRunVolatilityPercent, 1)}% / yr`}
                hint="What it reverts to"
                explain={GLOSSARY.volatilityTermStructure}
              />
              <Driver
                label="Vs 200-day avg"
                value={
                  drivers.gapToSma200Percent === null
                    ? "—"
                    : `${signed(drivers.gapToSma200Percent)}%`
                }
                hint="Trend anchor"
                explain={GLOSSARY.sma200}
              />
            </div>

            <p className="mt-4 text-xs font-medium text-muted-foreground">
              The shape of the risk
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Driver
                label="Daily VaR 95%"
                value={`−${number(drivers.dailyVaR95Percent, 2)}%`}
                hint="Typical bad day"
                explain={GLOSSARY.var95}
              />
              <Driver
                label="Expected shortfall"
                value={`−${number(drivers.dailyCVaR95Percent, 2)}%`}
                hint="Average of the worst 5%"
                explain={GLOSSARY.expectedShortfall}
              />
              <Driver
                label="Skew"
                value={signed(drivers.returnSkew, 2)}
                hint={
                  drivers.returnSkew < 0
                    ? "Falls come faster than rises"
                    : "Rises come faster than falls"
                }
                explain={GLOSSARY.skew}
              />
              <Driver
                label="Excess kurtosis"
                value={number(drivers.excessKurtosis, 1)}
                hint="0 would be a bell curve"
                explain={GLOSSARY.fatTails}
              />
              <Driver
                label="RSI (14)"
                value={drivers.rsi === null ? "—" : number(drivers.rsi, 0)}
                hint={rsiHint}
                explain={GLOSSARY.rsi}
              />
              <Driver
                label="MACD histogram"
                value={
                  drivers.macdHistogram === null
                    ? "—"
                    : number(drivers.macdHistogram, 2)
                }
                hint="12 / 26 / 9"
                explain={GLOSSARY.macd}
              />
              <Driver
                label="Typical dip in a run"
                value={`−${number(forecast.journey.medianDipPercent, 1)}%`}
                hint={`Rough run: −${number(forecast.journey.roughDipPercent, 1)}%`}
                explain={GLOSSARY.simulatedDip}
              />
              <Driver
                label="Deepest real fall"
                value={`−${number(drivers.maxDrawdownPercent, 1)}%`}
                hint={`Last ${HISTORY_YEARS} years, actual`}
                explain={GLOSSARY.drawdown}
              />
            </div>
          </div>

          {/* ---- Provenance --------------------------------------------- */}
          <div className="border-t border-border pt-4">
            <p className="text-xs font-medium">Methods used</p>
            <ul className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {forecast.methods.map((method) => (
                <li
                  key={method}
                  className="flex gap-2 text-[11px] leading-relaxed text-muted-foreground"
                >
                  <span aria-hidden className="text-muted-foreground/50">
                    ·
                  </span>
                  {method}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground/70">
              Built from {forecast.historyDays.toLocaleString()} daily closes and{" "}
              {forecast.simulations.toLocaleString()} simulated paths over{" "}
              {forecast.tradingDays.toLocaleString()} trading days. These are
              simulated probabilities, not predictions. Not investment advice.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
