"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useTheme } from "next-themes";
import {
  AreaSeries,
  ColorType,
  CrosshairMode,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type Logical,
  type UTCTimestamp,
} from "lightweight-charts";
import type { CandlePoint } from "@/lib/market-data/types";

const COARSE_POINTER = "(pointer: coarse)";

function subscribeToPointer(onChange: () => void) {
  const query = window.matchMedia(COARSE_POINTER);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * Whether the primary input is a finger rather than a mouse.
 *
 * The instruction under the chart used to be chosen by screen width, which is
 * wrong: a tablet is wide enough to clear the `sm` breakpoint but has no
 * Shift key to hold, so iPad readers were told to use a keyboard they do not
 * have. Screen size has never implied input method — ask the pointer instead.
 *
 * `useSyncExternalStore` rather than an effect so the value is right on the
 * first paint and follows a device that changes input (a tablet gaining a
 * trackpad keyboard) without a flash of the wrong hint.
 */
function useCoarsePointer(): boolean {
  return useSyncExternalStore(
    subscribeToPointer,
    () => window.matchMedia(COARSE_POINTER).matches,
    // Server render: assume a mouse, matching the desktop-first markup.
    () => false,
  );
}

/** A point on the series resolved from a screen x-coordinate. */
type MeasurePoint = {
  x: number;
  y: number | null;
  index: number;
  value: number;
  time: number;
};

type Measure = {
  a: MeasurePoint;
  b: MeasurePoint;
  /** Which input started the measurement, so each one cleans up after itself. */
  source: "touch" | "shift";
  /**
   * The real series path between the two ends, in screen coordinates. Drawn
   * over the line so the measured stretch lights up in the gain/loss color
   * rather than being reduced to a straight chord between the endpoints.
   */
  path: { x: number; y: number }[];
  /** Captured with the measurement so the path's fill can reach the baseline. */
  plotHeight: number;
};

/**
 * Chart colors are literal hex/rgba, NOT read from the CSS tokens.
 *
 * lightweight-charts parses colors with its own parser that only understands
 * hex, rgb() and hsl(). Tailwind v4 registers the theme tokens as typed custom
 * properties, so getComputedStyle returns a computed `lab(...)` string, which
 * that parser throws on — taking down every chart in the app. Keep these in
 * step with --gain / --loss in globals.css by hand; a crash is a far worse
 * outcome than the two palettes drifting slightly.
 */
const CHART_THEME = {
  light: {
    gain: "#059669",
    loss: "#dc2626",
    gainFill: "rgba(5, 150, 105, 0.22)",
    lossFill: "rgba(220, 38, 38, 0.22)",
    text: "#71717a",
    grid: "rgba(113, 113, 122, 0.12)",
  },
  dark: {
    gain: "#34d399",
    loss: "#f87171",
    gainFill: "rgba(52, 211, 153, 0.22)",
    lossFill: "rgba(248, 113, 113, 0.22)",
    text: "#a1a1aa",
    grid: "rgba(161, 161, 170, 0.16)",
  },
} as const;

// Canvas cannot resolve `var(--font-sans)`, so name the faces outright. Sans
// rather than mono, to match the `num` utility the rest of the app reads its
// figures in — a monospaced axis next to a proportional price label looks like
// two different products.
const CHART_FONT =
  '"Geist", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

function formatStamp(time: number, spanSeconds: number) {
  const date = new Date(time * 1000);
  // Inside a couple of days the clock time is what distinguishes two points;
  // beyond that the calendar date is.
  if (spanSeconds < 3 * 24 * 3600) {
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Room above the plot for the readout. It sits over the chart rather than
 * under it because during a two-finger measurement the reader's own hand
 * covers the bottom of the screen — the numbers have to be where they can
 * still be seen. The space is reserved whether or not a measurement is in
 * progress, so starting one never resizes the plot underneath.
 */
const HEADER_HEIGHT = 46;

/** Room under the plot for the how-to-use hint. */
const CAPTION_HEIGHT = 20;

function plural(count: number, unit: string) {
  return `${count} ${unit}${count === 1 ? "" : "s"}`;
}

/**
 * The gap between the two measured points, as the largest unit plus the next
 * one down — "1h 29min", "1 day 13h", "1 week 2 days". A second unit is only
 * added when it is non-zero, and never below the precision the unit warrants
 * (no minutes once we are counting days).
 */
function formatSpan(seconds: number) {
  const abs = Math.abs(seconds);

  const minutes = Math.floor(abs / 60);
  if (minutes < 1) return "under a minute";
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(abs / 3600);
  if (hours < 24) {
    const restMinutes = Math.floor((abs - hours * 3600) / 60);
    return restMinutes ? `${hours}h ${restMinutes}min` : `${hours}h`;
  }

  const days = Math.floor(abs / 86_400);
  if (days < 7) {
    const restHours = Math.floor((abs - days * 86_400) / 3600);
    return restHours
      ? `${plural(days, "day")} ${restHours}h`
      : plural(days, "day");
  }

  if (days < 31) {
    const weeks = Math.floor(days / 7);
    const restDays = days - weeks * 7;
    return restDays
      ? `${plural(weeks, "week")} ${plural(restDays, "day")}`
      : plural(weeks, "week");
  }

  const DAYS_PER_MONTH = 30.44;
  if (days < 365) {
    const months = Math.floor(days / DAYS_PER_MONTH);
    // Capped at 3: four leftover weeks would just be another month.
    const restWeeks = Math.min(
      3,
      Math.floor((days - months * DAYS_PER_MONTH) / 7),
    );
    return restWeeks
      ? `${plural(months, "month")} ${plural(restWeeks, "week")}`
      : plural(months, "month");
  }

  // Clamped because a span of exactly 365 days lands in this branch while
  // being a hair short of an astronomical year, which would floor to zero.
  const years = Math.max(1, Math.floor(days / 365.25));
  const restMonths = Math.max(
    0,
    Math.floor((days - years * 365.25) / DAYS_PER_MONTH),
  );
  return restMonths
    ? `${plural(years, "year")} ${plural(restMonths, "month")}`
    : plural(years, "year");
}

export function PriceChart({
  points,
  positive,
  height = 320,
}: {
  points: CandlePoint[];
  positive: boolean;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const pointsRef = useRef(points);
  const measureRef = useRef<Measure | null>(null);
  const pointerXRef = useRef<number | null>(null);
  const hoveringRef = useRef(false);

  const [measure, setMeasureState] = useState<Measure | null>(null);
  const coarsePointer = useCoarsePointer();
  const { resolvedTheme } = useTheme();

  // Interaction handlers live outside React's render cycle, so the ref is the
  // source of truth and state only drives the overlay.
  const setMeasure = useCallback((next: Measure | null) => {
    measureRef.current = next;
    setMeasureState(next);
  }, []);

  /** Pan/zoom has to stand down while a measurement is in progress. */
  const setChartInteractive = useCallback((enabled: boolean) => {
    chartRef.current?.applyOptions({
      handleScroll: enabled,
      handleScale: enabled,
    });
  }, []);

  /** Snap a screen x-coordinate onto the nearest real data point. */
  const resolveAt = useCallback((x: number): MeasurePoint | null => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    const data = pointsRef.current;
    if (!chart || !series || data.length === 0) return null;

    const logical = chart.timeScale().coordinateToLogical(x);
    if (logical === null) return null;

    const index = Math.max(
      0,
      Math.min(data.length - 1, Math.round(logical as number)),
    );
    const point = data[index];
    const snappedX = chart.timeScale().logicalToCoordinate(index as Logical);

    return {
      x: snappedX ?? x,
      y: series.priceToCoordinate(point.value),
      index,
      value: point.value,
      time: point.time,
    };
  }, []);

  /** Screen coordinates for every data point between two indices, inclusive. */
  const seriesPath = useCallback((fromIndex: number, toIndex: number) => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    const data = pointsRef.current;
    if (!chart || !series) return [];

    const timeScale = chart.timeScale();
    const path: { x: number; y: number }[] = [];
    // A five-year daily series is well over a thousand points, and this runs on
    // every touchmove. Past a few hundred the extra vertices are sub-pixel.
    const step = Math.max(1, Math.ceil((toIndex - fromIndex + 1) / 400));

    for (let index = fromIndex; index <= toIndex; index += step) {
      const x = timeScale.logicalToCoordinate(index as Logical);
      const y = series.priceToCoordinate(data[index].value);
      if (x !== null && y !== null) path.push({ x, y });
    }

    // Stepping can stop short of the far end, which would leave the highlight
    // visibly detached from the point the reader is touching.
    const endX = timeScale.logicalToCoordinate(toIndex as Logical);
    const endY = series.priceToCoordinate(data[toIndex].value);
    if (endX !== null && endY !== null && path.at(-1)?.x !== endX) {
      path.push({ x: endX, y: endY });
    }

    return path;
  }, []);

  const measureBetween = useCallback(
    (xA: number, xB: number, source: Measure["source"]): Measure | null => {
      const first = resolveAt(xA);
      const second = resolveAt(xB);
      if (!first || !second) return null;

      // Always order left-to-right so the percentage reads forward in time.
      const [a, b] = first.index <= second.index ? [first, second] : [second, first];

      return {
        a,
        b,
        source,
        path: seriesPath(a.index, b.index),
        plotHeight: containerRef.current?.clientHeight ?? 0,
      };
    },
    [resolveAt, seriesPath],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container || points.length === 0) return;

    pointsRef.current = points;
    const palette =
      resolvedTheme === "dark" ? CHART_THEME.dark : CHART_THEME.light;
    const color = positive ? palette.gain : palette.loss;
    const fill = positive ? palette.gainFill : palette.lossFill;

    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: palette.text,
        fontFamily: CHART_FONT,
      },
      grid: {
        horzLines: { color: palette.grid },
        vertLines: { visible: false },
      },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: true },
      // No crosshair: its default style is a dashed rule in both axes, which
      // clutters the plot and clashes with the solid guides the measurement
      // overlay draws.
      crosshair: { mode: CrosshairMode.Hidden },
    });
    chartRef.current = chart;

    const series = chart.addSeries(AreaSeries, {
      lineColor: color,
      lineWidth: 2,
      topColor: fill,
      bottomColor: "transparent",
      priceLineVisible: false,
      lastValueVisible: false,
    });
    seriesRef.current = series;

    series.setData(
      points.map((point) => ({
        time: point.time as UTCTimestamp,
        value: point.value,
      })),
    );

    chart.timeScale().fitContent();

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      // A new series invalidates any measurement drawn over the old one.
      setMeasure(null);
    };
    // resolvedTheme is a dependency because the canvas colors are snapshotted
    // above — without it the chart keeps the old theme's palette.
  }, [points, positive, resolvedTheme, setMeasure]);

  // ---- Touch: two fingers on the chart measure between them ---------------
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function xIn(touch: Touch) {
      const rect = container!.getBoundingClientRect();
      return touch.clientX - rect.left;
    }

    function apply(event: TouchEvent) {
      const next = measureBetween(
        xIn(event.touches[0]),
        xIn(event.touches[1]),
        "touch",
      );
      if (next) setMeasure(next);
    }

    function handleStart(event: TouchEvent) {
      if (event.touches.length < 2) return;
      // Capture phase + stopPropagation keeps the chart's own pinch-zoom from
      // firing, and preventDefault keeps the browser from zooming the page.
      event.preventDefault();
      event.stopPropagation();
      setChartInteractive(false);
      apply(event);
    }

    function handleMove(event: TouchEvent) {
      if (!measureRef.current || event.touches.length < 2) return;
      event.preventDefault();
      event.stopPropagation();
      apply(event);
    }

    function handleEnd(event: TouchEvent) {
      if (!measureRef.current) return;
      if (event.touches.length >= 2) return;
      setMeasure(null);
      setChartInteractive(true);
    }

    const options = { capture: true, passive: false } as const;
    container.addEventListener("touchstart", handleStart, options);
    container.addEventListener("touchmove", handleMove, options);
    container.addEventListener("touchend", handleEnd, options);
    container.addEventListener("touchcancel", handleEnd, options);

    return () => {
      container.removeEventListener("touchstart", handleStart, options);
      container.removeEventListener("touchmove", handleMove, options);
      container.removeEventListener("touchend", handleEnd, options);
      container.removeEventListener("touchcancel", handleEnd, options);
    };
  }, [measureBetween, setMeasure, setChartInteractive]);

  // ---- Desktop: hold Shift to pin an anchor, then move the mouse ----------
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // The pinned end, kept separately from `measure` so that re-ordering the
    // two ends by time never drags the anchor along with the cursor.
    let anchorX: number | null = null;

    function handleMouseMove(event: MouseEvent) {
      const rect = container!.getBoundingClientRect();
      const x = event.clientX - rect.left;
      pointerXRef.current = x;
      hoveringRef.current = true;

      if (measureRef.current?.source !== "shift" || anchorX === null) return;
      const next = measureBetween(anchorX, x, "shift");
      if (next) setMeasure(next);
    }

    function handleMouseLeave() {
      hoveringRef.current = false;
      pointerXRef.current = null;
      if (measureRef.current?.source === "shift") {
        anchorX = null;
        setMeasure(null);
        setChartInteractive(true);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Shift") return;
      if (measureRef.current) return;
      if (!hoveringRef.current || pointerXRef.current === null) return;

      anchorX = pointerXRef.current;
      const next = measureBetween(anchorX, anchorX, "shift");
      if (next) {
        setChartInteractive(false);
        setMeasure(next);
      }
    }

    function handleKeyUp(event: KeyboardEvent) {
      if (event.key !== "Shift") return;
      if (measureRef.current?.source !== "shift") return;
      anchorX = null;
      setMeasure(null);
      setChartInteractive(true);
    }

    container.addEventListener("mousemove", handleMouseMove);
    container.addEventListener("mouseleave", handleMouseLeave);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    // Alt-tabbing away while Shift is down would otherwise strand the overlay.
    window.addEventListener("blur", handleMouseLeave);

    return () => {
      container.removeEventListener("mousemove", handleMouseMove);
      container.removeEventListener("mouseleave", handleMouseLeave);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleMouseLeave);
    };
  }, [measureBetween, setMeasure, setChartInteractive]);

  const diff = measure ? measure.b.value - measure.a.value : 0;
  const diffPercent =
    measure && measure.a.value !== 0 ? (diff / measure.a.value) * 100 : 0;
  const diffPositive = diff >= 0;
  const spanSeconds = measure ? measure.b.time - measure.a.time : 0;

  const polyline = measure?.path.map((p) => `${p.x},${p.y}`).join(" ") ?? "";
  const polygon =
    measure && measure.path.length > 1
      ? `${measure.path[0].x},${measure.plotHeight} ${polyline} ${measure.path.at(-1)!.x},${measure.plotHeight}`
      : "";

  return (
    <div className="w-full" style={{ height }}>
      {/* The readout is a fixed header rather than a label pinned near the
          points: it never lands under a finger, and it holds still instead of
          sliding around as the measurement changes. */}
      <div
        className="flex flex-col items-center justify-center overflow-hidden text-center"
        style={{ height: HEADER_HEIGHT }}
      >
        {measure && (
          <>
            <p className="num text-[13px] whitespace-nowrap text-muted-foreground">
              {formatStamp(measure.a.time, spanSeconds)} –{" "}
              {formatStamp(measure.b.time, spanSeconds)} ·{" "}
              {formatSpan(spanSeconds)}
            </p>
            <p
              className={
                "num flex items-baseline gap-6 text-lg font-semibold whitespace-nowrap " +
                (diffPositive ? "text-gain" : "text-loss")
              }
            >
              <span>
                {diffPositive ? "+" : "−"}${Math.abs(diff).toFixed(2)}
              </span>
              <span>
                {diffPositive ? "+" : "−"}
                {Math.abs(diffPercent).toFixed(2)}%
              </span>
            </p>
          </>
        )}
      </div>

      <div
        className="relative w-full select-none"
        style={{ height: Math.max(0, height - HEADER_HEIGHT - CAPTION_HEIGHT) }}
        data-measuring={measure ? "true" : undefined}
      >
        <div ref={containerRef} className="absolute inset-0" />

        {measure && (
          <div className="pointer-events-none absolute inset-0 z-10">
            <svg className="size-full" aria-hidden="true">
              {/* Full-height rules mark where each finger is, so the reader can
                  see what they have grabbed without lifting a hand. */}
              {[measure.a, measure.b].map((point, index) => (
                <line
                  key={index}
                  x1={point.x}
                  x2={point.x}
                  y1={0}
                  y2="100%"
                  className={diffPositive ? "stroke-gain" : "stroke-loss"}
                  strokeWidth={1.5}
                  opacity={0.55}
                />
              ))}

              {polygon && (
                <polygon
                  points={polygon}
                  className={diffPositive ? "fill-gain" : "fill-loss"}
                  opacity={0.16}
                />
              )}

              {polyline && (
                <polyline
                  points={polyline}
                  fill="none"
                  className={diffPositive ? "stroke-gain" : "stroke-loss"}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {[measure.a, measure.b].map((point, index) =>
                point.y === null ? null : (
                  <circle
                    key={index}
                    cx={point.x}
                    cy={point.y}
                    r={7}
                    className={
                      diffPositive
                        ? "fill-gain stroke-background"
                        : "fill-loss stroke-background"
                    }
                    strokeWidth={2.5}
                  />
                ),
              )}
            </svg>
          </div>
        )}
      </div>

      {/* Hidden rather than unmounted while measuring: the numbers above say
          everything at that point, but the row still has to hold its height. */}
      <p
        className="flex items-center overflow-hidden text-[11px] whitespace-nowrap text-muted-foreground/70"
        style={{ height: CAPTION_HEIGHT }}
      >
        {!measure &&
          (coarsePointer
            ? "Touch the chart with two fingers to compare two points"
            : "Hold ⇧ Shift and move the cursor to compare two points")}
      </p>
    </div>
  );
}
