import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { getMarketDataProvider } from "@/lib/market-data";
import { describeCompany } from "@/lib/stock-insight";

/**
 * One or two lines on what a company does. Free to every reader.
 *
 * What a company sells does not change week to week, so the answer is cached
 * for a week per ticker — the model is asked once and every later reader is
 * served that same sentence. Without this, a free feature on a page anyone
 * can open would bill a model call per view.
 *
 * `unstable_cache` rather than `use cache`: the latter needs Cache Components
 * turned on for the whole app, which would change caching everywhere else.
 * The key is the ticker alone, so it stays small and shared.
 */
const cachedDescription = unstable_cache(
  async (symbol: string) => {
    const provider = getMarketDataProvider();

    // The profile anchors the answer to the right company. A missing one is
    // no reason to give up — plenty of ETFs and indices have none — so the
    // ticker alone is still worth asking about.
    const profile = await provider.getProfile(symbol).catch(() => null);

    return describeCompany({
      symbol,
      name: profile?.name && profile.name !== symbol ? profile.name : symbol,
      ...(profile?.industry ? { industry: profile.industry } : {}),
      ...(profile?.weburl ? { weburl: profile.weburl } : {}),
    });
  },
  ["stock-description"],
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
