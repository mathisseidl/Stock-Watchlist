import type { CandleRange, CandleSeries } from "./types";

const CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart";

// Maps our ranges onto Yahoo's range/interval pairs plus a sensible cache TTL.
const RANGE_CONFIG: Record<
  CandleRange,
  { range: string; interval: string; revalidate: number }
> = {
  "1D": { range: "1d", interval: "5m", revalidate: 60 },
  "1W": { range: "5d", interval: "15m", revalidate: 300 },
  "1M": { range: "1mo", interval: "1d", revalidate: 1800 },
  "1Y": { range: "1y", interval: "1d", revalidate: 3600 },
  "5Y": { range: "5y", interval: "1wk", revalidate: 86_400 },
  ALL: { range: "max", interval: "1mo", revalidate: 86_400 },
};

type YahooChartResponse = {
  chart: {
    result:
      | {
          timestamp?: number[];
          meta?: {
            regularMarketPrice?: number;
            chartPreviousClose?: number;
            previousClose?: number;
          };
          indicators?: {
            quote?: { close?: (number | null)[] }[];
          };
        }[]
      | null;
    error: unknown;
  };
};

export class YahooProvider {
  async getCandles(symbol: string, range: CandleRange): Promise<CandleSeries> {
    const config = RANGE_CONFIG[range];
    const url = `${CHART_URL}/${encodeURIComponent(symbol)}?range=${config.range}&interval=${config.interval}`;

    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      },
      next: { revalidate: config.revalidate },
    });

    if (!res.ok) {
      throw new Error(`Yahoo chart request failed: ${res.status} ${symbol}`);
    }

    const data = (await res.json()) as YahooChartResponse;
    const result = data.chart.result?.[0];

    if (!result || !result.timestamp || !result.indicators?.quote?.[0]?.close) {
      return { points: [], price: 0, previousClose: 0 };
    }

    const timestamps = result.timestamp;
    const closes = result.indicators.quote[0].close;

    const points = timestamps
      .map((time, index) => ({ time, value: closes[index] }))
      .filter(
        (point): point is { time: number; value: number } =>
          point.value !== null && point.value !== undefined,
      );

    const lastValue = points.length > 0 ? points[points.length - 1].value : 0;
    const price = result.meta?.regularMarketPrice ?? lastValue;
    const previousClose =
      result.meta?.chartPreviousClose ??
      result.meta?.previousClose ??
      (points.length > 0 ? points[0].value : 0);

    return { points, price, previousClose };
  }
}
