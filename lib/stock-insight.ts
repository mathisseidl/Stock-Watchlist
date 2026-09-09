import Anthropic from "@anthropic-ai/sdk";
import { newsTopics, rankHeadlines } from "./market-data/news-curation";
import { wikipediaDescription } from "./wikipedia";
import type {
  CandlePoint,
  CandleRange,
  MarketDataProvider,
  NewsItem,
  RangeStats,
} from "./market-data/types";

/**
 * The two plain-English answers the stock page offers about a listing: what
 * the company actually does, and why its price moved over the window on
 * screen.
 *
 * Both are free to every reader and both must keep working with no model key
 * configured at all, so each has two writers: Claude when a key is set, and a
 * composer that assembles the same answer from free data when it is not. This
 * is the shape `buildNewsBrief` already uses for the Pro briefings.
 *
 * The composers cost nothing to run. The description falls back to
 * Wikipedia's public API, and the explanation is assembled from prices and
 * headlines the app has already paid nothing for — so an unfunded deployment
 * degrades in prose quality and never in whether the feature answers.
 *
 * The Claude path is written to be cheap in turn: `effort: "low"` and routes
 * that cache the answer rather than asking again per view.
 *
 * `max_tokens` is deliberately generous rather than tight, which looks like
 * the opposite of cheap and is not. Thinking is on by default on this model,
 * and `max_tokens` caps thinking and the reply together — so a ceiling sized
 * to the sentence we want leaves the reply truncated to nothing once thinking
 * has taken its share, and a truncated reply reads here as "no answer" and
 * shows the reader nothing. Cost follows the tokens actually generated, not
 * the ceiling, and both prompts cap their own answer in words.
 *
 * Neither may invent — the description is bounded by what the provider
 * already knows about the company, and the explanation may only cite the
 * headlines it is handed.
 *
 * They differ in what they do when the evidence is thin. The description
 * would rather say nothing than misdescribe a company, so it returns null and
 * the button reports it. The explanation always answers: a reader who asks
 * why a stock moved wants the reading done, so a quiet month gets "no single
 * event drove this, and here is what the news was about" rather than silence.
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

export type ListingFacts = {
  name: string;
  industry?: string;
  weburl?: string;
};

/**
 * What we know about a listing, for either answer to lean on.
 *
 * Finnhub profiles ordinary shares and nothing else: an ETF or an index comes
 * back as `{}`, which used to leave both features asking the model about a
 * bare ticker — and "what is SPY" with no other anchor is exactly the sort of
 * question a model should refuse. The search knows those names perfectly well
 * ("SPDR S&P 500 ETF Trust"), so it is the fallback, and every listing the
 * reader can reach through the search box therefore has a name here.
 */
export async function listingFacts(
  provider: MarketDataProvider,
  symbol: string,
): Promise<ListingFacts> {
  const profile = await provider.getProfile(symbol).catch(() => null);
  if (profile?.name && profile.name !== symbol) {
    return {
      name: profile.name,
      ...(profile.industry ? { industry: profile.industry } : {}),
      ...(profile.weburl ? { weburl: profile.weburl } : {}),
    };
  }

  // Match on the ticker rather than taking the first hit, so a search that
  // ranks something else above the exact listing cannot rename it.
  const hits = await provider.searchSymbols(symbol).catch(() => []);
  const exact = hits.find(
    (hit) => hit.symbol.toUpperCase() === symbol.toUpperCase(),
  );
  if (exact?.description) {
    return { name: exact.description, industry: exact.type };
  }

  return { name: symbol };
}

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

const DESCRIBE_PROMPT = `You explain what a listing is to someone who has never heard of it.

The listing may be a company, a fund, or a market index. Answer the right question for what it is:
- A company: what it sells and who buys it. Lead with the thing a stranger would recognise.
- A fund or ETF: what it holds or tracks, and what owning it gives you exposure to.
- An index: what it measures, and roughly which companies are in it.

Rules:
- Two sentences at most, and under 40 words in total.
- Plain English. No jargon, no marketing language, no "leading provider of".
- State only what you are confident is true of this listing. If you genuinely do not know what it is, reply with exactly: UNKNOWN
- Never mention the price, whether it is a good investment, or any figure you were not given.
- No preamble. Reply with the description alone.`;

