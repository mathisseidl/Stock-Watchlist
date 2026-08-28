"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowUpRight, Lock, MoveRight, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { SymbolCombobox } from "@/components/search/symbol-combobox";
import { ForecastLoader, THINK_MS } from "@/components/forecast/forecast-loader";
import { ForecastResultView } from "@/components/forecast/forecast-result";
import { useProStatus } from "@/hooks/use-pro";
import { useWatchlist } from "@/components/watchlist/watchlist-provider";
import { SAMPLE_FORECAST } from "@/lib/forecast/sample";
import { MAX_HORIZON_DAYS, MIN_HORIZON_DAYS } from "@/lib/forecast/engine";
import { cn } from "@/lib/utils";
import type { ForecastResult } from "@/lib/forecast/engine";
import type { SymbolSearchResult } from "@/lib/market-data/types";

/** Why the forecast is worth paying for, in the reader's own terms. */
const SELLING_POINTS = [
  "Any listed company with a year of history, not just the index.",
  "Both sides in dollars: what a good run pays, what a bad one costs.",
  "All 14 methods named under every result, so you can check the work.",
  "Any horizon from a week to ten years, on a date you pick.",
];

const QUICK_HORIZONS = [
  { label: "30 days", days: 30 },
  { label: "3 months", days: 91 },
  { label: "6 months", days: 183 },
  { label: "1 year", days: 365 },
  { label: "3 years", days: 1096 },
  { label: "5 years", days: 1826 },
];

