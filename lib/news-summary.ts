import Anthropic from "@anthropic-ai/sdk";
import type { NewsItem } from "@/lib/market-data/types";

/**
 * The briefing behind "News Summary": up to six lines saying only what the
 * day's stories report happened to the company and its stock — no framing, no
 * "why it matters", no takeaway.
 *
 * It is written from the same three curated stories the stock page already
 * shows — the ones that survived the trust, freshness and relevance filters —
 * so the brief can never cite something the reader cannot go and open for
 * themselves. Sources are returned alongside the text and rendered under it,
 * because a summary the reader cannot check is worth very little.
 *
 * Claude writes it when an API key is configured. Without one, the composer
 * below assembles the same shape from the article text directly, so the
 * feature works on a fresh checkout rather than erroring.
 */

/** Upper bound on how many lines the brief runs to. */
export const BRIEF_LINES = 6;

/** Preferred window. Falls back to everything curated (48h) if nothing is newer. */
const RECENT_HOURS = 24;

export type BriefSource = {
  name: string;
  /** The headline, so two stories from the same desk stay distinguishable. */
  title: string;
  url: string;
  datetime: number;
};

export type NewsBrief = {
  lines: string[];
  sources: BriefSource[];
  /** Whether Claude wrote the prose or the built-in composer did. */
  writtenBy: "claude" | "composer";
  /** True when nothing landed in 24h and the brief widened to 48h. */
  widened: boolean;
  symbol: string;
  generatedAt: string;
};

/* ------------------------------------------------------------------ */
/* Text helpers                                                        */
/* ------------------------------------------------------------------ */

/** Wires hand us HTML entities in plain-text fields more often than not. */
const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&#39;": "'",
  "&nbsp;": " ",
  "&rsquo;": "’",
  "&lsquo;": "‘",
  "&ldquo;": "“",
  "&rdquo;": "”",
  "&mdash;": "—",
  "&ndash;": "–",
  "&hellip;": "…",
};

function tidy(text: string): string {
  return text
    .replace(/&[a-z]+;/gi, (entity) => ENTITIES[entity.toLowerCase()] ?? entity)
    // Numeric entities (&#34; &#x27;) are just as common and need no table.
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (whole, code: string) => {
      const point = code.toLowerCase().startsWith("x")
        ? parseInt(code.slice(1), 16)
        : parseInt(code, 10);
      return Number.isFinite(point) && point > 0 && point <= 0x10ffff
        ? String.fromCodePoint(point)
        : whole;
    })
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:])/g, "$1")
    .trim();
}

/**
 * Whole sentences from a summary, cleaned and filtered to the substantive
 * ones. Splits on sentence enders only when the next chunk starts like a new
 * sentence, so "U.S." and "Inc." stay intact.
 */
function splitSentences(text: string): string[] {
  const clean = tidy(text);
  if (!clean) return [];
  return clean
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])/)
    .map((part) => part.trim())
    .filter((part) => part.length > 12);
}

function hoursAgo(datetime: number): number {
  return Math.max(0, (Date.now() / 1000 - datetime) / 3600);
}

function ageLabel(datetime: number): string {
  const hours = hoursAgo(datetime);
  if (hours < 1) return "in the last hour";
  if (hours < 2) return "about an hour ago";
  if (hours < 24) return `${Math.round(hours)} hours ago`;
  return "yesterday";
}

/* ------------------------------------------------------------------ */
/* The built-in composer                                               */
/* ------------------------------------------------------------------ */

/**
 * Assembles the brief from the article text itself: just what the stories say
 * happened, most important first, one story per block. Every sentence is lifted
 * from a story that was actually published — nothing here invents a fact, which
 * is the one property a financial summary cannot compromise on.
 *
 * The lines fill toward six: with three stories that is roughly two sentences
 * each, with one it is up to six from that single article. A story's first
 * line carries its source and age ("Reuters, 3 hours ago: …"); any follow-on
 * sentence is a bare line the UI attaches to the same block.
 */
