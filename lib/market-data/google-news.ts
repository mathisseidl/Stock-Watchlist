import type { NewsItem } from "./types";

/**
 * Headlines from a named day in the past, free.
 *
 * The free news tiers this app runs on only reach back about a week, which is
 * useless for the question "why did this stock fall 9% three weeks ago". Google
 * News' RSS search takes `after:` and `before:` dates, needs no key, and
 * answers that question directly:
 *
 *   Walmart stock after:2026-08-19 before:2026-08-22
 *   -> "Walmart stock drops 9% as sales growth slows…" (Yahoo Finance)
 *   -> "Walmart stock tumbles 9% after outlook disappoints…" (CNBC)
 *
 * It is a search rather than a company feed, so it returns commentary and
 * listicles alongside reporting. Ranking those down is `rankHeadlines`' job,
 * not this module's — everything here is about getting the day's stories out
 * of the feed intact.
 */

const FEED_URL = "https://news.google.com/rss/search";

/** Google will not hand a feed to something that looks like a robot. */
const USER_AGENT =
  "Mozilla/5.0 (compatible; matmaxapp.com/1.0; +https://matmaxapp.com)";

const DAY_MS = 24 * 60 * 60 * 1000;

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&#39;": "'",
  "&nbsp;": " ",
};

function decode(text: string): string {
  return text
    .replace(/&[a-z]+;|&#\d+;/gi, (entity) => {
      const known = ENTITIES[entity.toLowerCase()];
      if (known) return known;
      const numeric = /^&#(\d+);$/.exec(entity);
      return numeric ? String.fromCodePoint(Number(numeric[1])) : entity;
    })
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Google appends the outlet to every title — "Walmart stock tumbles 9% - CNBC"
 * — and the outlet is shown separately, so it comes off.
 */
function withoutOutlet(title: string, source: string): string {
  const tail = new RegExp(`\\s+[-–—]\\s*${escapeRegExp(source)}\\s*$`, "i");
  return title
    .replace(tail, "")
    .replace(/\s+[-–—]\s*[^-–—]{1,30}$/, "")
    // Some wires sign the headline itself: "…despite earnings beat By
    // Investing.com".
    .replace(/\s+By\s+[\w.'-]+(?:\s+[\w.'-]+){0,2}\s*$/, "")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Outlets arrive as display names ("Yahoo Finance") or as bare domains
 * ("cnbc.com"), depending on the publisher. The domains are turned back into
 * something readable, since these names are printed to the reader and matched
 * against the trust and paywall lists.
 */
const DOMAIN_NAMES: Record<string, string> = {
  cnbc: "CNBC",
  wsj: "WSJ",
  ft: "FT",
  bbc: "BBC",
  cnn: "CNN",
  npr: "NPR",
  abc: "ABC News",
  cbsnews: "CBS News",
  nbcnews: "NBC News",
  nytimes: "New York Times",
  reuters: "Reuters",
  apnews: "Associated Press",
  marketwatch: "MarketWatch",
  barrons: "Barron's",
  investopedia: "Investopedia",
  benzinga: "Benzinga",
  fool: "Motley Fool",
  businessinsider: "Business Insider",
  techcrunch: "TechCrunch",
  theverge: "The Verge",
  simplywall: "Simply Wall St",
};

function prettySource(raw: string): string {
  const name = decode(raw);
  if (!name.includes(".") || name.includes(" ")) return name;

  const label = name.replace(/^www\./i, "").split(".")[0].toLowerCase();
  return (
    DOMAIN_NAMES[label] ??
    (label.length <= 4 ? label.toUpperCase() : label[0].toUpperCase() + label.slice(1))
  );
}

/** A stable positive number from the article link, for `NewsItem.id`. */
function idFor(link: string): number {
  let hash = 0;
  for (let index = 0; index < link.length; index += 1) {
    hash = (hash * 31 + link.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

function tagOf(block: string, tag: string): string | null {
  const match = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i").exec(block);
  if (!match) return null;
  return match[1].replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/, "$1").trim();
}

function parse(xml: string): NewsItem[] {
  const items: NewsItem[] = [];

  for (const block of xml.split(/<item>/).slice(1)) {
    const title = tagOf(block, "title");
    const link = tagOf(block, "link");
    const published = tagOf(block, "pubDate");
    if (!title || !link || !published) continue;

    const when = Date.parse(published);
    if (Number.isNaN(when)) continue;

    const source = prettySource(tagOf(block, "source") ?? "");
    items.push({
      id: idFor(link),
      headline: withoutOutlet(decode(title), source),
      source: source || "News",
      url: decode(link),
      datetime: Math.floor(when / 1000),
      summary: "",
    });
  }

  return items;
}

/**
 * Every story published about a listing between two dates.
 *
 * `after`/`before` are exclusive at both ends in Google's syntax, so the window
 * is widened by a day on each side and the results filtered back to the range
 * asked for — a story about a Thursday crash is as likely to be filed on the
 * Wednesday evening or the Friday morning.
 *
 * Returns nothing rather than raising: this is one sentence of an explanation
 * that has other things to say, and the caller has its own headlines to fall
 * back on.
 */
export async function newsBetween(
  name: string,
  from: Date,
  to: Date,
  revalidate = 3600,
): Promise<NewsItem[]> {
  const query = [
    `${name} stock`,
    `after:${isoDay(new Date(from.getTime() - DAY_MS))}`,
    `before:${isoDay(new Date(to.getTime() + DAY_MS))}`,
  ].join(" ");

  const url = `${FEED_URL}?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      next: { revalidate },
    });
    if (!response.ok) {
      console.error(`Google News answered ${response.status} for "${query}"`);
      return [];
    }

    const earliest = from.getTime() / 1000;
    const latest = to.getTime() / 1000;
    return parse(await response.text()).filter(
      (item) => item.datetime >= earliest && item.datetime <= latest,
    );
  } catch (error) {
    console.error(`Google News request failed for "${query}"`, error);
    return [];
  }
}
