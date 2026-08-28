import { NextResponse } from "next/server";
import { getAccountSubscription } from "@/lib/subscription";
import {
  buildForecast,
  MAX_HORIZON_DAYS,
  MIN_HORIZON_DAYS,
  NotEnoughHistoryError,
} from "@/lib/forecast/engine";
import { isSampleSymbol, SAMPLE_FORECAST } from "@/lib/forecast/sample";

// The simulation is CPU-bound and takes a couple of seconds on a long horizon.
export const maxDuration = 60;

type Body = {
  symbol?: unknown;
  name?: unknown;
  amount?: unknown;
  horizonDays?: unknown;
};

/**
 * Runs a forecast.
 *
 * Everyone can run the S&P 500 sample — that is the try-before-you-buy. Any
 * other ticker needs Pro.
 */
export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const symbol =
    typeof body.symbol === "string" ? body.symbol.trim().toUpperCase() : "";
  const amount = Number(body.amount);
  const horizonDays = Number(body.horizonDays);

  if (!symbol) {
    return NextResponse.json({ error: "Pick a stock first." }, { status: 400 });
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json(
      { error: "Enter an amount greater than $0." },
      { status: 400 },
    );
  }
  if (
    !Number.isFinite(horizonDays) ||
    horizonDays < MIN_HORIZON_DAYS ||
    horizonDays > MAX_HORIZON_DAYS
  ) {
    return NextResponse.json(
      {
        error: `Pick a date between a week and ten years from today.`,
      },
      { status: 400 },
    );
  }

  const sample = isSampleSymbol(symbol);
  if (!sample) {
    const account = await getAccountSubscription();
    if (!account?.isPaid) {
      return NextResponse.json(
        {
          error: "Forecasting any stock is a Pro feature.",
          requiresPro: true,
          sampleSymbol: SAMPLE_FORECAST.symbol,
        },
        { status: 403 },
      );
    }
  }

  try {
    const forecast = await buildForecast({
      symbol,
      name:
        typeof body.name === "string" && body.name.trim()
          ? body.name
          : sample
            ? SAMPLE_FORECAST.name
            : undefined,
      amount,
      horizonDays,
    });
    return NextResponse.json({ forecast, isSample: sample });
  } catch (error) {
    if (error instanceof NotEnoughHistoryError) {
      return NextResponse.json(
        {
          error: `There isn't enough price history for ${symbol} to model it honestly. Try a company that has been listed for at least a year.`,
        },
        { status: 422 },
      );
    }
    console.error(`Failed to build a forecast for ${symbol}`, error);
    return NextResponse.json(
      { error: "Couldn't reach the price history for that stock." },
      { status: 502 },
    );
  }
}
