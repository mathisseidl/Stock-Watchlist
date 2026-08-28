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
  /** Captured with the measurement so the label can be clamped on render. */
  containerWidth: number;
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

/** Room under the plot for the hint & measured-range caption. */
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

  const measureBetween = useCallback(
    (xA: number, xB: number, source: Measure["source"]): Measure | null => {
      const first = resolveAt(xA);
      const second = resolveAt(xB);
      if (!first || !second) return null;
      const containerWidth = containerRef.current?.clientWidth ?? 0;
      // Always order left-to-right so the percentage reads forward in time.
      return first.index <= second.index
        ? { a: first, b: second, source, containerWidth }
        : { a: second, b: first, source, containerWidth };
    },
    [resolveAt],
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
      crosshair: {
        vertLine: { color: color, width: 1, labelBackgroundColor: color },
        horzLine: { color: color, labelBackgroundColor: color },
      },
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

  const midX = measure ? (measure.a.x + measure.b.x) / 2 : 0;
  const labelX = measure
    ? Math.max(96, Math.min(Math.max(96, measure.containerWidth - 96), midX))
    : 0;

  return (
    // The caption sits below the plot rather than inside it — at the bottom of
    // the chart it collided with the time axis labels. The plot gives up that
    // height so the component still measures exactly `height` overall.
    <div className="w-full" style={{ height }}>
      <div
        className="relative w-full select-none"
        style={{ height: Math.max(0, height - CAPTION_HEIGHT) }}
        data-measuring={measure ? "true" : undefined}
      >
        <div ref={containerRef} className="absolute inset-0" />

      {measure && (
        <div className="pointer-events-none absolute inset-0 z-10">
          <svg className="size-full" aria-hidden="true">
            <rect
              x={Math.min(measure.a.x, measure.b.x)}
              y={0}
              width={Math.abs(measure.b.x - measure.a.x)}
              height="100%"
              className="fill-primary/8"
            />
            {[measure.a, measure.b].map((point, index) => (
              <line
                key={index}
                x1={point.x}
                x2={point.x}
                y1={0}
                y2="100%"
                strokeDasharray="4 4"
                className="stroke-primary/60"
                strokeWidth={1}
              />
            ))}
            {measure.a.y !== null && measure.b.y !== null && (
              <line
                x1={measure.a.x}
                y1={measure.a.y}
                x2={measure.b.x}
                y2={measure.b.y}
                className={diffPositive ? "stroke-gain" : "stroke-loss"}
                strokeWidth={1.5}
              />
            )}
            {[measure.a, measure.b].map((point, index) =>
              point.y === null ? null : (
                <circle
                  key={index}
                  cx={point.x}
                  cy={point.y}
                  r={4}
                  className={
                    diffPositive
                      ? "fill-gain stroke-background"
                      : "fill-loss stroke-background"
                  }
                  strokeWidth={2}
                />
              ),
            )}
          </svg>

          <div
            className="absolute top-2 -translate-x-1/2 rounded-xl border border-border bg-popover/95 px-3 py-2 text-center shadow-lg backdrop-blur"
            style={{ left: labelX }}
          >
            <p
              className={
                "num text-lg font-semibold " +
                (diffPositive ? "text-gain" : "text-loss")
              }
            >
              {diffPositive ? "+" : "−"}
              {Math.abs(diffPercent).toFixed(2)}%
            </p>
            <p className="num text-xs text-muted-foreground">
              {diffPositive ? "+" : "−"}${Math.abs(diff).toFixed(2)} ·{" "}
              {formatSpan(spanSeconds)}
            </p>
            <p className="mt-0.5 num text-[11px] text-muted-foreground/80">
              ${measure.a.value.toFixed(2)} → ${measure.b.value.toFixed(2)}
            </p>
          </div>

        </div>
        )}
      </div>

      <p
        className="flex items-center overflow-hidden text-[11px] whitespace-nowrap text-muted-foreground/70"
        style={{ height: CAPTION_HEIGHT }}
      >
        {measure ? (
          <span className="num">
            {formatStamp(measure.a.time, spanSeconds)} →{" "}
            {formatStamp(measure.b.time, spanSeconds)}
          </span>
        ) : (
          <span>
            {coarsePointer
              ? "Touch the chart with two fingers to compare two points"
              : "Hold ⇧ Shift and move the cursor to compare two points"}
          </span>
        )}
      </p>
    </div>
  );
}
