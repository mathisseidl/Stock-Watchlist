"use client";

import {
  useCallback,
  useEffect,
  useMemo,
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
import type {
  CandleRange,
  CandlePoint,
  TradingSession,
} from "@/lib/market-data/types";
import { buildTimeline } from "@/lib/chart-timeline";
import {
  fiveYearRangeTicks,
  monthRangeTicks,
  weekendGaps,
  weekRangeTicks,
  yearRangeTicks,
  type AxisTick,
} from "@/lib/chart-axis-ticks";
import { localeFor, type NumberFormat } from "@/lib/format";
import { useUserSettings } from "@/components/settings/user-settings-provider";
import { cn } from "@/lib/utils";

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

/**
 * A point's timestamp, in `timeZone` when one is given.
 *
 * The zone is the exchange's, not the reader's. A day chart is a claim about
 * the market's own hours — "9:30 to 4" means nothing if a reader in Berlin is
 * shown a Tokyo session rendered against their own clock.
 *
 * The date itself always reads in en-US order ("Sep 2") regardless of
 * `format` — only the clock, where a 24-hour reader is genuinely misread as
 * AM/PM rather than just differently punctuated, follows it.
 */
function formatStamp(
  time: number,
  spanSeconds: number,
  format: NumberFormat,
  timeZone?: string,
  // Week's own span is several days, past the point where the heuristic
  // below would show a time on its own — but its candles are still
  // intraday, so which one a reader is on is still worth naming.
  showTime = false,
) {
  const date = new Date(time * 1000);
  // Inside a couple of days the clock time is what distinguishes two points;
  // beyond that the calendar date is.
  if (showTime || spanSeconds < 3 * 24 * 3600) {
    const datePart = date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone,
    });
    const timePart = date.toLocaleTimeString(localeFor(format), {
      hour: "numeric",
      minute: "2-digit",
      timeZone,
    });
    return `${datePart}, ${timePart}`;
  }
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone,
  });
}

