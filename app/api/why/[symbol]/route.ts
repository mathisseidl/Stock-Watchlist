import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { getMarketDataProvider } from "@/lib/market-data";
import { RANGE_DAYS, explainMove, listingFacts } from "@/lib/stock-insight";
import type { CandleRange } from "@/lib/market-data/types";

/**
 * The main reason a listing moved over the window on screen. Free to every
 * reader, and cached per ticker and range for an hour so a page a hundred
 * people open costs one model call rather than a hundred.
 */

/**
 * The month, and only the month.
 *
 * A month is the window where recent news genuinely explains the move: long
 * enough that a story has had time to land, short enough that the headlines
 * still reach across all of it. A day is usually one headline or none, and
 * anything past six months is the sum of too much for one reason — so the
 * feature is offered on the monthly view alone rather than answering badly
 * everywhere else.
 */
const EXPLAINABLE: ReadonlySet<string> = new Set(["1M"]);

const cachedExplanation = unstable_cache(
  async (symbol: string, range: CandleRange) => {
    const provider = getMarketDataProvider();

    const [series, facts] = await Promise.all([
      provider.getCandles(symbol, range),
      listingFacts(provider, symbol),
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
      name: facts.name,
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
        error: "This is only offered on the monthly view.",
        unsupported: true,
      },
      { status: 404 },
    );
  }

  try {
    const explanation = await cachedExplanation(ticker, range);

    // The explanation is written to always say something, so nothing back
    // means it could not be produced at all — no model key configured, or the
    // call failed. That is an outage, not a verdict on the month's news.
    if (!explanation) {
      return NextResponse.json(
        { error: `Couldn't work out why ${ticker} moved right now.` },
        { status: 502 },
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
