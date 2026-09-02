/**
 * Maps a news source's display name (as Finnhub reports it, e.g. "Yahoo",
 * "CNBC") to the domain whose favicon stands in for that outlet's logo.
 *
 * Finnhub's `url` on the free company-news endpoint points at a finnhub.io
 * redirect rather than the original publisher, so the article's own domain
 * cannot be used to look up a logo — the source name is the only signal
 * available, matched the same substring way `SOURCE_TRUST` in
 * news-curation.ts ranks it.
 */
const SOURCE_DOMAINS: { match: string; domain: string }[] = [
  { match: "reuters", domain: "reuters.com" },
  { match: "associated press", domain: "apnews.com" },
  { match: "ap news", domain: "apnews.com" },
  { match: "cnbc", domain: "cnbc.com" },
  { match: "marketwatch", domain: "marketwatch.com" },
  { match: "yahoo", domain: "finance.yahoo.com" },
  { match: "investing.com", domain: "investing.com" },
  { match: "forbes", domain: "forbes.com" },
  { match: "business insider", domain: "businessinsider.com" },
  { match: "investopedia", domain: "investopedia.com" },
  { match: "cnn", domain: "cnn.com" },
  { match: "npr", domain: "npr.org" },
  { match: "nbc", domain: "nbcnews.com" },
  { match: "cbs", domain: "cbsnews.com" },
  { match: "abc news", domain: "abcnews.go.com" },
  { match: "guardian", domain: "theguardian.com" },
  { match: "techcrunch", domain: "techcrunch.com" },
  { match: "the verge", domain: "theverge.com" },
  { match: "ars technica", domain: "arstechnica.com" },
  { match: "engadget", domain: "engadget.com" },
  { match: "zacks", domain: "zacks.com" },
  { match: "benzinga", domain: "benzinga.com" },
  { match: "globe newswire", domain: "globenewswire.com" },
  { match: "pr newswire", domain: "prnewswire.com" },
  { match: "business wire", domain: "businesswire.com" },
  { match: "motley fool", domain: "fool.com" },
  { match: "simply wall st", domain: "simplywall.st" },
  { match: "thestreet", domain: "thestreet.com" },
  { match: "barchart", domain: "barchart.com" },
  { match: "gurufocus", domain: "gurufocus.com" },
  { match: "msn", domain: "msn.com" },
];

/**
 * A small icon standing in for a news outlet's logo, or `null` for a source
 * not in the list above — the caller falls back to text alone rather than a
 * broken image.
 */
export function sourceLogoUrl(source: string): string | null {
  const normalized = source.toLowerCase().trim();
  const entry = SOURCE_DOMAINS.find((candidate) =>
    normalized.includes(candidate.match),
  );
  return entry ? `https://www.google.com/s2/favicons?sz=64&domain=${entry.domain}` : null;
}
