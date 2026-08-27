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
const REASON_RULES: { test: RegExp; reason: (symbol: string) => string }[] = [
  {
    test: /\bearnings\b|quarterly results|\bq[1-4]\b|\brevenues?\b|\bprofits?\b|\beps\b|\bguidance\b|\bforecasts?\b|\boutlook\b/,
    reason: (symbol) => `Earnings and guidance move ${symbol} more than anything else.`,
  },
  {
    test: /\bupgrades?\b|\bdowngrades?\b|price target|\banalysts?\b|\bratings?\b|initiated coverage|\boverweight\b|\bunderweight\b/,
    reason: (symbol) => `Analysts have just changed their price targets on ${symbol}.`,
  },
  {
    test: /\bacquisitions?\b|\bacquires?\b|\bmergers?\b|\bbuyout\b|\btakeover\b|\bstake\b|\bdivest\w*|\bspin-?offs?\b/,
    reason: () => `A deal like this changes what you own as a shareholder.`,
  },
  {
    test: /\blawsuits?\b|\bsued\b|\binvestigation\b|\bprobe\b|\bantitrust\b|\bregulators?\b|\bfines?\b|\bsettlement\b|\brecall\b/,
    reason: () => `A legal or regulatory risk that can hang over the stock.`,
  },
  {
    test: /\blaunch\w*|\bunveil\w*|new product|\bpartnerships?\b|\bcontracts?\b|\bchips?\b|data center|\bexpansion\b|\bevent\b/,
    reason: () => `Product news is the clearest sign of where growth comes from next.`,
  },
  {
    // Only an actual transition counts — a quote from the sitting CEO is not
    // a leadership change.
    test: /\b(new|incoming|outgoing|former|next|interim) (ceo|cfo|chief executive)\b|\b(ceo|cfo|chief executive)\b[^.]{0,40}\b(steps? down|resign\w*|depart\w*|succeed\w*|appointed|to retire)\b|\bnames?\b[^.]{0,30}\b(ceo|cfo)\b/,
    reason: () => `A change at the top usually means a change in strategy.`,
  },
  {
    test: /\bdividends?\b|\bbuybacks?\b|\brepurchase\w*|stock split|\bpayouts?\b/,
    reason: () => `This affects what shareholders actually get paid.`,
  },
  {
    test: /\blayoffs?\b|job cuts|restructur\w*|cost cutting|plant closure/,
    reason: () => `Cost cuts feed straight into future profit margins.`,
  },
  {
    test: /\bsurge\w*|\bsoar\w*|\bplunge\w*|\btumbl\w*|\bslides?\b|\brall(y|ies|ied)\b|\bjumps?\b|\bsinks?\b|\bslump\w*|record high|\bsell-?off\b/,
    reason: () => `Explains the story behind the recent price swing.`,
  },
  {
    test: /\binflation\b|\bfed\b|interest rates?|\btariffs?\b|\brecession\b|jobs report|\btreasury\b/,
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
