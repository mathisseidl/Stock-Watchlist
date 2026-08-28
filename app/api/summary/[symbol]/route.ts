import { NextResponse } from "next/server";
import { getMarketDataProvider } from "@/lib/market-data";
import { buildNewsBrief } from "@/lib/news-summary";
import { requirePro } from "@/lib/subscription";

export const maxDuration = 60;

/**
 * The AI news briefing for one ticker. Pro only.
 *
 * It reads the same three curated stories the stock page shows, so the brief
 * inherits their filters: trusted desk, published inside 48 hours, actually
 * about this company, and free to open.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const { symbol } = await params;
  const ticker = symbol.toUpperCase();

  const access = await requirePro();
  if (!access.ok) {
    return NextResponse.json(
      {
        error: "News briefings are a Pro feature.",
        requiresPro: true,
        reason: access.reason,
      },
      { status: 403 },
    );
  }

  try {
    const provider = getMarketDataProvider();

    // The company name sharpens both relevance scoring and the brief's own
    // opening line, but losing it must not cost us the briefing.
    const companyName = await provider
      .getProfile(ticker)
      .then((profile) => profile.name)
      .catch(() => undefined);

    const news = await provider.getNews(ticker, companyName);
    const brief = await buildNewsBrief(news, { symbol: ticker, companyName });

    if (!brief) {
      return NextResponse.json(
        {
          error: `Nothing worth briefing on ${ticker} yet — no trusted story about it has been published in the last two days.`,
          empty: true,
        },
        { status: 404 },
      );
    }

    return NextResponse.json(brief);
  } catch (error) {
    console.error(`Failed to build a news brief for ${ticker}`, error);
    return NextResponse.json(
      { error: "Couldn't put the briefing together right now." },
      { status: 502 },
    );
  }
}
