import { NextResponse } from "next/server";
import { getMarketDataProvider } from "@/lib/market-data";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");

  if (!query) {
    return NextResponse.json([]);
  }

  try {
    const provider = getMarketDataProvider();
    const results = await provider.searchSymbols(query);
    return NextResponse.json(results);
  } catch (error) {
    console.error(`Failed to search symbols for "${query}"`, error);
    return NextResponse.json(
      { error: "Failed to search symbols" },
      { status: 502 },
    );
  }
}
