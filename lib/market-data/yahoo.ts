import { usdConversion } from "./fx";
import type {
  CandleRange,
  CandleSeries,
  RangeStats,
  SymbolSearchResult,
  TradingSession,
} from "./types";

const CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart";
const SEARCH_URL = "https://query1.finance.yahoo.com/v1/finance/search";

// Maps our ranges onto Yahoo's range/interval pairs plus a sensible cache TTL.
// `1D` asks for extended hours as well, so the day chart can run past the
// regular close; the wider ranges stay on regular sessions, where a night of
// thin after-hours prints would only add noise.
//
// Each interval is the finest Yahoo actually serves for that span — verified
// against the live API rather than assumed, since the documented limits
// (1m/2m capped near 5-7 days, 5m-30m near 60 days, 60m near 2 years, 1d/1wk
// unbounded) are Yahoo's own and not published anywhere authoritative.
const RANGE_CONFIG: Record<
  CandleRange,
  { range: string; interval: string; revalidate: number; prePost: boolean }
> = {
  "1D": { range: "1d", interval: "1m", revalidate: 60, prePost: true },
  "1W": { range: "5d", interval: "1m", revalidate: 300, prePost: false },
  "1M": { range: "1mo", interval: "15m", revalidate: 1800, prePost: false },
  "6M": { range: "6mo", interval: "1d", revalidate: 3600, prePost: false },
  "1Y": { range: "1y", interval: "60m", revalidate: 3600, prePost: false },
  "5Y": { range: "5y", interval: "1d", revalidate: 86_400, prePost: false },
  // interval only matters here as the fallback `getCandles` builds from —
  // ALL always requests explicit period bounds instead of this `range`
  // keyword, so see the comment there for why.
  ALL: { range: "max", interval: "1wk", revalidate: 86_400, prePost: false },
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
  /** The listing's trading currency — "EUR", "JPY", "GBp" (pence), … */
  currency?: string;
  exchangeTimezoneName?: string;
  hasPrePostMarketData?: boolean;
  currentTradingPeriod?: {
    pre?: YahooPeriod;
    regular?: YahooPeriod;
    post?: YahooPeriod;
  };
  // Nested two deep — one entry per day, each holding that day's periods —
  // but the outer shape itself depends on the request: an object keyed by
  // pre/regular/post when extended hours were asked for (the day chart), or
  // the regular sessions alone as a bare array when they were not (every
  // wider range, `includePrePost=false`). `regularPeriods` below normalizes
  // both to the same shape.
  tradingPeriods?:
    | YahooPeriod[][]
    | { pre?: YahooPeriod[][]; regular?: YahooPeriod[][]; post?: YahooPeriod[][] };
};

/** `tradingPeriods.regular`, whichever of the two shapes it actually came in. */
function regularPeriods(meta: YahooMeta | undefined): YahooPeriod[][] | undefined {
  const periods = meta?.tradingPeriods;
  if (!periods) return undefined;
  return Array.isArray(periods) ? periods : periods.regular;
}

/** `tradingPeriods.post` — only ever present in the object-keyed shape. */
function postPeriods(meta: YahooMeta | undefined): YahooPeriod[][] | undefined {
  const periods = meta?.tradingPeriods;
  return periods && !Array.isArray(periods) ? periods.post : undefined;
}

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
  const regular = day(regularPeriods(meta)) ?? meta.currentTradingPeriod?.regular;
  const post = day(postPeriods(meta)) ?? meta.currentTradingPeriod?.post;

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

/**
 * A leading-pad-only session for the week chart: the oldest visible day's
 * real open, minus half an hour, so every week starts at a round 9 AM
 * regardless of the exact minute the market opened that particular day.
 * There is no after-hours stretch here and no right-edge padding — the week
 * chart already ends on the latest real candle, same as before.
 *
 * `tradingPeriods.regular` carries one entry per calendar day for a
 * multi-day range (unlike the single entry `readSession` reads for `1D`), so
 * the first entry is the oldest day's own session rather than today's.
 */
