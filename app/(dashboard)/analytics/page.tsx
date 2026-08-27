"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { TrendingUp, Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { PriceChart } from "@/components/stock/price-chart";
import { useCandles } from "@/hooks/use-candles";
import { useWatchlist } from "@/components/watchlist/watchlist-provider";
import { cn } from "@/lib/utils";
import type { CandleRange, CandlePoint } from "@/lib/market-data/types";

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

  const [symbolInput, setSymbolInput] = useState("");
  const [amountInput, setAmountInput] = useState("1000");
  const [dateInput, setDateInput] = useState(oneYearAgo());

  const [applied, setApplied] = useState<{
    symbol: string;
    amount: number;
    date: string;
  } | null>(null);

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

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    if (!symbolInput.trim()) {
      setFormError("Enter a stock symbol first.");
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
      setApplied({
        symbol: symbolInput.trim().toUpperCase(),
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
          <h1 className="text-2xl font-semibold">Analytics</h1>
          <p className="text-sm text-muted-foreground">
            See what a past investment would be worth today.
          </p>
        </div>
        {usage &&
          (usage.isPaid ? (
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-600">
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
                Upgrade to run unlimited what-if calculations.
              </p>
            </div>
          </div>
          <Link
            href="/account"
            className={cn(buttonVariants(), "rounded-full")}
          >
            Upgrade — $4.99 / year
          </Link>
        </Card>
      )}

      <Card className="gap-5 p-6">
        <form
          onSubmit={handleSubmit}
          className="grid grid-cols-1 gap-4 sm:grid-cols-4"
        >
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Stock symbol</label>
            <Input
              value={symbolInput}
              onChange={(event) => setSymbolInput(event.target.value)}
              placeholder="AAPL"
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

        {formError && <p className="text-sm text-red-500">{formError}</p>}

        {items.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Quick pick:</span>
            {items.map((item) => (
              <button
                key={item.symbol}
                type="button"
                onClick={() => {
                  setSymbolInput(item.symbol);
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
            <p className="text-sm text-muted-foreground">Crunching the numbers…</p>
          ) : isError || !result ? (
            <p className="text-sm text-muted-foreground">
              Couldn&apos;t load enough price history for {applied.symbol}. Try a
              different symbol or date.
            </p>
          ) : (
            <>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <TrendingUp className="size-4" />
                If you invested $
                {applied.amount.toLocaleString()} in {applied.symbol} on{" "}
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
                  <p className="text-4xl font-semibold tracking-tight">
                    $
                    {result.currentValue.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                </div>
                <p
                  className={
                    "mb-1 text-lg font-semibold " +
                    (result.profit >= 0 ? "text-emerald-600" : "text-red-500")
                  }
                >
                  {result.profit >= 0 ? "+" : "−"}$
                  {Math.abs(result.profit).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{" "}
                  ({result.profit >= 0 ? "+" : ""}
                  {result.returnPercent.toFixed(1)}%)
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl border border-border p-4">
                  <p className="text-xs text-muted-foreground">Entry price</p>
                  <p className="mt-1 text-lg font-semibold">
                    ${result.entryPrice.toFixed(2)}
                  </p>
                </div>
                <div className="rounded-xl border border-border p-4">
                  <p className="text-xs text-muted-foreground">Price today</p>
                  <p className="mt-1 text-lg font-semibold">
                    ${result.currentPrice.toFixed(2)}
                  </p>
                </div>
                <div className="rounded-xl border border-border p-4">
                  <p className="text-xs text-muted-foreground">Shares bought</p>
                  <p className="mt-1 text-lg font-semibold">
                    {result.shares.toFixed(3)}
                  </p>
                </div>
                <div className="rounded-xl border border-border p-4">
                  <p className="text-xs text-muted-foreground">Invested</p>
                  <p className="mt-1 text-lg font-semibold">
                    ${applied.amount.toLocaleString()}
                  </p>
                </div>
              </div>

              {result.growth.length > 1 && (
                <div>
                  <p className="mb-2 text-sm font-medium">
                    Value of your investment over time
                  </p>
                  <PriceChart
                    points={result.growth}
                    positive={result.profit >= 0}
                    height={260}
                  />
                </div>
              )}
            </>
          )}
        </Card>
      )}
    </div>
  );
}
