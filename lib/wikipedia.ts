/**
 * Plain-English descriptions of a listing, straight from Wikipedia.
 *
 * This is what "What does it do?" falls back to when no model key is set, and
 * it costs nothing: Wikipedia's API is public, unmetered and needs no account.
 * The trade is that it can only describe listings someone has already written
 * an article about — which, for anything the search box surfaces, is very
 * nearly all of them, funds and indices included.
 *
 * Two sentences are taken, and which two is the whole problem. An article's
 * opening sentence says what a company *is* ("an American multinational
 * technology company") and almost never what it sells; the sentence that
 * answers "what does it do" sits further down the introduction, past the
 * founding date and the market-cap rankings. So the introduction is read in
 * full and the descriptive sentence picked out of it, rather than taking the
 * first two and hoping.
 *
 * Wikipedia's text is licensed CC BY-SA, which asks that it be credited where
 * it is shown. The article it came from is returned alongside the sentences so
 * the page can link it.
 *
 * Wikipedia asks that callers identify themselves, hence the User-Agent, and
 * rate-limits bursts from one address. A refusal therefore raises rather than
 * returning null, so the route reports a temporary failure instead of caching
 * "no description" against that ticker for a week.
 */

const SEARCH_URL = "https://en.wikipedia.org/w/rest.php/v1/search/page";
const API_URL = "https://en.wikipedia.org/w/api.php";
const USER_AGENT = "matmaxapp.com stock watchlist (+https://matmaxapp.com)";
const WEEK = 604_800;

/** At most this many words, so the answer stays the few lines the UI expects. */
const MAX_WORDS = 60;

/**
 * Words that say nothing about which company this is. Dropped before matching
 * a listing's name against an article title, so "NVIDIA Corporation" still
 * recognises the article titled "Nvidia".
 */
const GENERIC_NAME_WORDS = new Set([
  "inc",
  "incorporated",
  "corp",
  "corporation",
  "co",
  "company",
  "companies",
  "ltd",
  "limited",
  "plc",
  "llc",
  "lp",
  "nv",
  "sa",
  "ag",
  "se",
  "ab",
  "as",
  "holding",
  "holdings",
  "group",
  "the",
  "and",
  "class",
  "common",
  "stock",
  "shares",
  "ordinary",
  "adr",
  "a",
  "b",
  "c",
]);

/**
 * A last check that the article is about a traded thing rather than something
 * that merely shares its name — the article for "Block" the basketball move
 * would pass a name match and describe the wrong subject entirely.
 */
const IS_A_LISTING =
  /\b(compan|corporat|business|firm|manufactur|retail|bank|insur|brand|conglomerat|fund|etf|exchange-traded|index|indices|trust|holdings?|multinational|enterprise|subsidiar|chain|airline|carrier|operator|producer|supplier|developer|platform|studio|publisher|services?\b|provider|network|utility|telecom)/i;

/**
 * A sentence that says what the company actually does. Weighted by how many of
 * these it hits, so "its product lineup includes…" beats a passing "operates".
 */
const DESCRIBES_THE_BUSINESS =
  /product (lineup|line|lines|range|portfolio)|products? include|best known for|known for its|brands? include|services include|portfolio (of|includes)|subsidiaries include|\b(sells|makes|manufactures|produces|operates|offers|provides|designs|develops|distributes|owns|facilitates|processes|publishes|licenses|refines|mines|builds|runs|supplies|serves|invests)\b/gi;

/**
 * Sentences that are about the company's history, its share listing or its
 * size. All true, none of them an answer to "what does it do", and they are
 * what fills the middle of an article's introduction.
 */
const NOT_WHAT_IT_DOES =
  /\bfound(ed|er|ers)\b|\bin (18|19|20)\d\d\b|\bacquired\b|\bmerged\b|\bincorporated\b|\brenamed\b|market capitalization|fortune \d|largest .{0,30}by revenue|\bemployees\b|\brevenue of\b|listed on|S&P 500|Dow Jones|\bIPO\b|\bshares\b|\bCEO\b|is headquartered|\boffices\b|\boperations in\b|\bdoes not\b|\bis not\b|\bno longer\b/i;

