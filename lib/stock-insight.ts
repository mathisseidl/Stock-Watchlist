import Anthropic from "@anthropic-ai/sdk";
import type { CandleRange, NewsItem, RangeStats } from "./market-data/types";

/**
 * The two plain-English answers the stock page offers about a listing: what
 * the company actually does, and why its price moved over the window on
 * screen.
 *
 * Both are free to every reader, so both are written to be cheap: `effort:
 * "low"`, a tight token ceiling, and routes that cache the answer rather than
 * asking again per view. Neither is allowed to invent — the description is
 * bounded by what the provider already knows about the company, and the
 * explanation may only cite the headlines it is handed. When there is nothing
 * to ground an answer in, both return null and the page simply omits the
 * feature rather than guessing.
 */

/** How each range reads in a sentence, so the model names the right window. */
const RANGE_WORDS: Record<CandleRange, string> = {
  "1D": "today",
  "1W": "the past week",
  "1M": "the past month",
  "6M": "the past six months",
  "1Y": "the past year",
  "5Y": "the past five years",
  ALL: "its whole listed history",
};

function client(): Anthropic | null {
  return process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
}

function textOf(response: Anthropic.Message): string {
  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

/** Collapses the model's answer to one paragraph of plain prose. */
function oneParagraph(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

const DESCRIBE_PROMPT = `You explain what a company does to someone who has never heard of it.

Rules:
- Two sentences at most, and under 40 words in total.
- Say what it sells and who buys it. Lead with the thing a stranger would recognise.
- Plain English. No jargon, no marketing language, no "leading provider of".
- State only what you are confident is true of this company. If you are not sure what it does, reply with exactly: UNKNOWN
- Never mention the share price, the stock, whether it is a good investment, or any figure you were not given.
- No preamble. Reply with the description alone.`;

/**
 * One or two lines on what a company does, or null when there is nothing
 * trustworthy to say.
 *
 * The industry and website come from the provider's own profile and are
 * passed in as anchors: they keep the answer on the right company where a
 * ticker is ambiguous, and the model is told to refuse rather than guess.
 */
export async function describeCompany(input: {
  symbol: string;
  name: string;
  industry?: string;
  weburl?: string;
}): Promise<string | null> {
  const anthropic = client();
  if (!anthropic) return null;

  const facts = [
    `Ticker: ${input.symbol}`,
    `Name: ${input.name}`,
    input.industry ? `Industry (per data provider): ${input.industry}` : null,
    input.weburl ? `Website: ${input.weburl}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const response = await anthropic.messages.create({
      model: "claude-opus-5",
      max_tokens: 200,
      output_config: { effort: "low" },
      system: DESCRIBE_PROMPT,
      messages: [{ role: "user", content: facts }],
    });

    const description = oneParagraph(textOf(response));
    if (!description || description.toUpperCase().includes("UNKNOWN")) {
      return null;
    }
    return description;
  } catch (error) {
    console.error(`Could not describe ${input.symbol}`, error);
    return null;
  }
}

const WHY_PROMPT = `You explain, in plain English, the main reason a stock moved over a period.

You are given the size of the move and the headlines published during that period.

Rules:
- Name the single biggest driver. Two sentences at most, under 45 words.
- Ground every claim in the supplied headlines. Never introduce an event, number, date or name that is not in them.
- The headlines are the only evidence you have. If none of them plausibly accounts for a move of this size, reply with exactly: NO_CLEAR_DRIVER
- A move can be about the whole market rather than the company (rates, oil, a selloff). Say so when the headlines point that way.
- Do not restate the percentage back to the reader; they can already see it.
- Never give advice, a forecast, or a price target.
- No preamble. Reply with the explanation alone.`;

export type MoveExplanation = {
  /** The plain-English reason. */
  reason: string;
  /** Direction the window actually went, so the UI can label it. */
  direction: "up" | "down" | "flat";
  changePercent: number;
  /** The window this explains, e.g. "the past month". */
  period: string;
};

/**
 * Why a listing moved across the visible window, or null when the headlines
 * cannot honestly account for it.
 *
 * A move with no news behind it is the normal case for a quiet month, and
 * saying "no single clear driver" is a true answer — far better than dressing
 * up an unrelated headline as the cause.
 */
export async function explainMove(input: {
  symbol: string;
  name: string;
  range: CandleRange;
  stats?: RangeStats;
  price: number;
  previousClose: number;
  headlines: NewsItem[];
}): Promise<MoveExplanation | null> {
  const anthropic = client();
  if (!anthropic) return null;

  // The window's own open, not yesterday's close: over a month the reader is
  // asking about the whole span on the chart, not the last session.
  const open = input.stats?.open ?? input.previousClose;
  const close = input.stats?.close ?? input.price;
  if (!open || !close) return null;

  const changePercent = ((close - open) / open) * 100;
  const direction =
    Math.abs(changePercent) < 0.5 ? "flat" : changePercent > 0 ? "up" : "down";
  const period = RANGE_WORDS[input.range];

  if (input.headlines.length === 0) return null;

  const articles = input.headlines
    .map((item) => {
      const day = new Date(item.datetime * 1000).toISOString().slice(0, 10);
      return `- [${day}] ${item.source}: ${item.headline}`;
    })
    .join("\n");

  try {
    const response = await anthropic.messages.create({
      model: "claude-opus-5",
      max_tokens: 300,
      output_config: { effort: "low" },
      system: WHY_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            `Company: ${input.name} (${input.symbol})`,
            `Period: ${period}`,
            `Move over the period: ${changePercent >= 0 ? "+" : ""}${changePercent.toFixed(1)}%`,
            `Range high/low: ${input.stats ? `${input.stats.high} / ${input.stats.low}` : "not available"}`,
            "",
            `Headlines published during the period (newest first):`,
            articles,
          ].join("\n"),
        },
      ],
    });

    const reason = oneParagraph(textOf(response));
    if (!reason || reason.toUpperCase().includes("NO_CLEAR_DRIVER")) {
      return null;
    }
    return { reason, direction, changePercent, period };
  } catch (error) {
    console.error(`Could not explain ${input.symbol}'s move`, error);
    return null;
  }
}

/** How far back each range's news window has to reach. */
export const RANGE_DAYS: Record<CandleRange, number> = {
  "1D": 2,
  "1W": 8,
  "1M": 32,
  "6M": 60,
  "1Y": 60,
  "5Y": 60,
  ALL: 60,
};
