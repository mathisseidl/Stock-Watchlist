export type Quote = {
  symbol: string;
  currentPrice: number;
  change: number;
  changePercent: number;
  previousClose: number;
  high: number;
  low: number;
  open: number;
};

export type CandleRange = "1D" | "1W" | "1M" | "6M" | "1Y" | "5Y" | "ALL";

export type CandlePoint = {
  time: number;
  value: number;
};

/**
 * Open/high/low/close across whatever window a range covers, so the figures
 * under the chart describe the period the reader actually selected rather
 * than always describing today.
 */
export type RangeStats = {
  open: number;
  high: number;
  low: number;
  close: number;
};

/**
 * The slice of one trading day a `1D` chart is drawn across, in epoch seconds.
 *
 * Taken from the exchange rather than assumed, because the sessions differ per
 * listing: New York runs 09:30–16:00 with trading on to 20:00, XETRA and Tokyo
 * publish no extended-hours prices at all, and Tokyo breaks for lunch.
 */
export type TradingSession = {
  /** Regular open — the left edge of the chart. */
  start: number;
  /** Regular close. Where the after-hours stretch begins, when there is one. */
  regularEnd: number;
  /** Right edge once the day is over: post-market close, or `regularEnd`. */
  end: number;
  /** Whether `regularEnd`..`end` is a real extended session worth marking. */
  hasAfterHours: boolean;
  /** IANA zone of the exchange, so the axis reads in the market's own clock. */
  timeZone: string;
};

export type CandleSeries = {
  points: CandlePoint[];
  /** Latest live price from the data source (constant across ranges). */
  price: number;
  /** Reference close used for the day's change. */
  previousClose: number;
  /** OHLC over the returned window. Absent when the window holds no candles. */
  stats?: RangeStats;
  /** Only on `1D`: the session the points belong to. */
  session?: TradingSession;
  /** Currency every figure here is in — always "USD" (foreign listings are
   *  converted before they leave the provider). */
  currency: string;
  /** Set when the figures were converted: the source currency and the spot
   *  rate used, so the chart can note it. */
  convertedFrom?: string;
  convertedRate?: number;
};

/**
 * Instrument types the search is allowed to surface, in the vocabulary the
 * providers normalise onto ("Common Stock" is the string Finnhub used, and the
 * app kept it).
 *
 * The list is bounded by what the app can actually price. Finnhub covers
 * US-listed shares and ETFs, but answers an index with "Market data
 * subscription required for CFD indices" — and does so with HTTP 200 and an
 * error body, so nothing throws and the page would simply show no price.
 * Indices are still listed here because Yahoo prices them for free: see
 * `isIndexSymbol`, which routes them there instead. Mutual funds stay out —
 * neither provider quotes them.
 */
export const SEARCHABLE_SYMBOL_TYPES = new Set([
  "Common Stock",
  "ETF",
  "Index",
]);

export type SymbolSearchResult = {
  symbol: string;
  description: string;
  /** One of `SEARCHABLE_SYMBOL_TYPES`. */
  type: string;
  /** Human-readable venue ("NYSE", "OTC Markets", "XETRA"), when known. */
  exchange?: string;
  /** True for a US-traded line (domestic listing or ADR) — ranked first. */
  us?: boolean;
};

export type NewsItem = {
  id: number;
  headline: string;
  source: string;
  url: string;
  datetime: number;
  summary: string;
  /** One-line explanation of why this story is worth reading. */
  reason?: string;
};

export type CompanyProfile = {
  symbol: string;
  name: string;
  logo: string;
  exchange: string;
  industry: string;
  weburl: string;
};

export interface MarketDataProvider {
  getQuote(symbol: string): Promise<Quote>;
  getCandles(symbol: string, range: CandleRange): Promise<CandleSeries>;
  searchSymbols(query: string): Promise<SymbolSearchResult[]>;
  getNews(symbol: string, companyName?: string): Promise<NewsItem[]>;
  /**
   * Every headline across a window, uncurated — what the "why did it move"
   * explanation reads. Optional because only Finnhub serves it.
   */
  getHeadlines?(symbol: string, from: Date, to: Date): Promise<NewsItem[]>;
  getProfile(symbol: string): Promise<CompanyProfile>;
}