/**
 * Pronunciation guides: "( TEZ-lə or TESS-lə)", "(/ɛnˈvɪdiə/)", or the empty
 * brackets left where the plain-text export dropped one. They sit in the
 * opening sentence of most articles and read as noise in a stock app.
 *
 * Matched on the phonetic characters rather than the shape, so ordinary
 * parentheses — "(BEVs)", "(also called supercenters)" — survive.
 */
const PRONUNCIATION = /\s*\(\s*(?:[^)]*[ˈˌːəɪɛɒɑʊʃθðæŋ/][^)]*)?\s*\)/g;

/**
 * The same thing written for English speakers rather than in IPA: "( BO-ing)",
 * "(KAT-er-pil-ar)". Recognised by the shouted syllable and its hyphen, which
 * ordinary asides — "(often shortened to CAT)", "(BEVs)" — do not have.
 */
const RESPELLING = /\s*\([^)]*\b[A-Z]{2,}-[a-z][^)]*\)/g;

type SearchPage = { title: string; description?: string | null };
type ExtractPage = {
  extract?: string;
  pageprops?: Record<string, unknown>;
};

function tokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((word) => word.length > 1 && !GENERIC_NAME_WORDS.has(word));
}

/**
 * Whether an article title plausibly names this listing.
 *
 * Either the listing's leading word appears in the title (the usual case:
 * "Apple Inc" -> "Apple Inc."), or two other words do, which covers the funds
 * whose first word is a sponsor the article omits.
 */
function namesTheSameThing(articleTitle: string, listingName: string): boolean {
  const wanted = tokens(listingName);
  if (wanted.length === 0) return false;

  const found = new Set(tokens(articleTitle));
  const shared = wanted.filter((word) => found.has(word));

  return shared.includes(wanted[0]) || shared.length >= 2;
}

/**
 * Whole sentences, with the pronunciation guides taken out first — left in,
 * they split the opening line in two at the bracket.
 */
function sentences(text: string): string[] {
  return text
    .replace(PRONUNCIATION, "")
    .replace(RESPELLING, "")
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"])/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 12);
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Where an opening sentence stops saying what a company is and starts on
 * where it was founded, who founded it and which building it sits in. Netflix
 * opens with sixty words of exactly that.
 */
const OPENING_TAIL =
  /\s+(?:founded|established|incorporated|headquartered|based|formerly|and currently|which)\b/i;

/**
 * Bracketed asides that exist for a reader of the encyclopaedia rather than a
 * reader of a stock app: "(NYSE Arca: SPY)", "(full fund name Invesco QQQ
 * Trust, Series 1)". Short ones stay — "(BEVs)" and "(often shortened to CAT)"
 * are doing work.
 */
function stripAsides(text: string): string {
  return text
    .replace(/\s*\(([^)]*)\)/g, (whole, inside: string) =>
      inside.includes(":") || wordCount(inside) > 6 ? "" : whole,
    )
    .replace(/\s+([.,])/g, "$1");
}

/**
 * The opening sentence, cut back to its definition.
 *
 * Cut at a clause that is demonstrably history or an address, never mid-
 * description: a lead that spends its words on the business, as Walmart's
 * does, has no such clause and is left whole.
 *
 * Where a second sentence says what the company sells, the lead only has to
 * say what kind of company it is, so it is cut whenever it can be. Where there
 * is no second sentence the lead is all the reader gets, and only a long one
 * is touched.
 */
function shorten(lead: string, hasSecondSentence: boolean): string {
  const text = stripAsides(lead);
  if (!hasSecondSentence && wordCount(text) <= 25) return text;

  const cut = text.search(OPENING_TAIL);
  if (cut === -1) return text;

  const kept = text.slice(0, cut).replace(/[,;:\s]+$/, "");
  return wordCount(kept) >= 5 ? `${kept}.` : text;
}