function compose(items: NewsItem[]): string[] {
  const lines: string[] = [];
  const perStory = Math.max(1, Math.ceil(BRIEF_LINES / items.length));

  for (const item of items) {
    if (lines.length >= BRIEF_LINES) break;

    const pool = splitSentences(item.summary ?? "");
    const headline = tidy(item.headline).replace(
      /\s*[-–—|]\s*[^-–—|]{0,40}$/,
      "",
    );
    const picked = pool.length > 0 ? pool.slice(0, perStory) : [headline];

    picked.forEach((sentence, index) => {
      if (lines.length >= BRIEF_LINES) return;
      lines.push(
        index === 0
          ? `${item.source}, ${ageLabel(item.datetime)}: ${sentence}`
          : sentence,
      );
    });
  }

  return lines.slice(0, BRIEF_LINES);
}

/* ------------------------------------------------------------------ */
/* Claude                                                              */
/* ------------------------------------------------------------------ */

const SYSTEM_PROMPT = `You write a short news briefing for a stock-watching app.

You will be given the two or three most credible news stories about one company from the last day, each with its source, age and summary. Write a briefing a busy investor can read in fifteen seconds: only what actually happened to this company and its stock.

Rules:
- Up to ${BRIEF_LINES} lines, one sentence per line. No bullets, numbering, markdown, headings or preamble.
- Give the concrete substance of each story, most important first. Begin each story's first line with its source and age, e.g. "Reuters, 3 hours ago: ...". Any further detail on that same story goes on the next line with no prefix.
- Every fact must come from the supplied stories. Never add a number, name, date or event that is not in them.
- No "what the news is about" opener, no "why it matters" line, no closing summary, no advice to buy or sell, no invented price targets. Just the news.
- Plain English, active voice.`;

async function writeWithClaude(
  items: NewsItem[],
  options: { symbol: string; companyName?: string; widened: boolean },
): Promise<string[] | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  const articles = items
    .map((item, index) =>
      [
        `Story ${index + 1}`,
        `Source: ${item.source}`,
        `Published: ${ageLabel(item.datetime)}`,
        `Headline: ${tidy(item.headline)}`,
        `Summary: ${tidy(item.summary ?? "(none provided)")}`,
      ].join("\n"),
    )
    .join("\n\n");

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 1200,
      // A grounded six-line summary is not a reasoning problem; low effort
      // keeps the click-to-brief wait short and the cost per view sensible.
      output_config: { effort: "low" },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Company: ${options.companyName ?? options.symbol} (${options.symbol})\nWindow: last ${options.widened ? "48" : "24"} hours\n\n${articles}`,
        },
      ],
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    const lines = text
      .split("\n")
      .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
      .filter(Boolean);

    return lines.length >= 2 ? lines.slice(0, BRIEF_LINES) : null;
  } catch (error) {
    // A model outage should downgrade the brief, never break the feature.
    console.error("Claude briefing failed; falling back to the composer", error);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */

export async function buildNewsBrief(
  curated: NewsItem[],
  options: { symbol: string; companyName?: string },
): Promise<NewsBrief | null> {
  if (curated.length === 0) return null;

  // The curated list is already ranked by importance. Narrowing it to 24 hours
  // is only worth doing when the narrower set still carries the top story and
  // enough of the rest to be a briefing — otherwise the reader would get a
  // filler item purely because it was newer than the one that mattered.
  const recent = curated.filter((item) => hoursAgo(item.datetime) <= RECENT_HOURS);
  const keepsLeadStory = recent.length > 0 && recent[0].url === curated[0].url;
  const widened = !keepsLeadStory || recent.length < Math.min(2, curated.length);
  const items = widened ? curated : recent;

  const fromClaude = await writeWithClaude(items, { ...options, widened });
  const lines = fromClaude ?? compose(items);

  return {
    lines,
    sources: items.map((item) => ({
      name: item.source,
      title: tidy(item.headline),
      url: item.url,
      datetime: item.datetime,
    })),
    writtenBy: fromClaude ? "claude" : "composer",
    widened,
    symbol: options.symbol,
    generatedAt: new Date().toISOString(),
  };
}
