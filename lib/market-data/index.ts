import { FinnhubProvider } from "./finnhub";
import { indexName, isIndexSymbol, withIndexFunds } from "./index-funds";
import { YahooProvider } from "./yahoo";
import type { MarketDataProvider } from "./types";

export * from "./types";

let cachedProvider: MarketDataProvider | null = null;

export function getMarketDataProvider(): MarketDataProvider {
  if (cachedProvider) return cachedProvider;

  const providerName = process.env.MARKET_DATA_PROVIDER ?? "finnhub";

  switch (providerName) {
    case "finnhub": {
      const apiKey = process.env.FINNHUB_API_KEY;
      if (!apiKey) {
        throw new Error("FINNHUB_API_KEY is not set in the environment.");
      }
      // Finnhub covers quotes, search, news and logos on the free tier, but not
      // historical candles — those come from Yahoo. Composing them here keeps
      // the rest of the app talking to a single MarketDataProvider.
      const finnhub = new FinnhubProvider(apiKey);
      const yahoo = new YahooProvider();
      cachedProvider = {
        // Finnhub answers an index with "Market data subscription required
        // for CFD indices" — and answers it with HTTP 200, so nothing throws
        // and the page would just render an empty price. Yahoo quotes the
        // indices for free, so they go there instead.
        getQuote: (symbol) =>
          isIndexSymbol(symbol)
            ? yahoo.getQuote(symbol)
            : finnhub.getQuote(symbol),
        getCandles: (symbol, range) => yahoo.getCandles(symbol, range),
        // Yahoo's search reaches the US-listed ADRs of foreign companies
        // (SIEGY, BMWKY, …) that Finnhub's free tier leaves out and that a US
        // reader means when they type a name. Finnhub is the fallback if
        // Yahoo's endpoint is unreachable.
        //
        // `withIndexFunds` wraps both, because neither provider answers an
        // index name with anything this app can price: "nasdaq" and "s&p 500"
        // come back from Yahoo as CME futures alone, which the type filter
        // then drops to nothing. It runs out here rather than inside either
        // provider so the index names resolve on the fallback path too.
        searchSymbols: async (query) => {
          try {
            return withIndexFunds(query, await yahoo.searchSymbols(query));
          } catch (error) {
            console.error(`Yahoo search failed for "${query}"; using Finnhub`, error);
            return withIndexFunds(query, await finnhub.searchSymbols(query));
          }
        },
        getNews: (symbol, companyName) => finnhub.getNews(symbol, companyName),
        getHeadlines: (symbol, from, to) =>
          finnhub.getHeadlines(symbol, from, to),
        // An index has no company behind it, and Finnhub returns `{}` for one,
        // which would leave the detail page headed "^DJI". The name comes from
        // our own table instead; there is no logo or industry to fill in.
        getProfile: (symbol) => {
          const name = indexName(symbol);
          if (name) {
            return Promise.resolve({
              symbol,
              name,
              logo: "",
              exchange: "Index",
              industry: "",
              weburl: "",
            });
          }
          return finnhub.getProfile(symbol);
        },
      };
      return cachedProvider;
    }
    default:
      throw new Error(`Unknown MARKET_DATA_PROVIDER: ${providerName}`);
  }
}
