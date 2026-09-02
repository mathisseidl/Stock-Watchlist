import { FinnhubProvider } from "./finnhub";
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
        getQuote: (symbol) => finnhub.getQuote(symbol),
        getCandles: (symbol, range) => yahoo.getCandles(symbol, range),
        // Yahoo's search reaches the US-listed ADRs of foreign companies
        // (SIEGY, BMWKY, …) that Finnhub's free tier leaves out and that a US
        // reader means when they type a name. Finnhub is the fallback if
        // Yahoo's endpoint is unreachable.
        searchSymbols: async (query) => {
          try {
            return await yahoo.searchSymbols(query);
          } catch (error) {
            console.error(`Yahoo search failed for "${query}"; using Finnhub`, error);
            return finnhub.searchSymbols(query);
          }
        },
        getNews: (symbol, companyName) => finnhub.getNews(symbol, companyName),
        getProfile: (symbol) => finnhub.getProfile(symbol),
      };
      return cachedProvider;
    }
    default:
      throw new Error(`Unknown MARKET_DATA_PROVIDER: ${providerName}`);
  }
}
