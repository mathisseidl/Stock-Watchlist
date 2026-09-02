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

export type CandleRange = "1D" | "1W" | "1M" | "1Y" | "5Y" | "ALL";

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
};

export type SymbolSearchResult = {
  symbol: string;
  description: string;
  type: string;
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
  getProfile(symbol: string): Promise<CompanyProfile>;
}