/** The sentence in an introduction that says what the business actually does. */
function whatItDoes(rest: string[]): string | null {
  let best: string | null = null;
  let bestScore = 0;

  for (const sentence of rest) {
    if (NOT_WHAT_IT_DOES.test(sentence)) continue;

    const hits = sentence.match(DESCRIBES_THE_BUSINESS)?.length ?? 0;
    if (hits === 0) continue;

    // Between two descriptive sentences, the shorter one reads better.
    const score = hits * 10 - wordCount(sentence) / 20;
    if (score > bestScore) {
      best = sentence;
      bestScore = score;
    }
  }

  if (!best) return null;

  // These sentences often run on into a semicolon-separated inventory of every
  // division. The first clause is the part worth reading.
  if (wordCount(best) > 30 && best.includes(";")) {
    return `${best.split(";")[0].trim()}.`;
  }
  return best;
}

async function json<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    next: { revalidate: WEEK },
  });

  // Raised rather than swallowed: a rate-limited minute must not be cached as
  // "this listing has no description" for the week that follows.
  if (!response.ok) {
    throw new Error(`Wikipedia answered ${response.status} for ${url}`);
  }
  return (await response.json()) as T;
}

/**
 * A description built from one named article, and whether it came out worth
 * having: two sentences, or a first one that says something on its own.
 */
export type WikipediaDescription = {
  text: string;
  /** The article the sentences were taken from, for the credit line. */
  title: string;
  url: string;
};

async function describeArticle(
  page: SearchPage,
): Promise<{ described: WikipediaDescription; rich: boolean } | null> {
  const query = new URLSearchParams({
    action: "query",
    prop: "extracts|pageprops",
    exintro: "1",
    explaintext: "1",
    redirects: "1",
    format: "json",
    titles: page.title,
  });
  const article = await json<{ query?: { pages?: Record<string, ExtractPage> } }>(
    `${API_URL}?${query}`,
  );

  const found = Object.values(article.query?.pages ?? {})[0];
  // A disambiguation page lists several subjects and describes none of them.
  if (!found?.extract || found.pageprops?.disambiguation !== undefined) {
    return null;
  }

  const lines = sentences(found.extract);
  if (lines.length === 0) return null;

  const does = whatItDoes(lines.slice(1));
  const lead = shorten(lines[0], does !== null);

  // The pair only if it fits; the opening line alone is a complete answer, and
  // a truncated second sentence is not.
  const text =
    does && wordCount(`${lead} ${does}`) <= MAX_WORDS ? `${lead} ${does}` : lead;

  const context = `${text} ${page.description ?? ""}`;
  if (!IS_A_LISTING.test(context)) return null;

  return {
    described: {
      text,
      title: page.title,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}`,
    },
    rich: does !== null || wordCount(lead) >= 14,
  };
}

/**
 * One or two lines on what a listing is and what it does, or null when no
 * article confidently matches it — a wrong description is worse than none, so
 * every uncertain match is dropped rather than guessed at.
 *
 * Where several articles name the listing, the first one that actually says
 * something wins. Wikipedia often carries both a corporate stub and a fuller
 * article on what the company sells — "Netflix, Inc." next to "Netflix" — and
 * the search ranks the stub first as often as not.
 */
export async function wikipediaDescription(
  listingName: string,
): Promise<WikipediaDescription | null> {
  if (!listingName.trim()) return null;

  const results = await json<{ pages?: SearchPage[] }>(
    `${SEARCH_URL}?q=${encodeURIComponent(listingName)}&limit=3`,
  );

  const candidates = (results.pages ?? []).filter((page) =>
    namesTheSameThing(page.title, listingName),
  );

  let thin: WikipediaDescription | null = null;
  for (const candidate of candidates) {
    const built = await describeArticle(candidate);
    if (!built) continue;
    if (built.rich) return built.described;
    thin ??= built.described;
  }
  return thin;
}
