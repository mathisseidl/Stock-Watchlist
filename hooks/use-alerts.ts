"use client";

import { useQueries } from "@tanstack/react-query";
import { useUserSettings } from "@/components/settings/user-settings-provider";
import { useWatchlist } from "@/components/watchlist/watchlist-provider";
import { seriesChangePercent } from "@/hooks/use-candles";
import type { CandleSeries, NewsItem } from "@/lib/market-data/types";

/** Never show more than this. A list you scroll is a list you ignore. */
export const MAX_ALERTS = 3;

export type Alert = {
  id: string;
  symbol: string;
  kind: "price" | "news";
  title: string;
  detail: string;
  changePercent?: number;
  url?: string;
  publishedAt?: number;
};

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${url}`);
  return res.json();
}

/**
 * How the three slots are filled, in order:
 *
 *   1. The biggest percentage move on the watchlist. If two stocks both broke
 *      the threshold, the reader wants the one that moved further.
 *   2. Other significant news, only if there is room left.
 *
 * Within a tier, the larger move wins.
 */
const TIER: Record<Alert["kind"], number> = { price: 0, news: 1 };

/**
 * Alerts are derived live from the watchlist rather than pushed from a server:
 * the app already polls today's candles and news for these symbols, so the
 * rules can be evaluated on what is in hand.
 */
export function useAlerts() {
  const { items } = useWatchlist();
  const { settings, ready } = useUserSettings();

  const enabled = ready && settings.notificationsEnabled && items.length > 0;
  const symbols = items.map((item) => item.symbol);

  // Today's candles are fetched whenever alerts are on, not only when the
  // price rule is: the day's move is what ranks an earnings story too. The
  // query key matches the watchlist rows', so this costs no extra request.
  const candleQueries = useQueries({
    queries: symbols.map((symbol) => ({
      queryKey: ["candles", symbol, "1D"],
      queryFn: () => fetchJson<CandleSeries>(`/api/candles/${symbol}?range=1D`),
      enabled,
      staleTime: 60_000,
    })),
  });

  // News is the always-on part of the section — it is a watchlist feed, not an
  // alert the reader opts into. Only the price-move rows below are gated.
  const newsQueries = useQueries({
    queries: symbols.map((symbol) => ({
      queryKey: ["news", symbol],
      queryFn: () => fetchJson<NewsItem[]>(`/api/news/${symbol}`),
      enabled,
      staleTime: 15 * 60 * 1000,
    })),
  });

  if (!enabled) return { alerts: [] as Alert[], isLoading: false };

  const dayChange = new Map<string, number>();
  symbols.forEach((symbol, index) => {
    const series = candleQueries[index]?.data;
    if (series) dayChange.set(symbol, seriesChangePercent(series));
  });

  const alerts: Alert[] = [];

  if (settings.notifyPriceMove) {
    for (const symbol of symbols) {
      const change = dayChange.get(symbol);
      if (change === undefined) continue;
      if (Math.abs(change) < settings.priceMoveThreshold) continue;
      alerts.push({
        id: `price-${symbol}`,
        symbol,
        kind: "price",
        title: `${symbol} is ${change >= 0 ? "up" : "down"} sharply today`,
        detail: `A bigger move than the ${settings.priceMoveThreshold}% you asked to hear about.`,
        changePercent: change,
      });
    }
  }

  symbols.forEach((symbol, index) => {
    const news = newsQueries[index]?.data;
    if (!news) return;

    for (const item of news) {
      alerts.push({
        id: `news-${symbol}-${item.id ?? item.url}`,
        symbol,
        kind: "news",
        title: item.headline,
        detail: item.source,
        changePercent: dayChange.get(symbol),
        url: item.url,
        publishedAt: item.datetime,
      });
      // One story per symbol keeps the list readable.
      break;
    }
  });

  alerts.sort((a, b) => {
    const byTier = TIER[a.kind] - TIER[b.kind];
    if (byTier !== 0) return byTier;
    return Math.abs(b.changePercent ?? 0) - Math.abs(a.changePercent ?? 0);
  });

  return {
    alerts: alerts.slice(0, MAX_ALERTS),
    isLoading:
      candleQueries.some((query) => query.isLoading) ||
      newsQueries.some((query) => query.isLoading),
  };
}
