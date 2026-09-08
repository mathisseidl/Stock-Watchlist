import type { SymbolSearchResult } from "./types";

/**
 * The funds a reader means when they type the name of an index.
 *
 * Neither provider's relevance ranking is any help here, because an index name
 * is not the name of anything tradable: Yahoo answers "sp500" with a crypto
 * derivative and a Swiss UBS listing, and "nasdaq" with nothing but CME
 * futures — none of which this app can price. So the well-known index names
 * are answered from this table instead, and the provider's own hits follow it.
 *
 * The raw index tickers (^GSPC, ^IXIC, ^DJI) are deliberately absent; see
 * `SEARCHABLE_SYMBOL_TYPES` for why. Each index is represented by the ETFs
 * that track it, largest first.
 */
type IndexFamily = {
  /**
   * Matched as prefixes against the reader's query, so "s&p", "S & P 5" and
   * "sp500" all reach the same three funds while "dowdupont" reaches none of
   * them. Written in normalised form — lower case, letters and digits only.
   */
  keywords: string[];
  funds: { symbol: string; description: string }[];
};

const INDEX_FAMILIES: IndexFamily[] = [
  {
    keywords: ["sp500", "spx", "standardandpoors500"],
    funds: [
      { symbol: "SPY", description: "SPDR S&P 500 ETF Trust" },
      { symbol: "VOO", description: "Vanguard S&P 500 ETF" },
      { symbol: "IVV", description: "iShares Core S&P 500 ETF" },
    ],
  },
  {
    keywords: ["nasdaq", "nasdaq100", "ndx"],
    funds: [
      { symbol: "QQQ", description: "Invesco QQQ Trust (Nasdaq-100)" },
      { symbol: "QQQM", description: "Invesco Nasdaq-100 ETF" },
    ],
  },
  {
    keywords: ["dow", "dowjones", "djia", "dowjonesindustrialaverage"],
    funds: [
      { symbol: "DIA", description: "SPDR Dow Jones Industrial Average ETF" },
    ],
  },
  {
    keywords: ["totalstockmarket", "totalmarket", "usstockmarket"],
    funds: [
      { symbol: "VTI", description: "Vanguard Total Stock Market ETF" },
      { symbol: "ITOT", description: "iShares Core S&P Total U.S. Stock ETF" },
    ],
  },
  {
    keywords: ["russell2000", "russell", "smallcap"],
    funds: [{ symbol: "IWM", description: "iShares Russell 2000 ETF" }],
  },
  {
    keywords: ["msciworld", "allworld", "worldstocks", "globalstocks"],
    funds: [
      { symbol: "VT", description: "Vanguard Total World Stock ETF" },
      { symbol: "URTH", description: "iShares MSCI World ETF" },
    ],
  },
  {
    keywords: ["emergingmarkets"],
    funds: [
      { symbol: "VWO", description: "Vanguard FTSE Emerging Markets ETF" },
      { symbol: "IEMG", description: "iShares Core MSCI Emerging Markets ETF" },
    ],
  },
  {
    keywords: ["totalbondmarket", "bondmarket", "bondindex"],
    funds: [
      { symbol: "BND", description: "Vanguard Total Bond Market ETF" },
      { symbol: "AGG", description: "iShares Core U.S. Aggregate Bond ETF" },
    ],
  },
];

/** Lower case, letters and digits only, so "S&P 500" and "sp500" agree. */
function normalise(query: string): string {
  return query.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * The index funds a query names, or an empty list. Matching is by prefix, so
 * the funds appear while the reader is still typing ("nas" finds QQQ), from
 * two characters on — one letter would match half the table.
 */
export function matchIndexFunds(query: string): SymbolSearchResult[] {
  const term = normalise(query);
  if (term.length < 2) return [];

  return INDEX_FAMILIES.filter((family) =>
    family.keywords.some((keyword) => keyword.startsWith(term)),
  ).flatMap((family) =>
    family.funds.map((fund) => ({
      ...fund,
      type: "ETF",
      exchange: "NYSE Arca",
      us: true,
    })),
  );
}

/**
 * Puts the index funds a query names at the top of that query's results,
 * ahead of the provider's own ranking, and drops the provider's duplicate of
 * anything already listed.
 */
export function withIndexFunds(
  query: string,
  results: SymbolSearchResult[],
): SymbolSearchResult[] {
  const funds = matchIndexFunds(query);
  if (funds.length === 0) return results;

  const listed = new Set(funds.map((fund) => fund.symbol));
  return [...funds, ...results.filter((item) => !listed.has(item.symbol))];
}
