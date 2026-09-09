import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { getMarketDataProvider } from "@/lib/market-data";
import { describeCompany, listingFacts } from "@/lib/stock-insight";

/**
 * One or two lines on what a company does. Free to every reader.
 *
 * What a company sells does not change week to week, so the answer is cached
 * for a week per ticker — it is written once and every later reader is served
 * that same sentence. Without this, a page anyone can open would bill a model
 * call per view where a key is configured, and hit Wikipedia per view where
 * one is not.
 *
 * `unstable_cache` rather than `use cache`: the latter needs Cache Components
 * turned on for the whole app, which would change caching everywhere else.
 * The key is the ticker alone, so it stays small and shared.
 */
const cachedDescription = unstable_cache(
  async (symbol: string) => {
    const provider = getMarketDataProvider();

    // Falls back to the search for a name when there is no profile, so an ETF
    // or an index is described as readily as an ordinary share.
    const facts = await listingFacts(provider, symbol);

    return describeCompany({ symbol, ...facts });
  },
  ["stock-description-v2"],
  { revalidate: 604_800 },
);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const { symbol } = await params;
  const ticker = symbol.toUpperCase();

  try {
    const description = await cachedDescription(ticker);

    if (!description) {
      return NextResponse.json(
        { error: `No reliable description of ${ticker} to show.`, empty: true },
        { status: 404 },
      );
    }

    return NextResponse.json({ symbol: ticker, description });
  } catch (error) {
    console.error(`Failed to describe ${ticker}`, error);
    return NextResponse.json(
      { error: "Couldn't load the description right now." },
      { status: 502 },
    );
  }
}
