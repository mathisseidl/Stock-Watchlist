import Anthropic from "@anthropic-ai/sdk";
import { newsBetween } from "./market-data/google-news";
import {
  isTrustedSource,
  newsTopics,
  rankHeadlines,
} from "./market-data/news-curation";
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

export type Description = {
  text: string;
  /** Where the words came from, when they are someone else's. */
  source?: { name: string; url: string };
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
 * listing is dropped rather than paraphrased at the reader. That answer
 * carries its source, because Wikipedia's licence asks to be credited and a
 * reader deserves to know whose sentence they are reading either way.
 */
export async function describeCompany(input: {
  symbol: string;
  name: string;
  industry?: string;
  weburl?: string;
}): Promise<Description | null> {
  const fromClaude = await describeWithClaude(input);
  if (fromClaude) return { text: fromClaude };

  const fromWikipedia = await wikipediaDescription(input.name);
  if (!fromWikipedia) return null;

  return {
    text: fromWikipedia.text,
    source: { name: "Wikipedia", url: fromWikipedia.url },
  };
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
 * A day worth explaining. Below this the move is noise or drift, and a
 * headline set beside it would imply a connection nobody can support.
 */
const NOTABLE_PERCENT = 5;

/** When nothing cleared that bar, the month's biggest day still counts here. */
const WORTH_MENTIONING_PERCENT = 2.5;

/** How many days one paragraph can carry before it stops being readable. */
const MAX_DAYS_EXPLAINED = 2;

/**
 * Every session in the window, with how far it moved from the day before.
 *
 * A month arrives as 15-minute bars, so it is collapsed to one close per
 * calendar day first: an afternoon slide only counts if the day ended there.
 */
function dailyMoves(
  points: CandlePoint[],
): { time: number; changePercent: number }[] {
  const closes = new Map<string, CandlePoint>();
  for (const point of points) {
    closes.set(new Date(point.time * 1000).toISOString().slice(0, 10), point);
  }

  const days = [...closes.values()].sort((a, b) => a.time - b.time);
  const moves: { time: number; changePercent: number }[] = [];

  for (let index = 1; index < days.length; index += 1) {
    const previous = days[index - 1].value;
    if (!previous) continue;
    moves.push({
      time: days[index].time,
      changePercent: ((days[index].value - previous) / previous) * 100,
    });
  }
  return moves;
}

/** The days this explanation should go and read the news for. */
function daysToExplain(
  moves: { time: number; changePercent: number }[],
): { time: number; changePercent: number }[] {
  const bySize = [...moves].sort(
    (a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent),
  );

  const notable = bySize
    .filter((move) => Math.abs(move.changePercent) >= NOTABLE_PERCENT)
    .slice(0, MAX_DAYS_EXPLAINED);

  // Read in the order they happened, whichever set is used.
  if (notable.length > 0) return notable.sort((a, b) => a.time - b.time);

  const biggest = bySize[0];
  return biggest && Math.abs(biggest.changePercent) >= WORTH_MENTIONING_PERCENT
    ? [biggest]
    : [];
}

/**
 * A headline that reports why something happened rather than that it happened:
 * "…tumbles 9% after outlook disappoints", not "…is down today".
 *
 * The cue is the joint — after, as, amid — which is where a news desk puts the
 * cause. Ranked ahead of the rest rather than filtering them out, so a day
 * whose coverage is all bare movement reporting still gets an answer.
 */
const GIVES_A_REASON =
  /\b(after|as|amid|following|on (?:news|reports|fears)|beats|misses|warns|slows|disappoints)\b/i;

/**
 * Which way a headline says the price went, where it says at all.
 *
 * A search around a date returns the days either side of it too, so a story
 * about Thursday's fall can surface next to Wednesday's rally. Quoting one
 * beside the wrong day contradicts the sentence it sits in — "NVIDIA rose 8.6%
 * on 27 August: 'Nvidia Shares Fall 3 Percent'" — which is worse than saying
 * nothing at all, so those are dropped rather than ranked down.
 */
const SAYS_UP =
  /\b(rise|rises|rose|rising|gains?|gained|jumps?|jumped|surges?|surged|soars?|soared|rall(?:y|ies|ied)|climbs?|climbed|higher|pops?|popped|beats?|record high)\b/i;
const SAYS_DOWN =
  /\b(falls?|fell|falling|drops?|dropped|slumps?|slumped|slides?|slid|sinks?|sank|plunges?|plunged|tumbles?|tumbled|lower|crash(?:es|ed)?|slips?|slipped|sells? off|selloff|misses?)\b/i;

function contradicts(headline: string, rose: boolean): boolean {
  const up = SAYS_UP.test(headline);
  const down = SAYS_DOWN.test(headline);
  // Only when it is unambiguous: a headline carrying both is about something
  // more complicated than a direction, and is left to the ranking.
  if (up === down) return false;
  return rose ? down : up;
}

/** The best few stories from the days around one session. */
async function storiesAround(
  input: { symbol: string; name: string; headlines: NewsItem[] },
  time: number,
  rose: boolean,
  wanted: number,
): Promise<NewsItem[]> {
  const day = new Date(time * 1000);
  const from = new Date(day.getTime() - DAY * 1000);
  const to = new Date(day.getTime() + DAY * 1000);

  // The archive first, because it reaches back past the free news tier's week.
  // Its own failures return nothing, and then the app's headlines stand in.
  const archived = await newsBetween(input.name, from, to);
  const pool =
    archived.length > 0
      ? archived
      : input.headlines.filter(
          (item) =>
            item.datetime >= from.getTime() / 1000 &&
            item.datetime <= to.getTime() / 1000,
        );

  const ranked = rankHeadlines(pool, input.symbol, input.name).filter(
    (item) => !contradicts(item.headline, rose),
  );

  // A known desk over an unknown one, always: a web search for a company on a
  // given day surfaces far more republishers than reporters, and the trust
  // table is the only thing separating them.
  const known = ranked.filter((item) => isTrustedSource(item.source));
  const best = known.length > 0 ? known : ranked;

  const sameDay = new Date(time * 1000).toISOString().slice(0, 10);
  const onTheDay = best.filter(
    (item) =>
      new Date(item.datetime * 1000).toISOString().slice(0, 10) === sameDay,
  );
  const ordered = [...onTheDay, ...best.filter((item) => !onTheDay.includes(item))];

  const explaining = ordered.filter((item) => GIVES_A_REASON.test(item.headline));
  if (explaining.length > 0) return explaining.slice(0, wanted);

  // Nothing on the day said why, so quote the best single story and stop. A
  // second one here would only be filler, and two weak headlines read as less
  // trustworthy than one.
  return ordered.slice(0, 1);
}

function quote(stories: NewsItem[]): string {
  return stories
    .map((story) => `"${story.headline}" (${story.source})`)
    .join(", and ");
}

/** One session, said plainly, with the day's reporting behind it. */
function dayLine(
  name: string,
  move: { time: number; changePercent: number },
  stories: NewsItem[],
): string {
  const verb = move.changePercent >= 0 ? "rose" : "fell";
  const size = `${Math.abs(move.changePercent).toFixed(1)}%`;
  const when = dayLabel(move.time);

  return stories.length === 0
    ? `${name} ${verb} ${size} on ${when}, with nothing published that day to account for it.`
    : `${name} ${verb} ${size} on ${when}: ${quote(stories)}.`;
}

/**
 * The explanation, assembled rather than written — what runs when there is no
 * model key.
 *
 * The shape is the reader's own question: which days actually moved this
 * stock, and what was in the news on those days. Everything else it might say
 * — what the month's coverage was "mostly about", how many stories mentioned
 * earnings — is the kind of summary that is true of any month and answers
 * nothing, so it is kept for the case where no day stands out at all.
 *
 * It is careful about the one thing it cannot know. A story published beside a
 * move is *that day's news*, never "the reason": the sentence puts them next
 * to each other and leaves the reader to draw the line, because nothing here
 * can establish cause.
 *
 * The benchmark is what makes this more than a list of days. A reader asking
 * why a stock fell is usually asking whether it was this company or everything
 * at once, and comparing the two answers that outright.
 */
async function composeExplanation(input: {
  symbol: string;
  name: string;
  period: string;
  changePercent: number;
  direction: "up" | "down" | "flat";
  points: CandlePoint[];
  headlines: NewsItem[];
  benchmark?: Benchmark;
}): Promise<string> {
  const sentences: string[] = [];
  const name = spoken(input.name);
  const days = daysToExplain(dailyMoves(input.points));

  if (days.length > 0) {
    // The larger day carries two stories, a second day one — enough to show a
    // month with two separate causes without turning into a list.
    const [first, ...others] = days;
    const lines = await Promise.all([
      storiesAround(input, first.time, first.changePercent >= 0, 2).then(
        (stories) => dayLine(name, first, stories),
      ),
      ...others.map((move) =>
        storiesAround(input, move.time, move.changePercent >= 0, 1).then(
          (stories) => dayLine(name, move, stories),
        ),
      ),
    ]);
    sentences.push(...lines);
  } else {
    sentences.push(
      input.direction === "flat"
        ? `${name} ended ${input.period} close to where it started, with no single session moving it far.`
        : `No single day accounts for this — the move built up gradually across ${input.period}.`,
    );

    // Nothing to point at, so the honest fallback is what the period's news was
    // about at all.
    const topics = newsTopics(input.headlines);
    if (topics.length > 0) {
      sentences.push(
        `Recent coverage has been mostly about ${topics.join(", and ")}.`,
      );
    }
  }

  const benchmark = input.benchmark;
  if (benchmark) {
    const move = Math.abs(input.changePercent);
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
    (await composeExplanation({
      symbol: input.symbol,
      name: input.name,
      period,
      changePercent,
      direction,
      points: input.points ?? [],
      headlines: input.headlines,
      ...(input.benchmark ? { benchmark: input.benchmark } : {}),
    }));

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
