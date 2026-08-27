import { curateNews } from "./news-curation";
import type {
  CompanyProfile,
  NewsItem,
  Quote,
  SymbolSearchResult,
} from "./types";

const BASE_URL = "https://finnhub.io/api/v1";

type FinnhubQuoteResponse = {
  c: number;
  d: number | null;
  dp: number | null;
  h: number;
  l: number;
  o: number;
  pc: number;
};

type FinnhubSearchResponse = {
  result: { symbol: string; description: string; type: string }[];
};

type FinnhubNewsItem = {
  id: number;
  headline: string;
  source: string;
  url: string;
  datetime: number;
  summary: string;
};

type FinnhubProfileResponse = {
  name?: string;
  ticker?: string;
  logo?: string;
  exchange?: string;
  finnhubIndustry?: string;
  weburl?: string;
};

export class FinnhubProvider {
  constructor(private readonly apiKey: string) {}

  private async fetchJson<T>(
    path: string,
    params: Record<string, string>,
    revalidateSeconds: number,
  ): Promise<T> {
    const url = new URL(`${BASE_URL}${path}`);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    url.searchParams.set("token", this.apiKey);

    const res = await fetch(url.toString(), {
      next: { revalidate: revalidateSeconds },
    });

    if (!res.ok) {
      throw new Error(`Finnhub request failed: ${res.status} ${path}`);
    }

    return res.json() as Promise<T>;
  }

  async getQuote(symbol: string): Promise<Quote> {
    const data = await this.fetchJson<FinnhubQuoteResponse>(
      "/quote",
      { symbol },
      30,
    );

    return {
      symbol,
      currentPrice: data.c,
      change: data.d ?? 0,
      changePercent: data.dp ?? 0,
      previousClose: data.pc,
      high: data.h,
      low: data.l,
      open: data.o,
    };
  }

  async searchSymbols(query: string): Promise<SymbolSearchResult[]> {
    const data = await this.fetchJson<FinnhubSearchResponse>(
      "/search",
      { q: query },
      3600,
    );

    return data.result.map((item) => ({
      symbol: item.symbol,
      description: item.description,
      type: item.type,
    }));
  }

  async getNews(symbol: string, companyName?: string): Promise<NewsItem[]> {
    const to = new Date();
    // Finnhub's window is date-based, so pull three calendar days to be sure
    // the full trailing 48 hours is covered whatever the current UTC time is.
    const from = new Date(to.getTime() - 3 * 24 * 60 * 60 * 1000);
    const format = (date: Date) => date.toISOString().slice(0, 10);

    const data = await this.fetchJson<FinnhubNewsItem[]>(
      "/company-news",
      { symbol, from: format(from), to: format(to) },
      900,
    );

    const items: NewsItem[] = data.map((item) => ({
      id: item.id,
      headline: item.headline,
      source: item.source,
      url: item.url,
      datetime: item.datetime,
      summary: item.summary,
    }));

    return curateNews(items, { symbol, companyName });
  }

  async getProfile(symbol: string): Promise<CompanyProfile> {
    const data = await this.fetchJson<FinnhubProfileResponse>(
      "/stock/profile2",
      { symbol },
      // Logos and company metadata change rarely — cache for a day.
      86_400,
    );

    return {
      symbol,
      name: data.name ?? symbol,
      logo: data.logo ?? "",
      exchange: data.exchange ?? "",
      industry: data.finnhubIndustry ?? "",
      weburl: data.weburl ?? "",
    };
  }
}
