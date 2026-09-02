"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { TrendingUp, Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { PriceChart } from "@/components/stock/price-chart";
import { RangeSelector } from "@/components/stock/range-selector";
import { SymbolCombobox } from "@/components/search/symbol-combobox";
import { DataDisclaimer } from "@/components/layout/data-disclaimer";
import { useCandles } from "@/hooks/use-candles";
import { useWatchlist } from "@/components/watchlist/watchlist-provider";
import { useUserSettings } from "@/components/settings/user-settings-provider";
import { RANGES, RANGE_SECONDS } from "@/lib/ranges";
import { cn } from "@/lib/utils";
import type {
  CandleRange,
  CandlePoint,
  SymbolSearchResult,
} from "@/lib/market-data/types";

type UsageStatus = {
  isPaid: boolean;
  remaining: number | null;
};

// Guests aren't tracked server-side, so their 3/day limit is kept in
// localStorage. It resets daily and is intentionally lightweight.
const GUEST_KEY = "matmax-guest-analytics";
const FREE_LIMIT = 3;

function today() {
  return new Date().toISOString().slice(0, 10);
}

function guestUsedToday(): number {
  try {
    const raw = localStorage.getItem(GUEST_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as { date: string; count: number };
    return parsed.date === today() ? parsed.count : 0;
  } catch {
    return 0;
  }
}

function guestRemaining(): number {
  return Math.max(0, FREE_LIMIT - guestUsedToday());
}

function guestConsume(): { allowed: boolean; remaining: number } {
  const used = guestUsedToday();
  if (used >= FREE_LIMIT) return { allowed: false, remaining: 0 };
  const next = used + 1;
  try {
    localStorage.setItem(GUEST_KEY, JSON.stringify({ date: today(), count: next }));
  } catch {
    // Ignore storage failures — worst case the guest gets a few extra runs.
  }
  return { allowed: true, remaining: Math.max(0, FREE_LIMIT - next) };
}

function oneYearAgo() {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 1);
  return date.toISOString().slice(0, 10);
}

function rangeForDate(dateString: string): CandleRange {
  const yearsBack =
    (Date.now() - new Date(dateString).getTime()) /
    (365.25 * 24 * 60 * 60 * 1000);
  if (yearsBack <= 1) return "1Y";
  if (yearsBack <= 5) return "5Y";
  return "ALL";
}

