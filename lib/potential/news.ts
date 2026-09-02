import { getMarketDataProvider } from "@/lib/market-data";

export type PotentialHeadline = {
  title: string;
  url: string;
  source: string;
  datetime: number;
};

/**
 * This week's top headline(s) for a pick, frozen into the snapshot so the page
 * shows what was current when the screen ran — not whatever is live when a
 * reader loads it days later. Reuses the same curated feed the stock page
 * shows (trusted desk, last 48h, free to open).
 *
 * News is context only. It never feeds the score.
 */
export async function fetchHeadlines(
  symbol: string,
  name: string,
  limit = 2,
): Promise<PotentialHeadline[]> {
  try {
    const news = await getMarketDataProvider().getNews(symbol, name);
    return news.slice(0, limit).map((item) => ({
      title: item.headline,
      url: item.url,
      source: item.source,
      datetime: item.datetime,
    }));
  } catch {
    // A missing headline must never sink the whole weekly run.
    return [];
  }
}
