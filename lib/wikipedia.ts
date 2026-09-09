/**
 * Plain-English descriptions of a listing, straight from Wikipedia.
 *
 * This is what "What does it do?" falls back to when no model key is set, and
 * it costs nothing: Wikipedia's REST API is public, unmetered and needs no
 * account. The trade is that it can only describe listings someone has already
 * written an article about — which, for anything the search box surfaces, is
 * very nearly all of them, funds and indices included.
 *
 * Wikipedia asks that callers identify themselves, hence the User-Agent. The
 * two calls are cached for a week, the same span the description route caches
 * its own answer for; nothing here changes week to week.
 */

const SEARCH_URL = "https://en.wikipedia.org/w/rest.php/v1/search/page";
const SUMMARY_URL = "https://en.wikipedia.org/api/rest_v1/page/summary/";
const USER_AGENT = "matmaxapp.com stock watchlist (+https://matmaxapp.com)";
const WEEK = 604_800;

/** At most this many words, so the answer stays the two lines the UI expects. */
const MAX_WORDS = 45;

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
  /\b(compan|corporat|business|firm|manufactur|retail|bank|insur|brand|conglomerat|fund|etf|exchange-traded|index|indices|trust|holdings?|multinational|enterprise|subsidiar|chain|airline|carrier|operator|producer|supplier|developer|platform|studio|publisher)/i;

type SearchPage = { title: string; description?: string | null };
type Summary = { type?: string; extract?: string; title?: string };

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

/** The first sentences of an extract, up to the word budget. */
function trim(extract: string): string {
  const sentences = extract
    .replace(/\s+/g, " ")
    .trim()
    // Splits on sentence enders only where a new sentence really starts, so
    // "Inc." and "U.S." do not cut a sentence in half.
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])/);

  const kept: string[] = [];
  let words = 0;

  for (const sentence of sentences) {
    const length = sentence.split(/\s+/).length;
    if (kept.length > 0 && words + length > MAX_WORDS) break;
    kept.push(sentence.trim());
    words += length;
    if (kept.length === 2 || words >= MAX_WORDS) break;
  }

  return kept.join(" ");
}

async function json<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      next: { revalidate: WEEK },
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch (error) {
    console.error(`Wikipedia request failed: ${url}`, error);
    return null;
  }
}

/**
 * One or two lines on what a listing is, or null when no article confidently
 * matches it — a wrong description is worse than none, so every uncertain
 * match is dropped rather than guessed at.
 */
export async function wikipediaDescription(
  listingName: string,
): Promise<string | null> {
  if (!listingName.trim()) return null;

  const results = await json<{ pages?: SearchPage[] }>(
    `${SEARCH_URL}?q=${encodeURIComponent(listingName)}&limit=3`,
  );

  const match = results?.pages?.find((page) =>
    namesTheSameThing(page.title, listingName),
  );
  if (!match) return null;

  const summary = await json<Summary>(
    `${SUMMARY_URL}${encodeURIComponent(match.title.replace(/ /g, "_"))}`,
  );

  // "standard" rules out a disambiguation page, which lists several subjects
  // and describes none of them.
  if (!summary || summary.type !== "standard" || !summary.extract) return null;

  const description = trim(summary.extract);
  if (!description) return null;

  const context = `${description} ${match.description ?? ""}`;
  return IS_A_LISTING.test(context) ? description : null;
}
