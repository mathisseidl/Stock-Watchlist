import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { getMarketDataProvider } from "@/lib/market-data";
import { RANGE_DAYS, explainMove } from "@/lib/stock-insight";
import type { CandleRange } from "@/lib/market-data/types";

/**
 * The main reason a listing moved over the window on screen. Free to every
 * reader, and cached per ticker and range for an hour so a page a hundred
 * people open costs one model call rather than a hundred.
 */

/**
 * Ranges a news feed can honestly account for.
 *
 * Beyond six months the answer is not in the headlines: a five-year move is
 * the sum of earnings, rates and sentiment over hundreds of stories, and
 * Finnhub's window does not reach back that far anyway. Offering an
 * explanation there would mean dressing up two months of news as the cause
 * of five years, so those ranges get no answer at all.
 */
const EXPLAINABLE: ReadonlySet<string> = new Set(["1D", "1W", "1M", "6M"]);

const cachedExplanation = unstable_cache(
  async (symbol: string, range: CandleRange) => {
    const provider = getMarketDataProvider();

    const [series, profile] = await Promise.all([
      provider.getCandles(symbol, range),
      provider.getProfile(symbol).catch(() => null),
    ]);

    if (!provider.getHeadlines) return null;

    const to = new Date();
    const from = new Date(
      to.getTime() - RANGE_DAYS[range] * 24 * 60 * 60 * 1000,
    );
    const headlines = await provider
      .getHeadlines(symbol, from, to)
      .catch(() => []);

    return explainMove({
      symbol,
      name: profile?.name && profile.name !== symbol ? profile.name : symbol,
      range,
      ...(series.stats ? { stats: series.stats } : {}),
      price: series.price,
      previousClose: series.previousClose,
      headlines,
    });
  },
  ["stock-why"],
  { revalidate: 3600 },
);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const { symbol } = await params;
  const ticker = symbol.toUpperCase();
  const range = (new URL(request.url).searchParams.get("range") ??
    "1M") as CandleRange;

  if (!EXPLAINABLE.has(range)) {
    return NextResponse.json(
      {
        error:
          "Over a window this long the move is the sum of too many things for one reason to explain it.",
        unsupported: true,
      },
      { status: 404 },
    );
  }

  try {
    const explanation = await cachedExplanation(ticker, range);

    if (!explanation) {
      return NextResponse.json(
        {
          error: `No single story accounts for how ${ticker} moved — the news from this period doesn't explain it.`,
          empty: true,
        },
        { status: 404 },
      );
    }

    return NextResponse.json({ symbol: ticker, range, ...explanation });
  } catch (error) {
    console.error(`Failed to explain ${ticker} over ${range}`, error);
    return NextResponse.json(
      { error: "Couldn't work out the reason right now." },
      { status: 502 },
    );
  }
}
