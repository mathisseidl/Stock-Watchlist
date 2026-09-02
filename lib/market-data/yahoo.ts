import type {
  CandleRange,
  CandleSeries,
  RangeStats,
  TradingSession,
} from "./types";

const CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart";

// Maps our ranges onto Yahoo's range/interval pairs plus a sensible cache TTL.
// `1D` asks for extended hours as well, so the day chart can run past the
// regular close; the wider ranges stay on regular sessions, where a night of
// thin after-hours prints would only add noise.
const RANGE_CONFIG: Record<
  CandleRange,
  { range: string; interval: string; revalidate: number; prePost: boolean }
> = {
  "1D": { range: "1d", interval: "5m", revalidate: 60, prePost: true },
  "1W": { range: "5d", interval: "15m", revalidate: 300, prePost: false },
  "1M": { range: "1mo", interval: "1d", revalidate: 1800, prePost: false },
  "1Y": { range: "1y", interval: "1d", revalidate: 3600, prePost: false },
  "5Y": { range: "5y", interval: "1wk", revalidate: 86_400, prePost: false },
  ALL: { range: "max", interval: "1mo", revalidate: 86_400, prePost: false },
};

type YahooPeriod = {
  start?: number;
  end?: number;
  timezone?: string;
  gmtoffset?: number;
};

type YahooMeta = {
  regularMarketPrice?: number;
  chartPreviousClose?: number;
  previousClose?: number;
  exchangeTimezoneName?: string;
  hasPrePostMarketData?: boolean;
  currentTradingPeriod?: {
    pre?: YahooPeriod;
    regular?: YahooPeriod;
    post?: YahooPeriod;
  };
  // Nested two deep: one entry per day, each holding that day's periods.
  tradingPeriods?: {
    pre?: YahooPeriod[][];
    regular?: YahooPeriod[][];
    post?: YahooPeriod[][];
  };
};

type YahooQuoteBlock = {
  open?: (number | null)[];
  high?: (number | null)[];
  low?: (number | null)[];
  close?: (number | null)[];
};

type YahooChartResponse = {
  chart: {
    result:
      | {
          timestamp?: number[];
          meta?: YahooMeta;
          indicators?: { quote?: YahooQuoteBlock[] };
        }[]
      | null;
    error: unknown;
  };
};

/**
 * The session the returned candles belong to.
 *
 * `tradingPeriods` is preferred over `currentTradingPeriod`: once a market has
 * closed, `currentTradingPeriod` has already rolled forward to the *next*
 * session while the candles are still yesterday's, and pinning the axis to it
 * would strand the whole series off the left of the chart.
 */
function readSession(meta: YahooMeta | undefined): TradingSession | undefined {
  if (!meta) return undefined;

  const day = <T,>(nested: T[][] | undefined): T | undefined => nested?.[0]?.[0];
  const regular =
    day(meta.tradingPeriods?.regular) ?? meta.currentTradingPeriod?.regular;
  const post = day(meta.tradingPeriods?.post) ?? meta.currentTradingPeriod?.post;

  if (
    typeof regular?.start !== "number" ||
    typeof regular?.end !== "number" ||
    regular.end <= regular.start
  ) {
    return undefined;
  }

  // Exchanges without extended trading still report a `post` window, but it is
  // either empty (Tokyo sends start === end) or never carries prices
  // (`hasPrePostMarketData` false, as on XETRA). Either way there is nothing to
  // plot out there, so the day ends at the regular close.
  const hasAfterHours =
    meta.hasPrePostMarketData === true &&
    typeof post?.start === "number" &&
    typeof post?.end === "number" &&
    post.end > post.start &&
    post.start >= regular.end;

  return {
    start: regular.start,
    regularEnd: regular.end,
    end: hasAfterHours ? post!.end! : regular.end,
    hasAfterHours,
    timeZone: meta.exchangeTimezoneName ?? "UTC",
  };
}

/** OHLC across a slice of the candles, ignoring the gaps Yahoo pads with nulls. */
function readStats(
  quote: YahooQuoteBlock | undefined,
  indices: number[],
): RangeStats | undefined {
  if (!quote || indices.length === 0) return undefined;

  const at = (series: (number | null)[] | undefined, index: number) => {
    const value = series?.[index];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  };

  let open: number | null = null;
  let close: number | null = null;
  let high: number | null = null;
  let low: number | null = null;

  for (const index of indices) {
    // An interval's open and close are only meaningful in order, so the first
    // and last that exist win rather than the first and last index outright.
    const candleOpen = at(quote.open, index) ?? at(quote.close, index);
    if (candleOpen !== null && open === null) open = candleOpen;

    const candleClose = at(quote.close, index) ?? at(quote.open, index);
    if (candleClose !== null) close = candleClose;

    // Fall back to the close so a source that omits high/low still reports a
    // range rather than nothing at all.
    const candleHigh = at(quote.high, index) ?? candleClose;
    if (candleHigh !== null && (high === null || candleHigh > high)) {
      high = candleHigh;
    }

    const candleLow = at(quote.low, index) ?? candleClose;
    if (candleLow !== null && (low === null || candleLow < low)) {
      low = candleLow;
    }
  }

  if (open === null || close === null || high === null || low === null) {
    return undefined;
  }
  return { open, high, low, close };
}

export class YahooProvider {
  async getCandles(symbol: string, range: CandleRange): Promise<CandleSeries> {
    const config = RANGE_CONFIG[range];
    const url =
      `${CHART_URL}/${encodeURIComponent(symbol)}` +
      `?range=${config.range}&interval=${config.interval}` +
      `&includePrePost=${config.prePost}`;

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
    const quote = result.indicators.quote[0];
    const closes = quote.close ?? [];
    const session = range === "1D" ? readSession(result.meta) : undefined;

    // Asking for extended hours also drags in the pre-market, which the day
    // chart deliberately starts after. Trimming here rather than in the chart
    // keeps the stats and the plotted line describing the same window.
    const inWindow = (time: number) =>
      !session || (time >= session.start && time <= session.end);

    const kept: number[] = [];
    const points: { time: number; value: number }[] = [];
    timestamps.forEach((time, index) => {
      const value = closes[index];
      if (value === null || value === undefined) return;
      if (!inWindow(time)) return;
      kept.push(index);
      points.push({ time, value });
    });

    const lastValue = points.length > 0 ? points[points.length - 1].value : 0;
    const price = result.meta?.regularMarketPrice ?? lastValue;
    const previousClose =
      result.meta?.chartPreviousClose ??
      result.meta?.previousClose ??
      (points.length > 0 ? points[0].value : 0);

    return {
      points,
      price,
      previousClose,
      stats: readStats(quote, kept),
      ...(session ? { session } : {}),
    };
  }
}
