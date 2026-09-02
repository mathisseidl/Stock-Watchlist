import { NextResponse } from "next/server";
import { getMarketDataProvider } from "@/lib/market-data";
import type { CandleRange } from "@/lib/market-data/types";

const VALID_RANGES: CandleRange[] = ["1D", "1W", "1M", "6M", "1Y", "5Y", "ALL"];

export async function GET(
  request: Request,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const { symbol } = await params;
  const { searchParams } = new URL(request.url);
  const rangeParam = searchParams.get("range") ?? "1M";
  const range = VALID_RANGES.includes(rangeParam as CandleRange)
    ? (rangeParam as CandleRange)
    : "1M";

  try {
    const provider = getMarketDataProvider();
    const series = await provider.getCandles(symbol.toUpperCase(), range);
    return NextResponse.json(series);
  } catch (error) {
    console.error(`Failed to fetch candles for ${symbol}`, error);
    return NextResponse.json(
      { error: "Failed to fetch candles" },
      { status: 502 },
    );
  }
}
