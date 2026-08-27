import { NextResponse } from "next/server";
import { getMarketDataProvider } from "@/lib/market-data";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const { symbol } = await params;

  try {
    const provider = getMarketDataProvider();
    const profile = await provider.getProfile(symbol.toUpperCase());
    return NextResponse.json(profile);
  } catch (error) {
    console.error(`Failed to fetch profile for ${symbol}`, error);
    return NextResponse.json(
      { error: "Failed to fetch profile" },
      { status: 502 },
    );
  }
}
