"use client";

import { useQueries } from "@tanstack/react-query";
import { useUserSettings } from "@/components/settings/user-settings-provider";
import { useWatchlist } from "@/components/watchlist/watchlist-provider";
import { seriesChangePercent } from "@/hooks/use-candles";
import type { CandleSeries, NewsItem } from "@/lib/market-data/types";

export type Alert = {
  id: string;
  symbol: string;
  kind: "price" | "earnings" | "news";
  headline: string;
  detail: string;
  changePercent?: number;
  url?: string;
};

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${url}`);
  return res.json();
}

/** Headlines the news classifier tagged as earnings coverage. */
const EARNINGS_REASON = /^Earnings and guidance/;

/**
 * Alerts are derived live from the watchlist rather than pushed from a server:
 * the app already polls today's candles and news for these symbols, so the
 * rules can be evaluated on what is in hand. Nothing is sent by email yet —
 * these surface in the app.
 */
export function useAlerts() {
  const { items } = useWatchlist();
  const { settings, ready } = useUserSettings();

  const enabled = ready && settings.notificationsEnabled && items.length > 0;
  const symbols = items.map((item) => item.symbol);

  const candleQueries = useQueries({
    queries: symbols.map((symbol) => ({
      queryKey: ["candles", symbol, "1D"],
      queryFn: () => fetchJson<CandleSeries>(`/api/candles/${symbol}?range=1D`),
      enabled: enabled && settings.notifyPriceMove,
      staleTime: 60_000,
    })),
  });

  const newsQueries = useQueries({
    queries: symbols.map((symbol) => ({
      queryKey: ["news", symbol],
      queryFn: () => fetchJson<NewsItem[]>(`/api/news/${symbol}`),
      enabled: enabled && (settings.notifyEarnings || settings.notifyBigNews),
      staleTime: 15 * 60 * 1000,
    })),
  });

  if (!enabled) return { alerts: [] as Alert[], isLoading: false };

  const alerts: Alert[] = [];

  if (settings.notifyPriceMove) {
    symbols.forEach((symbol, index) => {
      const series = candleQueries[index]?.data;
      if (!series) return;
      const change = seriesChangePercent(series);
      if (Math.abs(change) < settings.priceMoveThreshold) return;
      alerts.push({
        id: `price-${symbol}`,
        symbol,
        kind: "price",
        headline: `${symbol} moved ${change >= 0 ? "up" : "down"} sharply today`,
        detail: `Past your ${settings.priceMoveThreshold}% threshold.`,
        changePercent: change,
      });
    });
  }

  if (settings.notifyEarnings || settings.notifyBigNews) {
    symbols.forEach((symbol, index) => {
      const news = newsQueries[index]?.data;
      if (!news) return;

      for (const item of news) {
        const isEarnings = EARNINGS_REASON.test(item.reason ?? "");
        if (isEarnings && !settings.notifyEarnings) continue;
        if (!isEarnings && !settings.notifyBigNews) continue;

        alerts.push({
          id: `news-${symbol}-${item.id ?? item.url}`,
          symbol,
          kind: isEarnings ? "earnings" : "news",
          headline: item.headline,
          detail: `${item.source} · ${symbol}`,
          url: item.url,
        });
        // One story per symbol keeps the list readable.
        break;
      }
    });
  }

  // Biggest moves first, then everything else.
  alerts.sort(
    (a, b) => Math.abs(b.changePercent ?? 0) - Math.abs(a.changePercent ?? 0),
  );

  return {
    alerts,
    isLoading:
      candleQueries.some((query) => query.isLoading) ||
      newsQueries.some((query) => query.isLoading),
  };
}
