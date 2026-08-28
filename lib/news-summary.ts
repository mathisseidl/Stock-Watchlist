import Anthropic from "@anthropic-ai/sdk";
import type { NewsItem } from "@/lib/market-data/types";

/**
 * The six-line briefing behind "News Summary".
 *
 * It is written from the same three curated stories the stock page already
 * shows — the ones that survived the trust, freshness and relevance filters —
 * so the brief can never cite something the reader cannot go and open for
 * themselves. Sources are returned alongside the prose and rendered under it,
 * because a summary the reader cannot check is worth very little.
 *
 * Claude writes it when an API key is configured. Without one, the composer
 * below assembles the same shape from the article text directly, so the
 * feature works on a fresh checkout rather than erroring.
 */

/** How many lines the brief should run to. */
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

/** First sentence of a summary, trimmed to something that reads as one line. */
function firstSentence(text: string, limit = 190): string {
  const clean = tidy(text);
  if (!clean) return "";
  // Split on sentence enders, but not on the dot inside "U.S." or "Inc.".
  const match = clean.match(/^.*?[.!?](?=\s+[A-Z0-9"“]|$)/);
  const sentence = match ? match[0] : clean;
  if (sentence.length <= limit) return sentence;
  const cut = sentence.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 40 ? lastSpace : limit).trim()}…`;
}

function listSources(items: NewsItem[]): string {
  const names = Array.from(new Set(items.map((item) => item.source)));
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
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
 * Assembles a brief from the article text itself. Every line is grounded in a
 * story that was actually published — nothing here invents a fact, which is
 * the one property a financial summary cannot compromise on.
 */
function compose(
  items: NewsItem[],
  options: { symbol: string; companyName?: string; widened: boolean },
): string[] {
  const name = options.companyName?.trim();
  const subject =
    name && name.toUpperCase() !== options.symbol
      ? `${name} (${options.symbol})`
      : options.symbol;
  const window = options.widened ? "two days" : "24 hours";
  const count = items.length;

  const lines: string[] = [];

  lines.push(
    `${count === 1 ? "One story" : `${count} stories`} on ${subject} landed in the last ${window}, carried by ${listSources(items)}.`,
  );

  for (const item of items) {
    const body = firstSentence(item.summary ?? "");
    const headline = tidy(item.headline).replace(/\s*[-–—|]\s*[^-–—|]{0,30}$/, "");
    // Prefer the article's own opening line; the headline is the fallback when
    // a wire gives us no body text.
    const sentence = body && body.length > headline.length / 2 ? body : headline;
    lines.push(`${item.source}, ${ageLabel(item.datetime)}: ${sentence}`);
  }

  // The classifier's generic fallback says nothing, so a specific reason is
  // always preferred over it — and only used at all if one exists.
  const generic = new RegExp(`^Recent background on where ${options.symbol}\\b`);
  const allReasons = items
    .map((item) => item.reason)
    .filter((reason): reason is string => Boolean(reason));
  const specific = allReasons.filter((reason) => !generic.test(reason));
  const reasons = specific.length > 0 ? specific : allReasons;

  if (reasons.length > 0) lines.push(`Why it matters: ${tidy(reasons[0])}`);

  lines.push(
    `Net: this is what has moved the story on ${options.symbol} most recently — open a source below before acting on any of it.`,
  );

  // Short briefs happen when only one or two stories cleared the filters.
  // Pad with more grounded context rather than shipping three lines.
  // Only a second *specific* reason earns a line; the classifier's generic
  // fallback would just be filler dressed up as insight.
  if (lines.length < BRIEF_LINES && specific.length > 1) {
    lines.splice(lines.length - 1, 0, `Also worth knowing: ${tidy(specific[1])}`);
  }
  if (lines.length < BRIEF_LINES) {
    lines.splice(
      lines.length - 1,
      0,
      `Everything above cleared the same filters: a credible financial desk, published inside ${options.widened ? "48" : "24"} hours, genuinely about this company, and free to open.`,
    );
  }

  return lines.slice(0, BRIEF_LINES);
}

/* ------------------------------------------------------------------ */
/* Claude                                                              */
/* ------------------------------------------------------------------ */

const SYSTEM_PROMPT = `You write short news briefings for a stock-watching app.

You will be given the two or three most credible news stories about one company from the last day, each with its source, age and summary. Write a briefing a busy investor can read in fifteen seconds.

Rules:
- Exactly ${BRIEF_LINES} lines. One sentence per line. No bullets, numbering, markdown or headings.
- Every fact must come from the supplied stories. Never add a number, name, date or event that is not in them.
- Line 1: what the day's news is about, in one sentence.
- Middle lines: the concrete substance of each story, one story per line, naming the source.
- Second-to-last line: why this matters to someone holding or watching the stock.
- Last line: what to watch next, drawn only from what the stories say.
- Plain English. No hype, no advice to buy or sell, no invented price targets.`;

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

    return lines.length >= 3 ? lines.slice(0, BRIEF_LINES) : null;
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
  const lines = fromClaude ?? compose(items, { ...options, widened });

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
