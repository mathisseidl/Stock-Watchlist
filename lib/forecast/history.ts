/**
 * Daily closing prices, straight from Yahoo's chart endpoint.
 *
 * The app's normal candle fetch collapses five years down to weekly bars,
 * which is fine for drawing a line but throws away most of the sample the
 * forecast needs: volatility and drift estimates are only as good as the
 * number of observations behind them. This asks for daily bars over the whole
 * window instead — roughly 1,250 closes for a stock with five years of trading
 * history.
 */

const CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart";

export type DailyHistory = {
  /** Closing prices, oldest first. */
  closes: number[];
  /** Unix seconds matching `closes`. */
  times: number[];
  /** Latest price the exchange has published. */
  price: number;
  /** Trading days actually returned. */
  length: number;
};

type YahooChartResponse = {
  chart: {
    result:
      | {
          timestamp?: number[];
          meta?: { regularMarketPrice?: number };
          indicators?: { quote?: { close?: (number | null)[] }[] };
        }[]
      | null;
  };
};

export async function fetchDailyHistory(
  symbol: string,
  range: "2y" | "5y" | "10y" = "5y",
): Promise<DailyHistory> {
  const url = `${CHART_URL}/${encodeURIComponent(symbol)}?range=${range}&interval=1d`;

  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    },
    // Daily bars only change once a day, so an hour of cache costs nothing and
    // keeps a page of watchlist forecasts from hammering Yahoo.
    next: { revalidate: 3600 },
  });

  if (!res.ok) {
    throw new Error(`Yahoo history request failed: ${res.status} ${symbol}`);
  }

  const data = (await res.json()) as YahooChartResponse;
  const result = data.chart.result?.[0];
  const rawCloses = result?.indicators?.quote?.[0]?.close;
  const rawTimes = result?.timestamp;

  if (!result || !rawCloses || !rawTimes) {
    return { closes: [], times: [], price: 0, length: 0 };
  }

  const closes: number[] = [];
  const times: number[] = [];
  for (let index = 0; index < rawTimes.length; index += 1) {
    const close = rawCloses[index];
    // Yahoo leaves holidays and halted sessions as nulls; a zero would blow up
    // the log-return that follows.
    if (typeof close === "number" && Number.isFinite(close) && close > 0) {
      closes.push(close);
      times.push(rawTimes[index]);
    }
  }

  const last = closes.length > 0 ? closes[closes.length - 1] : 0;
  return {
    closes,
    times,
    price: result.meta?.regularMarketPrice ?? last,
    length: closes.length,
  };
}
