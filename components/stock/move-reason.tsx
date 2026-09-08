"use client";

import { useQuery } from "@tanstack/react-query";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { CandleRange } from "@/lib/market-data/types";

type Explanation = {
  reason: string;
  direction: "up" | "down" | "flat";
  changePercent: number;
  period: string;
};

type ErrorBody = { error?: string; empty?: boolean; unsupported?: boolean };

const HEADING: Record<Explanation["direction"], string> = {
  up: "Why it went up",
  down: "Why it went down",
  flat: "Why it barely moved",
};

/**
 * The main reason the price moved over the window the chart is showing.
 *
 * Follows the selected range rather than always describing a month, so the
 * sentence and the line on screen always talk about the same period. Renders
 * nothing at all when there is no honest answer — a quiet month with no news
 * behind it, or a window too long for headlines to explain — because an empty
 * panel reads better than a made-up cause.
 */
export function MoveReason({
  symbol,
  range,
}: {
  symbol: string;
  range: CandleRange;
}) {
  const { data, isLoading, error } = useQuery<Explanation>({
    queryKey: ["why", symbol, range],
    queryFn: async () => {
      const res = await fetch(
        `/api/why/${encodeURIComponent(symbol)}?range=${range}`,
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as ErrorBody;
        throw new Error(body.error ?? "Couldn't work out the reason.");
      }
      return res.json();
    },
    // The server caches the explanation for an hour; there is no point asking
    // again inside that window.
    staleTime: 60 * 60 * 1000,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <Skeleton className="h-4 w-32 rounded-full" />
        <div className="mt-3 flex flex-col gap-2">
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-3/4" />
        </div>
      </div>
    );
  }

  // No answer is a normal outcome, not a failure worth shouting about.
  if (error || !data) return null;

  const Icon =
    data.direction === "up"
      ? TrendingUp
      : data.direction === "down"
        ? TrendingDown
        : Minus;
  const tone =
    data.direction === "up"
      ? "text-gain"
      : data.direction === "down"
        ? "text-loss"
        : "text-muted-foreground";

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <Icon className={`size-4 ${tone}`} />
        <h3 className="text-base font-semibold">
          {HEADING[data.direction]} over {data.period}
        </h3>
        <span className={`num text-sm ${tone}`}>
          {data.changePercent >= 0 ? "+" : "−"}
          {Math.abs(data.changePercent).toFixed(1)}%
        </span>
      </div>
      <p className="mt-2 text-sm leading-relaxed">{data.reason}</p>
      <p className="mt-2.5 text-xs text-muted-foreground">
        Written from the news published over {data.period}, and only ever the
        news — not advice, and not a forecast.
      </p>
    </div>
  );
}