function buildWeekSession(
  meta: YahooMeta | undefined,
  points: { time: number }[],
): TradingSession | undefined {
  const oldestDay = regularPeriods(meta)?.[0]?.[0];
  if (typeof oldestDay?.start !== "number" || points.length === 0) {
    return undefined;
  }

  const end = points[points.length - 1].time;
  return {
    start: oldestDay.start - 30 * 60,
    regularEnd: end,
    end,
    hasAfterHours: false,
    timeZone: meta?.exchangeTimezoneName ?? "UTC",
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
    // The `range=max` keyword silently caps itself to a coarse resolution —
    // verified live: AAPL's ~46-year history comes back as the same ~168
    // monthly-ish points whether the interval asked for is `1mo`, `1wk` or
    // `1d`. Explicit period bounds don't have that cap; period1=0 reaches
    // back to any listing's actual first trade regardless of its age.
    const url =
      range === "ALL"
        ? `${CHART_URL}/${encodeURIComponent(symbol)}` +
          `?period1=0&period2=${Math.floor(Date.now() / 1000)}` +
          `&interval=${config.interval}&includePrePost=false`
        : `${CHART_URL}/${encodeURIComponent(symbol)}` +
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
      return { points: [], price: 0, previousClose: 0, currency: "USD" };
    }

    const timestamps = result.timestamp;
    const quote = result.indicators.quote[0];
    const closes = quote.close ?? [];
    // Only the day chart trims by session — its extended-hours request also
    // drags in the pre-market, which the chart deliberately starts after.
    // The week chart's own session (below) describes a leading pad, not a
    // window to filter to, so it plays no part in keeping or dropping candles.
    const daySession = range === "1D" ? readSession(result.meta) : undefined;
    const inWindow = (time: number) =>
      !daySession || (time >= daySession.start && time <= daySession.end);

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

    const session =
      daySession ??
      (range === "1W" ? buildWeekSession(result.meta, points) : undefined);

    const stats = readStats(quote, kept);

    // A non-US listing comes back in its home currency; the rest of the app
    // reads every figure as USD, so convert here before returning. Timestamps
    // and the session are currency-agnostic and pass through untouched.
    const fx = await usdConversion(result.meta?.currency, config.revalidate);
    const scale = (value: number) => (fx ? value * fx.rate : value);

    return {
      points: fx
        ? points.map((point) => ({ time: point.time, value: scale(point.value) }))
        : points,
      price: scale(price),
      previousClose: scale(previousClose),
      currency: "USD",
      ...(fx ? { convertedFrom: fx.from, convertedRate: fx.rate } : {}),
      stats:
        stats && fx
          ? {
              open: scale(stats.open),
              high: scale(stats.high),
              low: scale(stats.low),
              close: scale(stats.close),
            }
          : stats,
      ...(session ? { session } : {}),
    };
  }

  async searchSymbols(query: string): Promise<SymbolSearchResult[]> {
    const url =
      `${SEARCH_URL}?q=${encodeURIComponent(query)}` +
      `&quotesCount=20&newsCount=0&enableFuzzyQuery=false`;

    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      },
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      throw new Error(`Yahoo search request failed: ${res.status} ${query}`);
    }

    const data = (await res.json()) as {
      quotes?: {
        symbol?: string;
        shortname?: string;
        longname?: string;
        quoteType?: string;
        typeDisp?: string;
        exchange?: string;
        exchDisp?: string;
      }[];
    };

    const results = (data.quotes ?? [])
      .filter((item) => item.symbol && item.quoteType === "EQUITY")
      .map((item) => {
        const us = isUsVenue(item.exchange);
        return {
          symbol: item.symbol as string,
          description: item.longname ?? item.shortname ?? (item.symbol as string),
          // The rest of the app filters search results to "Common Stock" (the
          // string Finnhub used); keep that contract so nothing downstream
          // needs to learn Yahoo's vocabulary.
          type: "Common Stock",
          ...(item.exchDisp ? { exchange: item.exchDisp } : {}),
          us,
        };
      });

    // A US reader typing "Siemens" means SIEGY, not the XETRA line Yahoo ranks
    // first — and that ADR already trades in USD, so no conversion is needed
    // for it. Float US listings up; the sort is stable, so Yahoo's own
    // relevance order holds within each group.
    return results
      .map((result, index) => ({ result, index }))
      .sort(
        (a, b) =>
          Number(b.result.us) - Number(a.result.us) || a.index - b.index,
      )
      .map((entry) => entry.result);
  }
}

/**
 * Yahoo's `exchange` codes for venues that trade and settle in USD — the US
 * primary listings plus the OTC tiers where most foreign ADRs sit.
 */
const US_VENUES = new Set([
  "NYQ", "NMS", "NGM", "NCM", "NAS", "ASE", "PCX", "BTS", "PSE", "YHD",
  "PNK", "OTC", "OQB", "OQX", "OID", "OEM",
]);

function isUsVenue(exchange: string | undefined): boolean {
  return exchange !== undefined && US_VENUES.has(exchange);
}
