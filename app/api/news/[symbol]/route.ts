import { NextResponse } from "next/server";
import { getMarketDataProvider } from "@/lib/market-data";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const { symbol } = await params;
  const ticker = symbol.toUpperCase();

  try {
    const provider = getMarketDataProvider();

    // The company name sharpens relevance scoring ("Apple unveils…" has no
    // ticker in it). It is cached for a day upstream, and a failure here should
    // never cost us the news itself.
    const companyName = await provider
      .getProfile(ticker)
      .then((profile) => profile.name)
      .catch(() => undefined);

    const news = await provider.getNews(ticker, companyName);
    return NextResponse.json(news);
  } catch (error) {
    console.error(`Failed to fetch news for ${symbol}`, error);
    return NextResponse.json(
      { error: "Failed to fetch news" },
      { status: 502 },
    );
  }
}