/**
 * One or two lines on what a listing is — a company, a fund or an index —
 * or null when there is nothing trustworthy to say.
 *
 * The name, industry and website come from `listingFacts` and are passed in
 * as anchors: they keep the answer on the right listing where a ticker is
 * ambiguous, and the model is told to refuse rather than guess.
 *
 * With no key, or when the model declines, Wikipedia answers instead — and it
 * is held to the same standard: an article that does not confidently name this
 * listing is dropped rather than paraphrased at the reader.
 */
export async function describeCompany(input: {
  symbol: string;
  name: string;
  industry?: string;
  weburl?: string;
}): Promise<string | null> {
  return (await describeWithClaude(input)) ?? wikipediaDescription(input.name);
}

async function describeWithClaude(input: {
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
    input.industry ? `Type or industry (per data provider): ${input.industry}` : null,
    input.weburl ? `Website: ${input.weburl}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const response = await anthropic.messages.create({
      model: "claude-opus-5",
      max_tokens: 1500,
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

const WHY_PROMPT = `You explain, in plain English, why a stock moved over a period.

You are given the size of the move and the headlines published during that period. Always give the reader an answer — they asked you to do the reading for them, so never refuse and never reply with a placeholder.

Rules:
- Lead with the single biggest driver you can actually see in the headlines. Two to three sentences, under 60 words.
- Ground every claim in the supplied headlines. Never introduce an event, number, date or name that is not in them.
- When no one story accounts for a move this size, say so plainly and then say what the period's news was actually about — that is the honest answer, and it is still an answer. Phrase it like "No single event drove this. The month's news was mostly X, so the move looks like it tracked the wider market."
- A move can be about the whole market rather than the company (rates, oil, a selloff, a rotation). Say so when the headlines point that way.
- Never say "the headlines provided", "the supplied articles", or otherwise mention that you were given anything. Write as though you did the reading.
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
  /** Whether Claude wrote the prose or the built-in composer did. */
  writtenBy: "claude" | "composer";
};

/** How a benchmark did over the same window, for market-wide moves. */
export type Benchmark = {
  /** What to call it in a sentence, e.g. "the S&P 500". */
  name: string;
  changePercent: number;
};

function percent(value: number): string {
  return `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(1)}%`;
}

const DAY = 24 * 60 * 60;

/**
 * A listing's name as you would say it out loud: the legal suffix a data
 * provider carries ("Apple Inc", "NVIDIA Corp") reads as clutter mid-sentence.
 */
function spoken(name: string): string {
  // Repeatedly, because they stack: "ExxonMobil Holdings Corporation".
  const SUFFIX =
    /[,\s]+(inc|incorporated|corp|corporation|co|company|ltd|limited|plc|llc|lp|nv|sa|ag|se|holdings?|group|class [abc])\.?$/i;

  let trimmed = name.trim();
  while (SUFFIX.test(trimmed)) {
    const shorter = trimmed.replace(SUFFIX, "").trim();
    if (!shorter) break;
    trimmed = shorter;
  }
  return trimmed || name;
}

/** "Tesla's", but "Meta Platforms'". */
function possessive(name: string): string {
  return /s$/i.test(name) ? `${name}'` : `${name}'s`;
}

/** "12 August", so the day reads as a date rather than a timestamp. */
function dayLabel(seconds: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(seconds * 1000));
}

/**
 * The single sharpest session inside the window, from the intraday points the
 * chart is already drawn from.
 *
 * A month of 15-minute bars is collapsed to one close per calendar day first,
 * because the question is which *day* moved the stock — an afternoon slide is
 * only news if the day ended there.
 */