export default function AnalyticsPage() {
  const { items } = useWatchlist();
  const { money, number, percent } = useUserSettings();

  const [symbolInput, setSymbolInput] = useState("");
  const [amountInput, setAmountInput] = useState("1000");
  const [dateInput, setDateInput] = useState(oneYearAgo());

  // What the user actually picked from the dropdown, and the best match for
  // whatever is typed — so "Apple" resolves to AAPL without an extra click.
  const [picked, setPicked] = useState<SymbolSearchResult | null>(null);
  const [topResult, setTopResult] = useState<SymbolSearchResult | null>(null);

  const [applied, setApplied] = useState<{
    symbol: string;
    name: string;
    amount: number;
    date: string;
  } | null>(null);

  const [chartRange, setChartRange] = useState<CandleRange>("ALL");

  const [usage, setUsage] = useState<UsageStatus | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/analytics");
        if (res.ok) {
          const data = await res.json();
          setUsage({ isPaid: data.isPaid, remaining: data.remaining });
        } else {
          // 401 = guest: fall back to the local daily counter.
          setUsage({ isPaid: false, remaining: guestRemaining() });
        }
      } catch {
        setUsage({ isPaid: false, remaining: guestRemaining() });
      }
    })();
  }, []);

  const range = applied ? rangeForDate(applied.date) : "1Y";
  const { data: series, isLoading, isError } = useCandles(
    applied?.symbol ?? "",
    range,
  );

  const result = useMemo(() => {
    if (!applied || !series || series.points.length < 2) return null;
    const startSec = new Date(applied.date).getTime() / 1000;
    const entry =
      series.points.find((point) => point.time >= startSec) ?? series.points[0];
    if (entry.value <= 0) return null;

    const shares = applied.amount / entry.value;
    const currentValue = shares * series.price;
    const profit = currentValue - applied.amount;
    const returnPercent = (profit / applied.amount) * 100;

    const growth: CandlePoint[] = series.points
      .filter((point) => point.time >= entry.time)
      .map((point) => ({ time: point.time, value: point.value * shares }));

    return {
      entryPrice: entry.value,
      shares,
      currentValue,
      profit,
      returnPercent,
      currentPrice: series.price,
      growth,
    };
  }, [applied, series]);

  /** Ranges shorter than the holding period would draw fewer than two points. */
  const disabledRanges = useMemo(() => {
    if (!result) return RANGES.map((range) => range.key);
    const latest = result.growth[result.growth.length - 1].time;
    return RANGES.filter((range) => {
      const seconds = RANGE_SECONDS[range.key];
      if (seconds === null) return false;
      const cutoff = latest - seconds;
      return result.growth.filter((point) => point.time >= cutoff).length < 2;
    }).map((range) => range.key);
  }, [result]);

  const visibleGrowth = useMemo(() => {
    if (!result) return [];
    const seconds = RANGE_SECONDS[chartRange];
    if (seconds === null) return result.growth;
    const latest = result.growth[result.growth.length - 1].time;
    const windowed = result.growth.filter(
      (point) => point.time >= latest - seconds,
    );
    return windowed.length > 1 ? windowed : result.growth;
  }, [result, chartRange]);

  const windowChangePercent = useMemo(() => {
    if (visibleGrowth.length < 2) return 0;
    const first = visibleGrowth[0].value;
    const last = visibleGrowth[visibleGrowth.length - 1].value;
    return first === 0 ? 0 : ((last - first) / first) * 100;
  }, [visibleGrowth]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    // Prefer an explicit pick, then the best match for what was typed, then
    // the raw text (so a bare ticker still works if search is unavailable).
    const typed = symbolInput.trim();
    const resolved =
      picked?.symbol.toUpperCase() ??
      (topResult && typed.toLowerCase() !== topResult.symbol.toLowerCase()
        ? topResult.symbol.toUpperCase()
        : null) ??
      typed.toUpperCase();
    const resolvedName =
      (picked?.symbol.toUpperCase() === resolved ? picked?.description : null) ??
      (topResult?.symbol.toUpperCase() === resolved
        ? topResult?.description
        : null) ??
      resolved;

    if (!resolved) {
      setFormError("Search for a company or ticker first.");
      return;
    }
    const amount = parseFloat(amountInput);
    if (!amount || amount <= 0) {
      setFormError("Enter an amount greater than $0.");
      return;
    }
    if (!dateInput) {
      setFormError("Pick a date.");
      return;
    }

    setSubmitting(true);
    setLimitReached(false);
    try {
      let allowed = false;
      let isPaid = false;
      let remaining: number | null = 0;

      // Members are limited/tracked server-side; guests (401) use the local
      // daily counter instead.
      const res = await fetch("/api/analytics", { method: "POST" });
      if (res.status === 401) {
        const guest = guestConsume();
        allowed = guest.allowed;
        remaining = guest.remaining;
      } else {
        const data = await res.json();
        allowed = res.ok && data.allowed;
        isPaid = Boolean(data.isPaid);
        remaining = data.remaining;
      }

      if (!allowed) {
        setLimitReached(true);
        setUsage({ isPaid, remaining: 0 });
        return;
      }
      setUsage({ isPaid, remaining });
      setChartRange("ALL");
      setApplied({
        symbol: resolved,
        name: resolvedName,
        amount,
        date: dateInput,
      });
    } catch {
      // Fetch can throw outright (offline, flaky mobile signal, etc.) rather
      // than resolving — without this, the button would silently do nothing.
      setFormError(
        "Couldn't reach the server. Check your connection and try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Lookback</h1>
          <p className="text-sm text-muted-foreground">
            See what a past investment would be worth today.
          </p>
        </div>
        {usage &&
          (usage.isPaid ? (
            <span className="rounded-full bg-gain-soft px-3 py-1 text-xs font-medium text-gain">
              Unlimited plan
            </span>
          ) : (
            <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
              {usage.remaining ?? 0} of 3 free searches left today
            </span>
          ))}
      </div>

      {limitReached && (
        <Card className="flex-row items-center justify-between gap-4 border-primary/40 bg-accent p-5">
          <div className="flex items-center gap-3">
            <Lock className="size-5 text-primary" />
            <div>
              <p className="text-sm font-semibold">
                You&apos;ve used all 3 free searches today
              </p>
              <p className="text-sm text-muted-foreground">
                Try Pro free for 7 days to run unlimited what-if calculations.
              </p>
            </div>
          </div>
          <Link
            href="/account"
            className={cn(
              buttonVariants(),
              // Two stacked lines need more room than the button's default
              // single-line height allows.
              "h-auto flex-col gap-0 rounded-full py-2",
            )}
          >
            <span>Start free trial</span>
            <span className="text-[11px] font-normal opacity-70">
              after that $1.99/month
            </span>
          </Link>
        </Card>
      )}

      {/* overflow-visible: Card clips by default, which cut the symbol
          picker's dropdown off at the card's bottom edge. */}
      <Card className="gap-5 overflow-visible p-6">
        <form
          onSubmit={handleSubmit}
          className="grid grid-cols-1 gap-4 sm:grid-cols-4"
        >
          <div className="flex flex-col gap-1.5">
            <label htmlFor="analytics-symbol" className="text-sm font-medium">
              Company or symbol
            </label>
            <SymbolCombobox
              id="analytics-symbol"
              value={symbolInput}
              onValueChange={(next) => {
                setSymbolInput(next);
                setPicked(null);
                setFormError(null);
              }}
              onSelect={(result) => {
                setPicked(result);
                setFormError(null);
              }}
              onTopResultChange={setTopResult}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Amount invested ($)</label>
            <Input
              type="number"
              min="1"
              value={amountInput}
              onChange={(event) => setAmountInput(event.target.value)}
              placeholder="1000"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Invested on</label>
            <Input
              type="date"
              value={dateInput}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(event) => setDateInput(event.target.value)}
            />
          </div>
          <div className="flex items-end">
            <Button
              type="submit"
              className="w-full rounded-full"
              disabled={submitting}
            >
              {submitting ? "Checking…" : "Calculate"}
            </Button>
          </div>
        </form>

        {formError && <p className="text-sm text-destructive">{formError}</p>}

        {items.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Quick pick:</span>
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
                  setFormError(null);
                }}
                className="rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-accent"
              >
                {item.symbol}
              </button>
            ))}
          </div>
        )}
      </Card>

      {applied && (
        <Card className="gap-4 p-6">
          {isLoading ? (
            <div className="flex flex-col gap-4">
              <Skeleton className="h-4 w-64" />
              <Skeleton className="h-10 w-52" />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[0, 1, 2, 3].map((index) => (
                  <Skeleton key={index} className="h-20 rounded-xl" />
                ))}
              </div>
              <Skeleton className="h-64 w-full rounded-xl" />
            </div>
          ) : isError || !result ? (
            <p className="text-sm text-muted-foreground">
              Couldn&apos;t load enough price history for {applied.symbol}. Try a
              different symbol or date.
            </p>
          ) : (
            <>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <TrendingUp className="size-4" />
                If you invested {money(applied.amount, 0)} in{" "}
                {applied.symbol}
                {applied.name && applied.name !== applied.symbol
                  ? ` (${applied.name})`
                  : ""}{" "}
                on{" "}
                {new Date(applied.date).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                  timeZone: "UTC",
                })}
                …
              </div>

              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Worth today</p>
                  <p className="num text-4xl font-semibold tracking-tight">
                    $
                    {money(result.currentValue)}
                  </p>
                </div>
                <p
                  className={
                    "num mb-1 text-lg font-semibold " +
                    (result.profit >= 0 ? "text-gain" : "text-loss")
                  }
                >
                  {result.profit >= 0 ? "+" : "−"}$
                  {money(Math.abs(result.profit))}{" "}
                  ({result.profit >= 0 ? "+" : ""}
                  {number(result.returnPercent, 1)}%)
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl border border-border p-4">
                  <p className="text-xs text-muted-foreground">Entry price</p>
                  <p className="num mt-1 text-lg font-semibold">
                    {money(result.entryPrice)}
                  </p>
                </div>
                <div className="rounded-xl border border-border p-4">
                  <p className="text-xs text-muted-foreground">Price today</p>
                  <p className="num mt-1 text-lg font-semibold">
                    {money(result.currentPrice)}
                  </p>
                </div>
                <div className="rounded-xl border border-border p-4">
                  <p className="text-xs text-muted-foreground">Shares bought</p>
                  <p className="num mt-1 text-lg font-semibold">
                    {number(result.shares, 3)}
                  </p>
                </div>
                <div className="rounded-xl border border-border p-4">
                  <p className="text-xs text-muted-foreground">Invested</p>
                  <p className="num mt-1 text-lg font-semibold">
                    {money(applied.amount, 0)}
                  </p>
                </div>
              </div>

              {result.growth.length > 1 && (
                <div>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">
                        Value of your investment over time
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {windowChangePercent >= 0 ? "Up" : "Down"}{" "}
                        <span
                          className={
                            windowChangePercent >= 0
                              ? "text-gain"
                              : "text-loss"
                          }
                        >
                          {percent(windowChangePercent)}
                        </span>{" "}
                        over the selected period
                      </p>
                    </div>
                    <RangeSelector
                      value={chartRange}
                      onChange={setChartRange}
                      size="sm"
                      disabledKeys={disabledRanges}
                    />
                  </div>
                  <PriceChart
                    points={visibleGrowth}
                    positive={windowChangePercent >= 0}
                    height={260}
                    range={chartRange}
                  />
                </div>
              )}
            </>
          )}
        </Card>
      )}

      <DataDisclaimer className="border-t border-border pt-4" />
    </div>
  );
}
