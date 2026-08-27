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

export type CandleSeries = {
  points: CandlePoint[];
  /** Latest live price from the data source (constant across ranges). */
  price: number;
  /** Reference close used for the day's change. */
  previousClose: number;
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
  getNews(symbol: string): Promise<NewsItem[]>;
  getProfile(symbol: string): Promise<CompanyProfile>;
}