function sharpestDay(
  points: CandlePoint[],
): { time: number; changePercent: number } | null {
  const closes = new Map<string, CandlePoint>();
  for (const point of points) {
    const day = new Date(point.time * 1000).toISOString().slice(0, 10);
    closes.set(day, point);
  }

  const days = [...closes.values()].sort((a, b) => a.time - b.time);
  if (days.length < 3) return null;

  let sharpest: { time: number; changePercent: number } | null = null;
  for (let index = 1; index < days.length; index += 1) {
    const previous = days[index - 1].value;
    if (!previous) continue;
    const changePercent = ((days[index].value - previous) / previous) * 100;
    if (
      !sharpest ||
      Math.abs(changePercent) > Math.abs(sharpest.changePercent)
    ) {
      sharpest = { time: days[index].time, changePercent };
    }
  }
  return sharpest;
}

/**
 * How far back the headlines we were handed actually reach, in words.
 *
 * The free news tier serves about a week however wide a window is asked for,
 * so a sentence saying "coverage over the past month" would routinely
 * describe seven days of it. The answer says what it can see instead.
 */
function coverageWords(headlines: NewsItem[], fallback: string): string {
  if (headlines.length === 0) return fallback;

  const oldest = Math.min(...headlines.map((item) => item.datetime));
  const days = (Date.now() / 1000 - oldest) / DAY;

  if (days <= 3) return "the last few days";
  if (days <= 10) return "the past week";
  if (days <= 45) return "the past month";
  return fallback;
}

/** Whether the headlines reach back to a given day at all. */
function coverageReaches(headlines: NewsItem[], time: number): boolean {
  if (headlines.length === 0) return false;
  return Math.min(...headlines.map((item) => item.datetime)) <= time + DAY;
}

/** The story most likely to be the one behind a given day. */
function headlineNear(
  headlines: NewsItem[],
  time: number,
  symbol: string,
  name: string,
): NewsItem | null {
  // The day itself and the one before it: a story that breaks after the close
  // or overnight is priced into the session that follows, not the one it was
  // published in.
  const window = headlines.filter(
    (item) => item.datetime >= time - DAY && item.datetime <= time + DAY,
  );
  return rankHeadlines(window, symbol, name)[0] ?? null;
}

/**
 * The explanation, assembled rather than written — what runs when there is no
 * model key.
 *
 * It says only what the numbers and the headlines actually show, and it is
 * careful about the difference between the two: the sharpest day is a fact,
 * and the story published alongside it is *what the news was that day*, never
 * "the reason", because nothing here can establish that it caused anything.
 *
 * The benchmark is what makes this genuinely useful rather than a list of
 * facts. A reader asking why a stock fell is usually asking whether it was
 * this company or everything at once, and comparing the two answers that
 * outright — something the model cannot do, since it only ever sees
 * headlines.
 */
function composeExplanation(input: {
  symbol: string;
  name: string;
  period: string;
  changePercent: number;
  direction: "up" | "down" | "flat";
  points: CandlePoint[];
  headlines: NewsItem[];
  benchmark?: Benchmark;
}): string {
  const sentences: string[] = [];
  const name = spoken(input.name);
  const move = Math.abs(input.changePercent);
  const sharpest = sharpestDay(input.points);

  // Worth singling out only when the day carried a real share of the window's
  // move; otherwise the price drifted and no one session explains it.
  const standsOut =
    sharpest !== null &&
    (Math.abs(sharpest.changePercent) >= 2 ||
      Math.abs(sharpest.changePercent) >= move * 0.5);

  if (sharpest && standsOut) {
    const story = headlineNear(
      input.headlines,
      sharpest.time,
      input.symbol,
      input.name,
    );
    const day = `${percent(sharpest.changePercent)} on ${dayLabel(sharpest.time)}`;
    sentences.push(
      story
        ? `The sharpest single day was ${day}, and that day's news was "${story.headline}" (${story.source}).`
        : coverageReaches(input.headlines, sharpest.time)
          ? `The sharpest single day was ${day}, with no company news published around it.`
          : `The sharpest single day was ${day}, which is further back than the news here reaches.`,
    );
  } else if (input.direction === "flat") {
    sentences.push(
      `${name} ended ${input.period} close to where it started, with no single session moving it far.`,
    );
  } else {
    sentences.push(
      `No single day accounts for this — the move built up gradually across ${input.period}.`,
    );
  }

  const topics = newsTopics(input.headlines);
  if (topics.length > 0) {
    const covered = coverageWords(input.headlines, input.period);
    sentences.push(
      `Coverage over ${covered} was mostly about ${topics.join(", and ")}.`,
    );
  } else if (input.headlines.length === 0) {
    sentences.push(
      `No company news was published over ${input.period}, so nothing ${name} announced accounts for it.`,
    );
  }

  const benchmark = input.benchmark;
  if (benchmark) {
    const sameWay =
      Math.sign(benchmark.changePercent) === Math.sign(input.changePercent);
    const marketMove = Math.abs(benchmark.changePercent);
    // Half the move or more coming from the index is the point at which this
    // stops being a story about the company at all.
    const marketDriven = sameWay && marketMove >= move * 0.5;

    sentences.push(
      marketDriven
        ? `${benchmark.name} was ${percent(benchmark.changePercent)} over the same stretch, so much of this was the wider market rather than ${name} itself.`
        : `${benchmark.name} was ${percent(benchmark.changePercent)} over the same stretch, so this was mostly ${possessive(name)} own move.`,
    );
  }

  return sentences.join(" ");
}

