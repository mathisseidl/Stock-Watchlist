import { NextResponse } from "next/server";
import { getMarketDataProvider } from "@/lib/market-data";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const { symbol } = await params;

  try {
    const provider = getMarketDataProvider();
    const quote = await provider.getQuote(symbol.toUpperCase());
    return NextResponse.json(quote);
  } catch (error) {
    console.error(`Failed to fetch quote for ${symbol}`, error);
    return NextResponse.json(
      { error: "Failed to fetch quote" },
      { status: 502 },
    );
  }
}
