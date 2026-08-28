"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useUserSettings } from "@/components/settings/user-settings-provider";
import type { ForecastBandPoint } from "@/lib/forecast/engine";

/** Room on the right for price labels, matching the app's other charts. */
const PAD_RIGHT = 58;
/** Room underneath for the two date labels. */
const PAD_BOTTOM = 22;
const PAD_TOP = 10;
const HEIGHT = 288;

function formatDay(seconds: number) {
  return new Date(seconds * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * The cone of outcomes.
 *
 * A single forecast line would be a lie — the whole point of running the
 * simulation is that the future is a spread, not a number. So the shading is
 * where the simulated prices actually went: a dark inner band holding the
 * middle half of them, a paler outer band holding eight in ten, and the median
 * line threaded through. The cone widening with time is the honest part of the
 * picture, and the flat dashed line across it is what you paid — the moment
 * the cone clears that line is the moment the odds turn.
 *
 * Drawn into a pixel-for-pixel viewBox rather than a stretched one, so text and
 * strokes inside the SVG are never distorted and the crosshair maths is just
 * arithmetic on the same coordinates.
 */
export function ForecastFanChart({
  band,
  entryPrice,
}: {
  band: ForecastBandPoint[];
  /** Today's price — the break-even line drawn across the cone. */
  entryPrice: number;
}) {
  const { money, number } = useUserSettings();
  // React hands back ids like «r0», whose guillemets are not safe inside an
  // SVG url(#…) reference — strip everything that isn't a word character.
  const gradientId = `fan-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  if (band.length < 2) return null;

  const plotWidth = Math.max(0, width - PAD_RIGHT);
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;

  // The break-even line is folded into the scale so it is always on screen,
  // even for a horizon whose whole cone sits above or below it.
  const low = Math.min(...band.map((point) => point.low), entryPrice);
  const high = Math.max(...band.map((point) => point.high), entryPrice);
  const pad = (high - low) * 0.08 || 1;
  const floor = low - pad;
  const span = high + pad - floor || 1;

  const x = (index: number) => (index / (band.length - 1)) * plotWidth;
  const y = (value: number) =>
    PAD_TOP + plotHeight - ((value - floor) / span) * plotHeight;

  const line = (pick: (point: ForecastBandPoint) => number) =>
    band
      .map(
        (point, index) =>
          `${index === 0 ? "M" : "L"}${x(index).toFixed(1)},${y(pick(point)).toFixed(1)}`,
      )
      .join(" ");

  /** Closed shape between an upper and a lower series. */
  const ribbon = (
    upper: (point: ForecastBandPoint) => number,
    lower: (point: ForecastBandPoint) => number,
  ) => {
    const down = band
      .map((point, index) => `L${x(index).toFixed(1)},${y(lower(point)).toFixed(1)}`)
      .reverse()
      .join(" ");
    return `${line(upper)} ${down} Z`;
  };

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((step) => floor + span * step);
  const last = band[band.length - 1];
  const active = hover === null ? null : band[hover];

  function pointerToIndex(clientX: number) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || plotWidth <= 0) return null;
    const relative = clientX - rect.left;
    if (relative < 0 || relative > plotWidth + 8) return null;
    const ratio = Math.min(1, Math.max(0, relative / plotWidth));
    return Math.round(ratio * (band.length - 1));
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={containerRef}
        className="relative w-full touch-pan-y select-none"
        style={{ height: HEIGHT }}
        onPointerMove={(event) => setHover(pointerToIndex(event.clientX))}
        onPointerDown={(event) => setHover(pointerToIndex(event.clientX))}
        onPointerLeave={() => setHover(null)}
      >
        {width > 0 && (
          <svg
            width={width}
            height={HEIGHT}
            viewBox={`0 0 ${width} ${HEIGHT}`}
            className="absolute inset-0 text-primary"
            role="img"
            aria-label={`Simulated price range for the next ${band.length} checkpoints, ending between ${money(last.low)} and ${money(last.high)}`}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity="0.3" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0.05" />
              </linearGradient>
            </defs>

            {/* Gridlines and the price scale on the right. */}
            {ticks.map((value) => (
              <g key={value}>
                <line
                  x1={0}
                  x2={plotWidth}
                  y1={y(value)}
                  y2={y(value)}
                  className="stroke-border"
                  strokeWidth={1}
                />
                <text
                  x={plotWidth + 8}
                  y={y(value) + 3.5}
                  className="num fill-muted-foreground text-[10px]"
                >
                  {money(value, 0)}
                </text>
              </g>
            ))}

            {/* Outer band: eight runs in ten finished inside this. */}
            <path
              d={ribbon(
                (point) => point.high,
                (point) => point.low,
              )}
              fill={`url(#${gradientId})`}
            />
            {/* Inner band: the middle half of them. */}
            <path
              d={ribbon(
                (point) => point.highMid,
                (point) => point.lowMid,
              )}
              fill="currentColor"
              fillOpacity={0.18}
            />

            {/* What you paid. Everything above this line is profit. */}
            <line
              x1={0}
              x2={plotWidth}
              y1={y(entryPrice)}
              y2={y(entryPrice)}
              className="stroke-foreground/45"
              strokeWidth={1}
              strokeDasharray="5 4"
            />

            <path
              d={line((point) => point.mid)}
              fill="none"
              stroke="currentColor"
              strokeWidth={2.25}
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {active && hover !== null && (
              <g>
                <line
                  x1={x(hover)}
                  x2={x(hover)}
                  y1={PAD_TOP}
                  y2={PAD_TOP + plotHeight}
                  className="stroke-foreground/30"
                  strokeWidth={1}
                />
                {[active.high, active.mid, active.low].map((value, index) => (
                  <circle
                    key={index}
                    cx={x(hover)}
                    cy={y(value)}
                    r={index === 1 ? 4 : 3}
                    className="fill-primary stroke-card"
                    strokeWidth={2}
                  />
                ))}
              </g>
            )}
          </svg>
        )}

        {/* Tooltip lives in HTML so it can wrap, clamp and use real type. */}
        {active && hover !== null && plotWidth > 0 && (
          <div
            className="pointer-events-none absolute top-2 z-10 w-44 -translate-x-1/2 rounded-xl border border-border bg-popover/95 p-2.5 shadow-lg backdrop-blur"
            style={{
              left: Math.min(Math.max(x(hover), 92), Math.max(92, plotWidth - 92)),
            }}
          >
            <p className="text-[11px] font-medium">{formatDay(active.time)}</p>
            <dl className="mt-1.5 flex flex-col gap-0.5 text-[11px]">
              {[
                { label: "Best 10%", value: active.high },
                { label: "Median", value: active.mid },
                { label: "Worst 10%", value: active.low },
              ].map((row) => (
                <div key={row.label} className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">{row.label}</dt>
                  <dd className="num font-medium">{money(row.value)}</dd>
                </div>
              ))}
            </dl>
            <p className="num mt-1.5 border-t border-border pt-1.5 text-[10px] text-muted-foreground">
              Median {active.mid >= entryPrice ? "+" : "−"}
              {number(Math.abs((active.mid / entryPrice - 1) * 100), 1)}% vs today
            </p>
          </div>
        )}
      </div>

      <div
        className="flex items-center justify-between text-[11px] text-muted-foreground"
        style={{ paddingRight: PAD_RIGHT }}
      >
        <span>Today</span>
        <span>{formatDay(last.time)}</span>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-sm bg-primary/35" />
          Middle half of runs
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-sm bg-primary/15" />8 runs in 10
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full bg-primary" />
          Median path
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0 w-4 border-t border-dashed border-foreground/45" />
          Break even ({money(entryPrice)})
        </span>
      </div>
    </div>
  );
}