/**
 * Why a listing moved across the visible window.
 *
 * Always answers, because the reader asked for the reading to be done for
 * them rather than to be told it was inconclusive. That is not a licence to
 * invent: a quiet month gets "no single event drove this, here is what the
 * news was about", which is both an answer and true.
 *
 * Claude writes it where a key is configured; otherwise, and whenever the
 * model call fails, the composer above answers from the same prices and
 * headlines. Null is left for the one case neither can speak to — a window
 * with no prices in it at all.
 */
export async function explainMove(input: {
  symbol: string;
  name: string;
  range: CandleRange;
  stats?: RangeStats;
  price: number;
  previousClose: number;
  points?: CandlePoint[];
  headlines: NewsItem[];
  benchmark?: Benchmark;
}): Promise<MoveExplanation | null> {
  // The window's own open, not yesterday's close: over a month the reader is
  // asking about the whole span on the chart, not the last session.
  const open = input.stats?.open ?? input.previousClose;
  const close = input.stats?.close ?? input.price;
  if (!open || !close) return null;

  const changePercent = ((close - open) / open) * 100;
  const direction =
    Math.abs(changePercent) < 0.5 ? "flat" : changePercent > 0 ? "up" : "down";
  const period = RANGE_WORDS[input.range];

  const fromClaude = await explainWithClaude({
    ...input,
    changePercent,
    period,
  });

  const reason =
    fromClaude ??
    composeExplanation({
      symbol: input.symbol,
      name: input.name,
      period,
      changePercent,
      direction,
      points: input.points ?? [],
      headlines: input.headlines,
      ...(input.benchmark ? { benchmark: input.benchmark } : {}),
    });

  return {
    reason,
    direction,
    changePercent,
    period,
    writtenBy: fromClaude ? "claude" : "composer",
  };
}

async function explainWithClaude(input: {
  symbol: string;
  name: string;
  stats?: RangeStats;
  headlines: NewsItem[];
  changePercent: number;
  period: string;
}): Promise<string | null> {
  const anthropic = client();
  // Nothing published all period leaves the model nothing to read, and the
  // composer says so plainly without a call.
  if (!anthropic || input.headlines.length === 0) return null;

  const articles = input.headlines
    .slice(0, 60)
    .map((item) => {
      const day = new Date(item.datetime * 1000).toISOString().slice(0, 10);
      return `- [${day}] ${item.source}: ${item.headline}`;
    })
    .join("\n");

  try {
    const response = await anthropic.messages.create({
      model: "claude-opus-5",
      max_tokens: 2000,
      output_config: { effort: "low" },
      system: WHY_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            `Company: ${input.name} (${input.symbol})`,
            `Period: ${input.period}`,
            `Move over the period: ${input.changePercent >= 0 ? "+" : ""}${input.changePercent.toFixed(1)}%`,
            `Range high/low: ${input.stats ? `${input.stats.high} / ${input.stats.low}` : "not available"}`,
            "",
            `Headlines published during the period (newest first):`,
            articles,
          ].join("\n"),
        },
      ],
    });

    return oneParagraph(textOf(response)) || null;
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
