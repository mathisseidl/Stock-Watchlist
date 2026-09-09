import type { NewsItem } from "./types";

/**
 * Stories older than this are dropped outright — the app only ever shows news
 * that is still actionable.
 */
export const MAX_NEWS_AGE_HOURS = 48;

/** How many curated stories we surface per symbol. */
export const NEWS_LIMIT = 3;

/**
 * Editorial trust tiers. Higher = more reliable financial desk. Sources not
 * listed here still qualify, they just start from a lower base.
 */
const SOURCE_TRUST: { match: string; score: number }[] = [
  { match: "reuters", score: 40 },
  { match: "associated press", score: 40 },
  { match: "ap news", score: 40 },
  { match: "cnbc", score: 36 },
  { match: "marketwatch", score: 34 },
  { match: "yahoo", score: 30 },
  { match: "investing.com", score: 28 },
  { match: "forbes", score: 28 },
  { match: "business insider", score: 26 },
  { match: "investopedia", score: 26 },
  { match: "cnn", score: 26 },
  { match: "npr", score: 24 },
  { match: "nbc", score: 24 },
  { match: "cbs", score: 24 },
  { match: "abc news", score: 24 },
  { match: "guardian", score: 24 },
  { match: "techcrunch", score: 22 },
  { match: "the verge", score: 22 },
  { match: "ars technica", score: 22 },
  { match: "engadget", score: 20 },
  { match: "zacks", score: 20 },
  { match: "benzinga", score: 18 },
  { match: "globe newswire", score: 16 },
  { match: "pr newswire", score: 16 },
  { match: "business wire", score: 16 },
];

/**
 * Sources that put market coverage behind a hard or metered paywall a
 * first-time visitor will hit. The brief is news the reader can actually open
 * for free, so these are excluded rather than down-ranked.
 */
const PAYWALLED_SOURCES = [
  "wall street journal",
  "wsj",
  "financial times",
  "bloomberg",
  "barron",
  "the information",
  "economist",
  "new york times",
  "nytimes",
  "washington post",
  "seeking alpha",
  "morningstar",
  "telegraph",
  "los angeles times",
  "insider monkey",
];

/**
 * Low-signal headline shapes: listicles, and the auto-generated "comparative
 * study" filler some wires publish daily against every ticker.
 */
const CLICKBAIT_PATTERNS = [
  /^\d+\s+(top|best|great|reasons|stocks)/i,
  /you (should|need to) know/i,
  /this (one )?stock/i,
  /millionaire/i,
  /motley fool/i,
  /^(comparative study|a closer look at|insights into|understanding|market signals|demystifying)/i,
  /industry competitors/i,
  /price over earnings overview/i,
  /\bstocks? to (buy|watch) (now|today)\b/i,
];

/**
 * Outlets that republish, aggregate or auto-generate rather than report. A web
 * search for a company on any given day returns more of these than of the
 * desks that broke the story, and quoting one at a reader is worse than
 * quoting nothing.
 */
const LOW_VALUE_SOURCES = [
  "marketbeat",
  "kalkine",
  "tipranks",
  "defense world",
  "defenseworld",
  "etf daily news",
  "american banking news",
  "ad hoc news",
  "quiver",
  "stocktwits",
  "newser",
  "invezz",
  "simply wall st",
  "simplywall",
  "gurufocus",
  "zolmax",
  "modern readers",
  "the cerbat gem",
  "ticker report",
  "mayfield recorder",
];

/**
 * Filings churn: "Fund X Cuts Position in Y", "Shares Sold by Z". Thousands
 * are generated from 13F filings every quarter, they mention the company in
 * the headline, and not one of them explains why a share price moved.
 */
const FILINGS_CHURN =
  /\b(cuts?|trims?|lowers?|raises?|boosts?|lifts?|buys?|sells?|acquires?|takes?|grows?|reduces?)\b[^.]{0,40}\b(position|stake|holdings?|shares)\b|\bshares? (sold|bought|purchased|acquired) by\b|\bposition (in|of)\b[^.]{0,30}\bby\b|\b13[fF]\b|\bshort interest\b|\bhas \$[\d.]+ (million|billion) (position|stake|holdings)\b/;

