"use client";

import { useUserSettings } from "@/components/settings/user-settings-provider";
import type { ForecastBandPoint } from "@/lib/forecast/engine";

const WIDTH = 600;
const HEIGHT = 220;

/**
 * The cone of outcomes.
 *
 * A single forecast line would be a lie — the whole point of running the
 * simulation is that the future is a spread, not a number. So the shaded band
 * is the 10th-to-90th percentile of everywhere the price landed, and the line
 * through it is the median. The band widening with time is the honest part of
 * the picture.
 *
 * `preserveAspectRatio="none"` lets the shape fill any container width;
 * `vectorEffect="non-scaling-stroke"` stops that stretch from thickening the
 * line, and every label lives in HTML outside the SVG so nothing is distorted.
 */
export function ForecastFanChart({ band }: { band: ForecastBandPoint[] }) {
  const { money } = useUserSettings();

  if (band.length < 2) return null;

  const lows = band.map((point) => point.low);
  const highs = band.map((point) => point.high);
  const min = Math.min(...lows);
  const max = Math.max(...highs);
  const range = max - min || 1;
  // A little headroom so the band never touches the frame.
  const pad = range * 0.06;
  const top = max + pad;
  const span = top - (min - pad) || 1;

  const x = (index: number) => (index / (band.length - 1)) * WIDTH;
  const y = (value: number) => HEIGHT - ((value - (min - pad)) / span) * HEIGHT;

  const path = (values: number[], command: "M" | "L") =>
    values
      .map(
        (value, index) =>
          `${index === 0 ? command : "L"}${x(index).toFixed(2)},${y(value).toFixed(2)}`,
      )
      .join(" ");

  const upper = path(highs, "M");
  const lowerReversed = [...lows]
    .map((value, index) => ({ value, index }))
    .reverse()
    .map(({ value, index }) => `L${x(index).toFixed(2)},${y(value).toFixed(2)}`)
    .join(" ");
  const areaPath = `${upper} ${lowerReversed} Z`;
  const midPath = path(
    band.map((point) => point.mid),
    "M",
  );

  const last = band[band.length - 1];

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="none"
          className="h-52 w-full text-primary"
          aria-label="Range of simulated prices over time"
          role="img"
        >
          <defs>
            <linearGradient id="forecast-band" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0.06" />
            </linearGradient>
          </defs>

          <path d={areaPath} fill="url(#forecast-band)" />
          <path
            d={path(highs, "M")}
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.35"
            strokeWidth="1"
            strokeDasharray="4 4"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={path(lows, "M")}
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.35"
            strokeWidth="1"
            strokeDasharray="4 4"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={midPath}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>Today · {money(band[0].mid)}</span>
        <span className="flex flex-wrap items-center gap-x-3">
          <span>
            Best 10%{" "}
            <span className="num text-foreground/80">{money(last.high)}</span>
          </span>
          <span>
            Median{" "}
            <span className="num text-foreground/80">{money(last.mid)}</span>
          </span>
          <span>
            Worst 10%{" "}
            <span className="num text-foreground/80">{money(last.low)}</span>
          </span>
        </span>
      </div>
    </div>
  );
}
