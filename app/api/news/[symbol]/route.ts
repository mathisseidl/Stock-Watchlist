import { NextResponse } from "next/server";
import { getMarketDataProvider } from "@/lib/market-data";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const { symbol } = await params;

  try {
    const provider = getMarketDataProvider();
    const news = await provider.getNews(symbol.toUpperCase());
    return NextResponse.json(news);
  } catch (error) {
    console.error(`Failed to fetch news for ${symbol}`, error);
    return NextResponse.json(
      { error: "Failed to fetch news" },
      { status: 502 },
    );
  }
}