/**
 * Copy that names a company without reporting anything about it: the five-
 * ticker roundup, the "if you had invested $1,000 at the IPO" perennial, the
 * congressional-trade filler. They rank respectably — real outlets publish
 * them, and the company is right there in the headline — and not one is an
 * answer to why a share price moved on a given day.
 */
const FILLER_PATTERNS = [
  /\b\d+\s+(trending|top|best|hot|popular|hottest)\s+stocks?\b/i,
  /stocks?\s+(are|is)\s+on\s+(investors'?|traders'?)\s+radars?/i,
  /^(?:[A-Z]{1,5},\s*){2,}[A-Z]{1,5}\b/,
  /\bif you (had )?invested\b/i,
  /here'?s how much you'?d have/i,
  /\b(congressman|congresswoman|senator|lawmakers?|pelosi)\b/i,
  /\bstocks? to watch\b/i,
  /\b(pre-?market|after-?hours) movers\b/i,
];

/**
 * Pundit commentary ("X Says…", "Y Predicts…"). Still readable, just ranked
 * below actual reporting rather than excluded.
 */
const OPINION_PATTERNS = [
  /\b(says|said|claims|predicts|warns|thinks|believes)\b/i,
  /\b(opinion|commentary|analysis:|why i|here'?s why you)\b/i,
];

const STOPWORDS = new Set([
  "inc",
  "corp",
  "corporation",
  "company",
  "co",
  "ltd",
  "plc",
  "the",
  "group",
  "holdings",
  "class",
  "common",
  "stock",
  "sa",
  "nv",
  "ag",
]);

function normalize(value: string): string {
  return value.toLowerCase().trim();
}

function trustScore(source: string): number {
  const normalized = normalize(source);
  const tier = SOURCE_TRUST.find((entry) => normalized.includes(entry.match));
  return tier ? tier.score : 12;
}

/** Whether this outlet is one the trust table actually knows. */
export function isTrustedSource(source: string): boolean {
  return trustScore(source) > 12;
}

function isLowValue(item: NewsItem): boolean {
  const source = normalize(item.source);
  return (
    LOW_VALUE_SOURCES.some((blocked) => source.includes(blocked)) ||
    FILINGS_CHURN.test(item.headline) ||
    FILLER_PATTERNS.some((pattern) => pattern.test(item.headline))
  );
}

function isPaywalled(source: string, url: string): boolean {
  const haystack = `${normalize(source)} ${normalize(url)}`;
  return PAYWALLED_SOURCES.some(
    (blocked) =>
      haystack.includes(blocked) ||
      haystack.includes(blocked.replace(/\s+/g, "")),
  );
}

/** Meaningful words from a company name, e.g. "Apple Inc" -> ["apple"]. */
function companyTokens(companyName: string | undefined): string[] {
  if (!companyName) return [];
  return companyName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

function relevanceScore(
  item: NewsItem,
  symbol: string,
  tokens: string[],
): number {
  const headline = normalize(item.headline);
  const summary = normalize(item.summary ?? "");
  const symbolPattern = new RegExp(`\\b${symbol.toLowerCase()}\\b`);

  let score = 0;
  if (symbolPattern.test(headline)) score += 20;
  else if (symbolPattern.test(summary)) score += 8;

  if (tokens.some((token) => headline.includes(token))) score += 18;
  else if (tokens.some((token) => summary.includes(token))) score += 6;

  return score;
}

function recencyScore(datetimeSeconds: number, nowSeconds: number): number {
  const ageHours = (nowSeconds - datetimeSeconds) / 3600;
  const freshness = 1 - ageHours / MAX_NEWS_AGE_HOURS;
  return Math.round(Math.max(0, Math.min(1, freshness)) * 20);
}

/**
 * Ordered most- to least-specific: the first rule that matches wins. Every
 * keyword is word-bounded, otherwise "operating" reads as an analyst "rating"
 * and "aim" as "AI".
 */
const REASON_RULES: {
  test: RegExp;
  reason: (symbol: string) => string;
  /** How a month of this kind of story reads in a sentence. */
  topic: string;
}[] = [
  {
    test: /\bearnings\b|quarterly results|\bq[1-4]\b|\brevenues?\b|\bprofits?\b|\beps\b|\bguidance\b|\bforecasts?\b|\boutlook\b/,
    topic: "earnings and guidance",
    reason: (symbol) => `Earnings and guidance move ${symbol} more than anything else.`,
  },
  {
    test: /\bupgrades?\b|\bdowngrades?\b|price target|\banalysts?\b|\bratings?\b|initiated coverage|\boverweight\b|\bunderweight\b/,
    topic: "analyst ratings",
    reason: (symbol) => `Analysts have just changed their price targets on ${symbol}.`,
  },
  {
    test: /\bacquisitions?\b|\bacquires?\b|\bmergers?\b|\bbuyout\b|\btakeover\b|\bstake\b|\bdivest\w*|\bspin-?offs?\b/,
    topic: "deals and acquisitions",
    reason: () => `A deal like this changes what you own as a shareholder.`,
  },
  {
    test: /\blawsuits?\b|\bsued\b|\binvestigation\b|\bprobe\b|\bantitrust\b|\bregulators?\b|\bfines?\b|\bsettlement\b|\brecall\b/,
    topic: "legal and regulatory pressure",
    reason: () => `A legal or regulatory risk that can hang over the stock.`,
  },
  {
    test: /\blaunch\w*|\bunveil\w*|new product|\bpartnerships?\b|\bcontracts?\b|\bchips?\b|data center|\bexpansion\b|\bevent\b/,
    topic: "products and contracts",
    reason: () => `Product news is the clearest sign of where growth comes from next.`,
  },
  {
    // Only an actual transition counts — a quote from the sitting CEO is not
    // a leadership change.
    test: /\b(new|incoming|outgoing|former|next|interim) (ceo|cfo|chief executive)\b|\b(ceo|cfo|chief executive)\b[^.]{0,40}\b(steps? down|resign\w*|depart\w*|succeed\w*|appointed|to retire)\b|\bnames?\b[^.]{0,30}\b(ceo|cfo)\b/,
    topic: "changes in leadership",
    reason: () => `A change at the top usually means a change in strategy.`,
  },
  {
    test: /\bdividends?\b|\bbuybacks?\b|\brepurchase\w*|stock split|\bpayouts?\b/,
    topic: "dividends and buybacks",
    reason: () => `This affects what shareholders actually get paid.`,
  },
  {
    test: /\blayoffs?\b|job cuts|restructur\w*|cost cutting|plant closure/,
    topic: "cost cuts and job losses",
    reason: () => `Cost cuts feed straight into future profit margins.`,
  },
  {
    test: /\bsurge\w*|\bsoar\w*|\bplunge\w*|\btumbl\w*|\bslides?\b|\brall(y|ies|ied)\b|\bjumps?\b|\bsinks?\b|\bslump\w*|record high|\bsell-?off\b/,
    topic: "the stock's own swings",
    reason: () => `Explains the story behind the recent price swing.`,
  },
  {
    test: /\binflation\b|\bfed\b|interest rates?|\btariffs?\b|\brecession\b|jobs report|\btreasury\b/,
    topic: "rates, inflation and tariffs",
    reason: (symbol) => `Wider market forces that move the whole sector ${symbol} trades in.`,
  },
];

function matchRule(text: string) {
  return REASON_RULES.find((rule) => rule.test.test(text));
}

/**
 * One short sentence on why a story is worth the reader's time, derived from
 * what the story is actually about so the line is specific rather than filler.
 * The headline is classified on its own first — it states the subject, whereas
 * a summary drags in incidental words that misfile the story.
 */
export function reasonForNews(item: NewsItem, symbol: string): string {
  const headline = item.headline.toLowerCase();
  const hit =
    matchRule(headline) ??
    matchRule(`${headline} ${(item.summary ?? "").toLowerCase()}`);
  if (hit) return hit.reason(symbol);
  return `Recent background on where ${symbol} stands right now.`;
}

/**
 * Filters raw provider news down to the few stories worth reading: published
 * in the last 48 hours, free to open, from a credible desk, and genuinely
 * about this company.
 */
export function curateNews(
  items: NewsItem[],
  options: { symbol: string; companyName?: string; now?: Date },
): NewsItem[] {
  const nowSeconds = Math.floor((options.now ?? new Date()).getTime() / 1000);
  const cutoff = nowSeconds - MAX_NEWS_AGE_HOURS * 3600;
  const tokens = companyTokens(options.companyName);
  const seen = new Set<string>();

  return items
    .filter((item) => Boolean(item.headline && item.url))
    // Hard 48h window, and nothing timestamped in the future.
    .filter(
      (item) => item.datetime >= cutoff && item.datetime <= nowSeconds + 3600,
    )
    .filter((item) => !isPaywalled(item.source, item.url))
    .filter((item) => {
      const key = normalize(item.headline).replace(/[^a-z0-9]/g, "");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((item) => {
      const clickbait = CLICKBAIT_PATTERNS.some((pattern) =>
        pattern.test(item.headline),
      );
      const opinion = OPINION_PATTERNS.some((pattern) =>
        pattern.test(item.headline),
      );
      const score =
        trustScore(item.source) +
        relevanceScore(item, options.symbol, tokens) +
        recencyScore(item.datetime, nowSeconds) +
        ((item.summary?.length ?? 0) >= 120 ? 10 : 0) -
        (clickbait ? 25 : 0) -
        (opinion ? 12 : 0);
      return { item, score };
    })
    .sort((a, b) => b.score - a.score || b.item.datetime - a.item.datetime)
    .slice(0, NEWS_LIMIT)
    .map(({ item }) => ({
      ...item,
      reason: reasonForNews(item, options.symbol),
    }));
}

/**
 * What a stretch of coverage was mostly about, most common first — "earnings
 * and guidance", "rates, inflation and tariffs". Classified off the same rules
 * that explain why a single story is worth reading, so the two never disagree
 * about what a headline is.
 *
 * Headlines that match no rule are simply not counted; they are the ones with
 * nothing specific to say, and naming them would pad the answer with noise.
 */
export function newsTopics(items: NewsItem[], limit = 2): string[] {
  const counts = new Map<string, number>();

  for (const item of items) {
    const hit = matchRule(normalize(item.headline));
    if (!hit) continue;
    counts.set(hit.topic, (counts.get(hit.topic) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([topic]) => topic);
}

/**
 * Headlines ordered by how much weight to give them: a credible desk, and
 * genuinely about this company rather than mentioning it in passing.
 *
 * Unlike `curateNews` this applies no freshness window, because the caller is
 * reading a whole month rather than today — but it drops paywalled stories the
 * same way, since a source the reader cannot open cannot be quoted at them.
 * Aggregators and filings churn are dropped outright, and the headlines that
 * report nothing are pushed down.
 */
export function rankHeadlines(
  items: NewsItem[],
  symbol: string,
  companyName?: string,
): NewsItem[] {
  const tokens = companyTokens(companyName);

  return items
    .filter((item) => !isPaywalled(item.source, item.url) && !isLowValue(item))
    .map((item) => {
      const clickbait = CLICKBAIT_PATTERNS.some((pattern) =>
        pattern.test(item.headline),
      );
      const opinion = OPINION_PATTERNS.some((pattern) =>
        pattern.test(item.headline),
      );
      // A headline that asks a question reports nothing. It is fine to read
      // and useless as an answer to "what happened that day".
      const speculation = /\?\s*$/.test(item.headline);

      return {
        item,
        score:
          trustScore(item.source) +
          relevanceScore(item, symbol, tokens) -
          (clickbait ? 25 : 0) -
          (opinion ? 12 : 0) -
          (speculation ? 15 : 0),
      };
    })
    .sort((a, b) => b.score - a.score || b.item.datetime - a.item.datetime)
    .map((entry) => entry.item);
}
