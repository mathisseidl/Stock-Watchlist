import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { getMarketDataProvider } from "@/lib/market-data";
import { RANGE_DAYS, explainMove, listingFacts } from "@/lib/stock-insight";
import type { Benchmark } from "@/lib/stock-insight";
import type { CandleRange, MarketDataProvider } from "@/lib/market-data/types";

/**
 * The main reason a listing moved over the window on screen. Free to every
 * reader, and cached per ticker and range for an hour so a page a hundred
 * people open is answered once rather than a hundred times.
 */

/**
 * What the whole market did over the same window, so the answer can separate
 * "this company had a bad month" from "everything did".
 *
 * SPY rather than an index symbol because it is the same free Yahoo candle
 * call every chart on the site already makes. A listing that *is* the market
 * gets no comparison — telling a reader the S&P 500 tracked the S&P 500 is
 * not an insight.
 */
const MARKET_PROXY = "SPY";
const IS_THE_MARKET = new Set(["SPY", "VOO", "IVV", "SPLG", "^GSPC", "^SPX"]);

async function marketOver(
  provider: MarketDataProvider,
  symbol: string,
  range: CandleRange,
): Promise<Benchmark | undefined> {
  if (IS_THE_MARKET.has(symbol)) return undefined;

  // A missing benchmark drops one sentence; it must never cost the answer.
  const series = await provider.getCandles(MARKET_PROXY, range).catch(() => null);
  const open = series?.stats?.open;
  const close = series?.stats?.close;
  if (!open || !close) return undefined;

  return {
    name: "The S&P 500",
    changePercent: ((close - open) / open) * 100,
  };
}

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

    const to = new Date();
    const from = new Date(
      to.getTime() - RANGE_DAYS[range] * 24 * 60 * 60 * 1000,
    );

    const [series, facts, benchmark, headlines] = await Promise.all([
      provider.getCandles(symbol, range),
      listingFacts(provider, symbol),
      marketOver(provider, symbol, range),
      provider.getHeadlines
        ? provider.getHeadlines(symbol, from, to).catch(() => [])
        : [],
    ]);

    return explainMove({
      symbol,
      name: facts.name,
      range,
      ...(series.stats ? { stats: series.stats } : {}),
      price: series.price,
      previousClose: series.previousClose,
      // The intraday points the chart is drawn from, so the answer can name
      // the sharpest day rather than only the month as a whole.
      points: series.points,
      headlines,
      ...(benchmark ? { benchmark } : {}),
    });
  },
  ["stock-why-v2"],
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

    // The explanation always says something, model key or not, so nothing
    // back means the window held no prices at all — an outage upstream, not a
    // verdict on the month's news.
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