function isoDaysFromNow(days: number) {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

function daysUntil(dateString: string) {
  const target = new Date(`${dateString}T00:00:00`).getTime();
  if (Number.isNaN(target)) return 0;
  return Math.round((target - Date.now()) / 86_400_000);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type Phase = "idle" | "thinking" | "done";

function ForecastPageBody() {
  const searchParams = useSearchParams();
  const { isPaid, ready: planReady } = useProStatus();
  const { items } = useWatchlist();

  // Arriving from a stock page pre-fills the ticker.
  const [symbolInput, setSymbolInput] = useState(
    () => searchParams.get("symbol")?.toUpperCase() ?? "",
  );
  const [picked, setPicked] = useState<SymbolSearchResult | null>(null);
  const [topResult, setTopResult] = useState<SymbolSearchResult | null>(null);
  const [amountInput, setAmountInput] = useState("1000");
  const [dateInput, setDateInput] = useState(() => isoDaysFromNow(365));

  const [phase, setPhase] = useState<Phase>("idle");
  const [pending, setPending] = useState<{ symbol: string } | null>(null);
  const [result, setResult] = useState<ForecastResult | null>(null);
  const [isSample, setIsSample] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const horizonDays = daysUntil(dateInput);
  const horizonValid =
    horizonDays >= MIN_HORIZON_DAYS && horizonDays <= MAX_HORIZON_DAYS;

  const minDate = useMemo(() => isoDaysFromNow(MIN_HORIZON_DAYS), []);
  const maxDate = useMemo(() => isoDaysFromNow(MAX_HORIZON_DAYS), []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    // Free readers only ever run the sample, so their symbol is fixed and the
    // picker is locked. Everyone else resolves whatever they typed.
    let symbol: string = SAMPLE_FORECAST.symbol;
    let name: string | undefined = SAMPLE_FORECAST.name;

    if (isPaid) {
      const typed = symbolInput.trim();
      const resolved =
        picked?.symbol.toUpperCase() ??
        (topResult && typed.toLowerCase() !== topResult.symbol.toLowerCase()
          ? topResult.symbol.toUpperCase()
          : null) ??
        typed.toUpperCase();
      if (!resolved) {
        setError("Search for a company or ticker first.");
        return;
      }
      symbol = resolved;
      name =
        (picked?.symbol.toUpperCase() === resolved ? picked?.description : null) ??
        (topResult?.symbol.toUpperCase() === resolved
          ? topResult?.description
          : null) ??
        undefined;
    }

    const amount = parseFloat(amountInput);
    if (!amount || amount <= 0) {
      setError("Enter an amount greater than $0.");
      return;
    }
    if (!horizonValid) {
      setError("Pick a date between a week and ten years from today.");
      return;
    }

    setPhase("thinking");
    setPending({ symbol });
    setResult(null);

    const startedAt = Date.now();
    try {
      const res = await fetch("/api/forecast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, name, amount, horizonDays }),
      });
      const data = await res.json();

      if (!res.ok) {
        // Errors surface as soon as they're known — padding a failure out to
        // eighteen seconds would just be rude.
        setError(data.error ?? "Couldn't build that forecast.");
        setPhase("idle");
        return;
      }

      // Hold the analysis on screen for its full run. The simulation is real
      // work and the staged read-out is how the reader learns what produced
      // the number, so it isn't skipped just because the server was quick.
      await sleep(Math.max(0, THINK_MS - (Date.now() - startedAt)));

      setResult(data.forecast as ForecastResult);
      setIsSample(Boolean(data.isSample));
      setPhase("done");
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
      setPhase("idle");
    }
  }

  const thinking = phase === "thinking";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Forecast</h1>
          <p className="text-sm text-muted-foreground">
            What a stake in a stock could be worth on a date you choose — the
            good side and the bad side.
          </p>
        </div>
        {planReady &&
          (isPaid ? (
            <span className="rounded-full bg-gain-soft px-3 py-1 text-xs font-medium text-gain">
              Pro — any stock
            </span>
          ) : (
            <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
              Free sample — S&amp;P 500 only
            </span>
          ))}
      </div>

      {/* overflow-visible: the Card clips by default, which would cut the
          symbol picker's dropdown off at the card's bottom edge. */}
      <Card className="gap-5 overflow-visible p-6">
        <form
          onSubmit={handleSubmit}
          className="grid grid-cols-1 gap-4 sm:grid-cols-4"
        >
          <div className="flex flex-col gap-1.5">
            <label htmlFor="forecast-symbol" className="text-sm font-medium">
              Stock
            </label>
            {/* Wait for the plan before locking the field — the hook reads as
                "guest" while loading, which would show a Pro user the sample
                lock for a beat. */}
            {!planReady ? (
              <div className="h-9 rounded-lg border border-border bg-muted/40" />
            ) : isPaid ? (
              <SymbolCombobox
                id="forecast-symbol"
                value={symbolInput}
                onValueChange={(next) => {
                  setSymbolInput(next);
                  setPicked(null);
                  setError(null);
                }}
                onSelect={(next) => {
                  setPicked(next);
                  setError(null);
                }}
                onTopResultChange={setTopResult}
              />
            ) : (
              <div className="flex h-9 items-center gap-2 rounded-lg border border-border bg-muted/60 px-3 text-sm text-muted-foreground">
                <Lock className="size-3.5 shrink-0" />
                <span className="truncate">S&amp;P 500 — the free sample</span>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="forecast-amount" className="text-sm font-medium">
              Amount to invest ($)
            </label>
            <Input
              id="forecast-amount"
              type="number"
              min="1"
              value={amountInput}
              onChange={(event) => setAmountInput(event.target.value)}
              placeholder="1000"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="forecast-date" className="text-sm font-medium">
              Hold until
            </label>
            <Input
              id="forecast-date"
              type="date"
              value={dateInput}
              min={minDate}
              max={maxDate}
              onChange={(event) => {
                setDateInput(event.target.value);
                setError(null);
              }}
            />
          </div>

          <div className="flex items-end">
            <Button
              type="submit"
              className="w-full rounded-full"
              disabled={thinking}
            >
              <Sparkles className="size-4" />
              {thinking ? "Analysing…" : "Run the analysis"}
            </Button>
          </div>
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Horizon:</span>
          {QUICK_HORIZONS.map((option) => {
            const active = Math.abs(horizonDays - option.days) <= 2;
            return (
              <button
                key={option.days}
                type="button"
                onClick={() => {
                  setDateInput(isoDaysFromNow(option.days));
                  setError(null);
                }}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  active
                    ? "border-primary bg-accent text-accent-foreground"
                    : "border-border hover:bg-accent",
                )}
              >
                {option.label}
              </button>
            );
          })}
          {horizonValid && (
            <span className="num text-xs text-muted-foreground">
              = {horizonDays.toLocaleString()} days
            </span>
          )}
        </div>

        {isPaid && items.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">From your list:</span>
            {items.map((item) => (
              <button
                key={item.symbol}
                type="button"
                onClick={() => {
                  setSymbolInput(item.symbol);
                  setPicked({
                    symbol: item.symbol,
                    description: item.name,
                    type: "Common Stock",
                  });
                  setError(null);
                }}
                className="rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-accent"
              >
                {item.symbol}
              </button>
            ))}
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
      </Card>

      {thinking && pending && <ForecastLoader symbol={pending.symbol} />}

      {phase === "done" && result && (
        <ForecastResultView forecast={result} isSample={isSample} />
      )}

      {planReady && !isPaid && <ForecastUpsell hasRun={phase === "done"} />}
    </div>
  );
}

function ForecastUpsell({ hasRun }: { hasRun: boolean }) {
  return (
    <Card className="gap-4 border-primary/40 p-6 ring-1 ring-primary/20">
      <div className="flex items-start gap-3">
        <Lock className="mt-0.5 size-5 shrink-0 text-primary" />
        <div>
          <h2 className="text-base font-semibold">
            {hasRun
              ? "That was the sample. Pro runs it on anything."
              : "Forecasting any stock is a Pro feature"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Same engine either way. Pro only changes what you can point it at.
          </p>
        </div>
      </div>

      <ul className="flex flex-col gap-3">
        {SELLING_POINTS.map((point) => (
          <li key={point} className="flex gap-2.5 text-sm leading-relaxed">
            <MoveRight className="mt-1 size-3.5 shrink-0 text-primary" />
            <span>{point}</span>
          </li>
        ))}
      </ul>

      <p className="rounded-xl border border-border px-4 py-3 text-sm">
        <span className="num font-semibold">$4.99/month</span>, also unlocking
        the AI news briefings and unlimited analysis. Cancel any time.
      </p>

      <Link
        href="/account#plans"
        className={cn(buttonVariants(), "w-full rounded-full sm:w-auto sm:self-start")}
      >
        Get Pro — $4.99/month
        <ArrowUpRight className="size-4" />
      </Link>
    </Card>
  );
}

export default function ForecastPage() {
  return (
    <Suspense fallback={null}>
      <ForecastPageBody />
    </Suspense>
  );
}
