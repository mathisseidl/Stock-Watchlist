export type TickerColor = {
  bg: string;
  fg: string;
};

export type WatchlistItem = {
  symbol: string;
  name: string;
};

/** Seed watchlist shown before the user has customised their own. */
export const defaultWatchlist: WatchlistItem[] = [
  { symbol: "AAPL", name: "Apple Inc" },
  { symbol: "MSFT", name: "Microsoft Corp" },
  { symbol: "GOOGL", name: "Alphabet Inc" },
  { symbol: "AMZN", name: "Amazon.com Inc" },
  { symbol: "TSLA", name: "Tesla Inc" },
];