/** Clock time alone, in the exchange's zone — what the day axis ticks in. */
function formatClock(time: number, timeZone: string, format: NumberFormat) {
  return new Date(time * 1000).toLocaleTimeString(localeFor(format), {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
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

/**
 * The price axis is drawn here rather than by lightweight-charts.
 *
 * The overlay has to know exactly where the top gridline is — the scrub rule
 * stops on it and the price sits above it — and the library exposes no way to
 * ask. Inferring it from the scale margins failed in both directions: the
 * rule fell short of the line on some stocks and the price landed under it on
 * others, because where a round tick falls inside the headroom depends on how
 * near the range happens to run to that round number. So the ticks are chosen
 * here, the range is pinned to them, and the library is left to draw only the
 * series itself.
 */

/** Steps the axis may tick in, before scaling by a power of ten. */
const TICK_STEPS = [1, 2, 2.5, 5];

/** Roughly how many gaps to divide the data's own range into. */
const TARGET_TICK_GAPS = 4;

/**
 * Where the top and bottom gridlines sit, as fractions of the plot. Held
 * just far enough off the edges that the top line still has room for the
 * price above it and its own label can never be clipped — the one thing this
 * axis exists to guarantee — and no further: every extra point of headroom
 * shrinks the price's own swing on screen, which is what made a real week of
 * movement read as a flat line next to the same week on a phone's stock app.
 * Fractions rather than pixels, so a short chart keeps the same proportions
 * as a tall one.
 */
const TOP_TICK_FRACTION = 0.08;
const BOTTOM_TICK_FRACTION = 0.03;

/** Gutter down the right for the price labels. */
const AXIS_WIDTH = 58;

type PriceScale = {
  /** Price at the top and bottom edges of the pane. */
  low: number;
  high: number;
  /** Every gridline, ascending. */
  ticks: number[];
  decimals: number;
};

function niceStep(range: number, gaps: number): number {
  const rough = range / gaps;
  if (!(rough > 0) || !Number.isFinite(rough)) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = TICK_STEPS.find((candidate) => candidate * magnitude >= rough);
  return (step ?? 10) * magnitude;
}

/**
 * Ticks bracketing the data, and the range that puts them at the fractions
 * above. Solved rather than guessed: with the top tick at `t` of the pane and
 * the bottom at `1 - b`, the span between them is `1 - t - b` of the whole,
 * which fixes the range outright.
 */
function computePriceScale(points: CandlePoint[]): PriceScale | null {
  if (points.length === 0) return null;

  let low = points[0].value;
  let high = points[0].value;
  for (const point of points) {
    if (point.value < low) low = point.value;
    if (point.value > high) high = point.value;
  }
  // A dead-flat series has no range to divide; give it one so the axis still
  // has somewhere to put its ticks.
  if (high - low < Number.EPSILON) {
    const pad = Math.max(Math.abs(high) * 0.01, 0.01);
    low -= pad;
    high += pad;
  }

  const step = niceStep(high - low, TARGET_TICK_GAPS);
  // Strictly outside the data, so the series never touches the outer lines.
  const topTick = (Math.floor(high / step) + 1) * step;
  const bottomTick = (Math.ceil(low / step) - 1) * step;

  const span = topTick - bottomTick;
  const range = span / (1 - TOP_TICK_FRACTION - BOTTOM_TICK_FRACTION);
  const highEdge = topTick + TOP_TICK_FRACTION * range;

  const count = Math.round(span / step);
  const ticks = Array.from({ length: count + 1 }, (_, i) => bottomTick + i * step);

  return {
    low: highEdge - range,
    high: highEdge,
    ticks,
    decimals: step >= 1 ? 2 : Math.min(6, Math.ceil(-Math.log10(step)) + 1),
  };
}

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
  session,
  range,
}: {
  points: CandlePoint[];
  positive: boolean;
  height?: number;
  /** Set on a day chart to pin the axis to that market's trading session. */
  session?: TradingSession;
  /**
   * Which of the range tabs this is. Month, Year and 5Y draw their own axis
   * labels (see `axisTicks` below) rather than trusting the library's own
   * tick placement, which spaces itself out by pixel width and skips
   * whichever points don't land on a "nice" interval.
   */
  range?: CandleRange;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const pointsRef = useRef(points);
  const measureRef = useRef<Measure | null>(null);
  const hoverRef = useRef<MeasurePoint | null>(null);
  const pointerXRef = useRef<number | null>(null);
  const hoveringRef = useRef(false);
  /** Leading whitespace count, so screen positions map back to real points. */
  const offsetRef = useRef(0);
  const afterHoursRef = useRef<number | null>(null);
  /** This range's own axis ticks, read back by the resize handler. */
  const axisTicksRef = useRef<AxisTick[]>([]);
  /** Only on Week: fractional indices the resize handler reads back. */
  const weekGapsRef = useRef<number[]>([]);

  const [measure, setMeasureState] = useState<Measure | null>(null);
  const [hover, setHoverState] = useState<MeasurePoint | null>(null);
  /** Each gridline's price paired with where it currently sits, in pixels. */
  const [axis, setAxis] = useState<{ price: number; y: number }[]>([]);
  /** Height of the library's time axis strip, at the bottom of the plot. */
  const [timeAxisHeight, setTimeAxisHeight] = useState(0);
  /** This range's own time-axis labels, positioned in pixels. */
  const [timeTicks, setTimeTicks] = useState<
    { x: number; label: string; bold: boolean }[]
  >([]);
  /** Only on Week: where each "Weekend" note sits, in pixels. */
  const [weekendMarkers, setWeekendMarkers] = useState<{ x: number }[]>([]);
  /** Where the after-hours stretch sits, in pixels. */
  const [band, setBand] = useState<{ x: number; width: number } | null>(null);
  const coarsePointer = useCoarsePointer();
  const { resolvedTheme } = useTheme();
  const { settings } = useUserSettings();

  const scale = useMemo(() => computePriceScale(points), [points]);
  // Read back by the library's autoscale callback and by the resize handler,
  // both of which run outside render. Kept in step in the chart effect below,
  // which rebuilds whenever the scale changes.
  const scaleRef = useRef(scale);

  /**
   * Week, Month, Year and 5Y each draw their own axis instead of trusting
   * the library's own tick placement — see chart-axis-ticks.ts for why. Day
   * keeps the library's axis (formatted to the exchange's clock below); All
   * is unchanged.
   */
  const axisTicks = useMemo(() => {
    switch (range) {
      case "1W":
        return weekRangeTicks(points);
      case "1M":
        return monthRangeTicks(points);
      case "1Y":
        return yearRangeTicks(points);
      case "5Y":
        return fiveYearRangeTicks(points);
      default:
        return null;
    }
  }, [points, range]);

  /** Only on Week: the calendar-day gaps a "Weekend" note anchors to. */
  const weekGaps = useMemo(
    () => (range === "1W" ? weekendGaps(points) : []),
    [points, range],
  );

  /**
   * Ticks are positioned through the library's own price mapping rather than
   * from the pane height, so the gridlines cannot drift away from the series
   * drawn against them.
   */
  const refreshAxis = useCallback(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    const current = scaleRef.current;
    if (!series || !chart || !current) return;

    const timeScale = chart.timeScale();
    const axisHeight = timeScale.height();
    setTimeAxisHeight((previous) =>
      previous === axisHeight ? previous : axisHeight,
    );

    // The band is pinned to a position on the scale, so it travels with every
    // resize exactly as the gridlines do.
    const bandIndex = afterHoursRef.current;
    const plotWidth = containerRef.current?.clientWidth ?? 0;
    const bandX =
      bandIndex === null ? null : timeScale.logicalToCoordinate(bandIndex as Logical);
    const nextBand =
      bandX === null || plotWidth <= 0
        ? null
        : { x: bandX, width: Math.max(0, plotWidth - bandX) };
    setBand((previous) =>
      previous?.x === nextBand?.x && previous?.width === nextBand?.width
        ? previous
        : nextBand,
    );

    // This range's own axis labels, same as the band above: pinned to a
    // position on the scale rather than to a pixel, so they travel with
    // every resize instead of drifting off the point they belong to.
    const offset = offsetRef.current;
    const nextTicks: { x: number; label: string; bold: boolean }[] = [];
    for (const tick of axisTicksRef.current) {
      const x = timeScale.logicalToCoordinate((tick.index + offset) as Logical);
      if (x !== null) nextTicks.push({ x, label: tick.label, bold: tick.bold });
    }
    setTimeTicks((previous) =>
      previous.length === nextTicks.length &&
      previous.every(
        (t, i) =>
          t.x === nextTicks[i].x &&
          t.label === nextTicks[i].label &&
          t.bold === nextTicks[i].bold,
      )
        ? previous
        : nextTicks,
    );

    // Only on Week: the library maps whole indices to pixels, not the
    // midpoint directly, so the marker sits halfway between Friday's close
    // and Monday's open in pixels rather than at a fractional logical index.
    const nextWeekendMarkers: { x: number }[] = [];
    for (const gap of weekGapsRef.current) {
      const before = timeScale.logicalToCoordinate((gap + offset) as Logical);
      const after = timeScale.logicalToCoordinate((gap + 1 + offset) as Logical);
      if (before !== null && after !== null) {
        nextWeekendMarkers.push({ x: (before + after) / 2 });
      }
    }
    setWeekendMarkers((previous) =>
      previous.length === nextWeekendMarkers.length &&
      previous.every((m, i) => m.x === nextWeekendMarkers[i].x)
        ? previous
        : nextWeekendMarkers,
    );

    const next: { price: number; y: number }[] = [];
    for (const price of current.ticks) {
      const y = series.priceToCoordinate(price);
      if (y !== null) next.push({ price, y });
    }

    // Resizing fires in a stream; only a real move is worth a render.
    setAxis((previous) =>
      previous.length === next.length &&
      previous.every((tick, i) => tick.y === next[i].y)
        ? previous
        : next,
    );
  }, []);

  // Interaction handlers live outside React's render cycle, so the ref is the
  // source of truth and state only drives the overlay.
  const setMeasure = useCallback((next: Measure | null) => {
    measureRef.current = next;
    setMeasureState(next);
  }, []);

  const setHover = useCallback((next: MeasurePoint | null) => {
    // The pointer moves far more often than it crosses from one data point to
    // the next, so most moves are not worth a render.
    const current = hoverRef.current;
    if (next === null && current === null) return;
    if (next && current && next.index === current.index) return;
    hoverRef.current = next;
    setHoverState(next);
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

    const offset = offsetRef.current;
    const index = Math.max(
      0,
      Math.min(data.length - 1, Math.round(logical as number) - offset),
    );
    const point = data[index];
    const snappedX = chart
      .timeScale()
      .logicalToCoordinate((index + offset) as Logical);

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
    const offset = offsetRef.current;
    const path: { x: number; y: number }[] = [];
    // A five-year daily series is well over a thousand points, and this runs on
    // every touchmove. Past a few hundred the extra vertices are sub-pixel.
    const step = Math.max(1, Math.ceil((toIndex - fromIndex + 1) / 400));

    for (let index = fromIndex; index <= toIndex; index += step) {
      const x = timeScale.logicalToCoordinate((index + offset) as Logical);
      const y = series.priceToCoordinate(data[index].value);
      if (x !== null && y !== null) path.push({ x, y });
    }

    // Stepping can stop short of the far end, which would leave the highlight
    // visibly detached from the point the reader is touching.
    const endX = timeScale.logicalToCoordinate((toIndex + offset) as Logical);
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
    // The clock is read here rather than in render: it is impure, and the
    // axis should settle once per rebuild instead of creeping between paints.
    const timeline = buildTimeline(
      points,
      session,
      Math.floor(Date.now() / 1000),
    );
    // Before the chart exists, so the first autoscale call already sees it.
    scaleRef.current = scale;
    offsetRef.current = timeline.offset;
    afterHoursRef.current = timeline.afterHoursIndex;
    axisTicksRef.current = axisTicks ?? [];
    weekGapsRef.current = weekGaps;
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
      // Grid and price axis are drawn by this component instead; see the note
      // above computePriceScale.
      grid: {
        horzLines: { visible: false },
        vertLines: { visible: false },
      },
      rightPriceScale: {
        visible: false,
        // No margins: the range already carries its own headroom, and a
        // second one applied on top would move the ticks off their fractions.
        scaleMargins: { top: 0, bottom: 0 },
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        // A day chart belongs to one market, so its ticks read in that
        // market's hours; the library places and spaces them, this only
        // changes how each one is written. Week, Month, Year and 5Y draw
        // their own labels instead (below), so the library's are blanked
        // rather than left to double up with them — Week also carries a
        // `session` (its leading pad to 9 AM), so this checks the range
        // itself rather than inferring Day from session's presence. All is
        // unchanged.
        ...(range === "1D" && session
          ? {
              tickMarkFormatter: (time: UTCTimestamp) =>
                formatClock(time as number, session.timeZone, settings.numberFormat),
            }
          : axisTicks
            ? { tickMarkFormatter: () => "" }
            : {}),
      },
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
      // The range is dictated here so the gridlines drawn over the series land
      // exactly where this component put them.
      autoscaleInfoProvider: () => {
        const current = scaleRef.current;
        return current
          ? { priceRange: { minValue: current.low, maxValue: current.high } }
          : null;
      },
    });
    seriesRef.current = series;

    series.setData(timeline.data);

    // fitContent rather than a time range: the blanks already carry the axis
    // out to the session's edges, so fitting them is fitting the session.
    chart.timeScale().fitContent();
    refreshAxis();

    // The range is fixed in prices but not in pixels, so every resize moves
    // the gridlines.
    const observer = new ResizeObserver(() => refreshAxis());
    observer.observe(container);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      // A new series invalidates anything drawn over the old one.
      setMeasure(null);
      setHover(null);
    };
    // resolvedTheme is a dependency because the canvas colors are snapshotted
    // above — without it the chart keeps the old theme's palette.
  }, [
    points,
    positive,
    resolvedTheme,
    scale,
    session,
    range,
    axisTicks,
    weekGaps,
    settings.numberFormat,
    setMeasure,
    setHover,
    refreshAxis,
  ]);

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

    // A one-finger gesture is either a horizontal scrub or a vertical page
    // scroll. Which one is decided once, on the first few pixels of travel,
    // and then held for the rest of the gesture so it cannot flip mid-drag.
    let start: { x: number; y: number } | null = null;
    let gesture: "undecided" | "scrub" | "scroll" = "undecided";

    function endScrub() {
      start = null;
      if (gesture === "scrub") {
        setHover(null);
        setChartInteractive(true);
      }
      gesture = "undecided";
    }

    function handleStart(event: TouchEvent) {
      if (event.touches.length === 1) {
        // Swallow it so the chart's own one-finger pan never engages. No
        // preventDefault: a vertical swipe that happens to begin on the chart
        // still has to scroll the page.
        event.stopPropagation();
        start = { x: event.touches[0].clientX, y: event.touches[0].clientY };
        gesture = "undecided";
        return;
      }

      if (event.touches.length < 2) return;
      // Capture phase + stopPropagation keeps the chart's own pinch-zoom from
      // firing, and preventDefault keeps the browser from zooming the page.
      event.preventDefault();
      event.stopPropagation();
      endScrub();
      setHover(null);
      setChartInteractive(false);
      apply(event);
    }

    function handleMove(event: TouchEvent) {
      if (event.touches.length >= 2) {
        if (!measureRef.current) return;
        event.preventDefault();
        event.stopPropagation();
        apply(event);
        return;
      }

      if (event.touches.length !== 1 || !start || measureRef.current) return;
      const touch = event.touches[0];

      if (gesture === "undecided") {
        const dx = Math.abs(touch.clientX - start.x);
        const dy = Math.abs(touch.clientY - start.y);
        // Too little travel to read the intent yet.
        if (dx < 8 && dy < 8) return;
        gesture = dx > dy ? "scrub" : "scroll";
        if (gesture === "scrub") setChartInteractive(false);
      }

      if (gesture !== "scrub") return;
      event.preventDefault();
      event.stopPropagation();
      setHover(resolveAt(xIn(touch)));
    }

    function handleEnd(event: TouchEvent) {
      if (event.touches.length === 0) endScrub();
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
  }, [measureBetween, resolveAt, setHover, setMeasure, setChartInteractive]);

  // ---- Desktop: hover reads the price, Shift pins an anchor to compare ----
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // Skipped on touch devices: a tap there synthesises a mousemove with no
    // matching mouseleave, which would strand the hover marker on the plot.
    if (coarsePointer) return;

    // The pinned end, kept separately from `measure` so that re-ordering the
    // two ends by time never drags the anchor along with the cursor.
    let anchorX: number | null = null;

    function handleMouseMove(event: MouseEvent) {
      const rect = container!.getBoundingClientRect();
      const x = event.clientX - rect.left;
      pointerXRef.current = x;
      hoveringRef.current = true;

      if (measureRef.current?.source === "shift" && anchorX !== null) {
        const next = measureBetween(anchorX, x, "shift");
        if (next) setMeasure(next);
        return;
      }

      // Plain hover reads out the price under the cursor. A measurement in
      // progress already says more than that, so it wins.
      if (measureRef.current) return;
      setHover(resolveAt(x));
    }

    function handleMouseLeave() {
      hoveringRef.current = false;
      pointerXRef.current = null;
      setHover(null);
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
        setHover(null);
        setMeasure(next);
      }
    }

    function handleKeyUp(event: KeyboardEvent) {
      if (event.key !== "Shift") return;
      if (measureRef.current?.source !== "shift") return;
      anchorX = null;
      setMeasure(null);
      setChartInteractive(true);
      // The cursor never left the plot, so fall back to the hover readout.
      if (hoveringRef.current && pointerXRef.current !== null) {
        setHover(resolveAt(pointerXRef.current));
      }
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
  }, [
    coarsePointer,
    measureBetween,
    resolveAt,
    setHover,
    setMeasure,
    setChartInteractive,
  ]);

  const diff = measure ? measure.b.value - measure.a.value : 0;
  const diffPercent =
    measure && measure.a.value !== 0 ? (diff / measure.a.value) * 100 : 0;
  const diffPositive = diff >= 0;
  const spanSeconds = measure ? measure.b.time - measure.a.time : 0;

  // A single hovered point has no span of its own, so the stamp's precision
  // comes from how much time the whole chart covers.
  const seriesSpan =
    points.length > 1 ? points[points.length - 1].time - points[0].time : 0;

  // The top gridline, which the scrub rules stop on and the price sits above.
  // Its fraction is fixed by the scale, so there is always room for both.
  const topTickY = axis.length > 0 ? axis[axis.length - 1].y : null;
  const ruleTop = topTickY ?? `${TOP_TICK_FRACTION * 100}%`;
  const priceLabelTop = (topTickY ?? 0) - 6;

  // The bottom gridline — `axis` ascends by price, so the first entry is the
  // lowest price and, on screen, the lowest line. The after-hours rule is
  // drawn on this exact pixel rather than a fixed offset from the pane's
  // edge, so the two lines read as one instead of sitting a hair apart.
  const bottomTickY = axis.length > 0 ? axis[0].y : null;

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
      {/* Top-aligned rather than centred so the date sits at the same height
          whether or not a second line of figures follows it. */}
      <div
        className="flex flex-col items-center justify-start overflow-hidden text-center"
        style={{ height: HEADER_HEIGHT }}
      >
        {/* Dates only. The figures sit down on the plot, level with the price
            a plain hover reads out. */}
        {measure && (
          <p className="num text-[13px] whitespace-nowrap text-muted-foreground">
            {formatStamp(
              measure.a.time,
              spanSeconds,
              settings.numberFormat,
              session?.timeZone,
              range === "1W",
            )}{" "}
            –{" "}
            {formatStamp(
              measure.b.time,
              spanSeconds,
              settings.numberFormat,
              session?.timeZone,
              range === "1W",
            )}{" "}
            · {formatSpan(spanSeconds)}
          </p>
        )}

        {/* Only the date here — the price rides the vertical line instead, so
            it stays next to the point it belongs to. Week is the exception:
            its axis reads in bare dates now, so the hour has nowhere else to
            show, and its candles are intraday enough that which one a reader
            is on is still worth naming. */}
        {!measure && hover && (
          <p className="num text-[13px] whitespace-nowrap text-muted-foreground">
            {formatStamp(
              hover.time,
              seriesSpan,
              settings.numberFormat,
              session?.timeZone,
              range === "1W",
            )}
          </p>
        )}
      </div>

      <div
        className="relative w-full select-none"
        // Horizontal drags are the scrub gesture and must not scroll the page;
        // vertical ones still belong to the page.
        style={{
          height: Math.max(0, height - HEADER_HEIGHT - CAPTION_HEIGHT),
          touchAction: "pan-y",
        }}
        data-measuring={measure ? "true" : undefined}
      >
        {/* Price labels live in a gutter down the right. */}
        <div
          className="pointer-events-none absolute inset-y-0 right-0"
          style={{ width: AXIS_WIDTH }}
        >
          {axis.map(({ price, y }) => (
            <span
              key={price}
              className="num absolute right-0 -translate-y-1/2 text-[11px] text-muted-foreground"
              style={{ top: y }}
            >
              {price.toFixed(scale?.decimals ?? 2)}
            </span>
          ))}
        </div>

        {/* The plot proper, inset by the gutter so it and every overlay drawn
            over it share one coordinate box. */}
        <div
          className="absolute inset-y-0 left-0"
          style={{ right: AXIS_WIDTH }}
        >
        {/* Behind the series: the chart's own canvas is transparent, and the
            grid belongs under the line rather than over it. */}
        <svg className="absolute inset-0 size-full" aria-hidden="true">
          {axis.map(({ price, y }) => (
            <line
              key={price}
              x1={0}
              x2="100%"
              y1={y}
              y2={y}
              className="stroke-foreground/10"
              strokeWidth={1}
            />
          ))}
        </svg>

        {/* After hours, marked behind the series: a divider at the closing
            bell and, riding the bottom gridline itself, a labelled rule for
            the stretch that follows it — thickening that one line rather
            than drawing a second one a few pixels off it. */}
        {band && (
          <div
            className="pointer-events-none absolute inset-x-0 top-0"
            style={{ paddingLeft: band.x, bottom: timeAxisHeight }}
          >
            <div className="relative size-full border-l border-dashed border-foreground/20">
              {bottomTickY !== null && (
                <div
                  className="absolute inset-x-0 flex -translate-y-1/2 items-center gap-2 px-2"
                  style={{ top: bottomTickY }}
                >
                  <span
                    className="h-px flex-1 bg-foreground/20"
                    aria-hidden="true"
                  />
                  {band.width > 92 && (
                    // The rule's own two spans already stop short of this
                    // label, but the gridline it rides does not know it is
                    // there — it runs straight through regardless of where
                    // the axis happens to tick. The card's own background
                    // masks whatever crosses underneath, exactly as the gap
                    // in the rule masks the rule's own two halves.
                    <span className="rounded-full bg-card px-1.5 text-[10px] whitespace-nowrap text-muted-foreground">
                      After hours
                    </span>
                  )}
                  <span
                    className="h-px flex-1 bg-foreground/20"
                    aria-hidden="true"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        <div ref={containerRef} className="absolute inset-0" />

        {/* This range's own axis labels, standing in for the library's own
            (blanked above) — see chart-axis-ticks.ts for why. The first and
            last labels anchor to their own edge rather than centering, the
            same accommodation the library's own ticks make, so neither one
            clips against the price gutter or the left edge of the plot. */}
        {axisTicks && (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0"
            style={{ height: timeAxisHeight }}
          >
            {timeTicks.map((tick, index) => (
              <span
                key={index}
                className={cn(
                  "num absolute text-[11px] whitespace-nowrap text-muted-foreground",
                  tick.bold && "font-semibold",
                )}
                style={{
                  left: tick.x,
                  top: "50%",
                  transform:
                    index === 0
                      ? "translateY(-50%)"
                      : index === timeTicks.length - 1
                        ? "translateY(-50%) translateX(-100%)"
                        : "translateY(-50%) translateX(-50%)",
                }}
              >
                {tick.label}
              </span>
            ))}
          </div>
        )}

        {/* Only on Week: rides the bottom gridline rather than the date row
            below the plot, so a "Weekend" pill never lands close enough to a
            date tick to crowd or cover it. A gap in the plotted line already
            marks the weekend itself — bars are spaced by position, not
            elapsed time, so nothing else would — this just names what the
            gap is, for a reader new enough to wonder why Friday jumps
            straight to Monday. */}
        {bottomTickY !== null &&
          weekendMarkers.map((marker, index) => (
            <span
              key={index}
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-card px-1.5 text-[10px] whitespace-nowrap text-muted-foreground"
              style={{ left: marker.x, top: bottomTickY }}
            >
              Weekend
            </span>
          ))}

        {!measure && hover && (
          <div className="pointer-events-none absolute inset-0 z-10">
            <svg className="size-full" aria-hidden="true">
              <line
                x1={hover.x}
                x2={hover.x}
                y1={ruleTop}
                y2="100%"
                className="stroke-foreground/25"
                strokeWidth={1}
              />
              {hover.y !== null && (
                <circle
                  cx={hover.x}
                  cy={hover.y}
                  r={5}
                  className={
                    positive
                      ? "fill-gain stroke-background"
                      : "fill-loss stroke-background"
                  }
                  strokeWidth={2}
                />
              )}
            </svg>

            {/* Sits loose just above the top of the rule and rides it. Clamped
                in CSS rather than against a measured width so it needs no
                resize plumbing — 40px clears half of the widest price this
                realistically holds. */}
            <div
              className="num absolute -translate-x-1/2 -translate-y-full text-sm font-semibold whitespace-nowrap"
              style={{
                top: priceLabelTop,
                left: `clamp(40px, ${hover.x}px, calc(100% - 40px))`,
              }}
            >
              ${hover.value.toFixed(2)}
            </div>
          </div>
        )}

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
                  y1={ruleTop}
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

            {/* Set like the hover price — same face, size and weight, same
                `top` and translate — so the readout does not shift between
                the two modes. */}
            <div
              className={
                "num absolute left-1/2 flex -translate-x-1/2 -translate-y-full items-baseline gap-6 text-sm font-semibold whitespace-nowrap " +
                (diffPositive ? "text-gain" : "text-loss")
              }
              style={{ top: priceLabelTop }}
            >
              <span>
                {diffPositive ? "+" : "−"}${Math.abs(diff).toFixed(2)}
              </span>
              <span>
                {diffPositive ? "+" : "−"}
                {Math.abs(diffPercent).toFixed(2)}%
              </span>
            </div>
          </div>
        )}
        </div>
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
