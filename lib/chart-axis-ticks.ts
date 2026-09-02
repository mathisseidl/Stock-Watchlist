import type { CandlePoint } from "@/lib/market-data/types";

export type AxisTick = {
  index: number;
  label: string;
  /** Whether this tick reads as the more prominent unit on its axis. */
  bold: boolean;
};

const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * No `timeZone` is passed here, matching `formatStamp`'s own fallback for
 * every range but the day chart — these are calendar dates read from daily
 * or weekly candles, not intraday points a reader would place against a
 * market's clock, so the browser's local zone is the right one to read them
 * in, same as the hover and measurement stamps already do.
 */
function dateParts(time: number) {
  const date = new Date(time * 1000);
  return { month: date.getMonth(), year: date.getFullYear(), day: date.getDate() };
}

/**
 * One tick per trading day — the library's own auto-placed ticks space
 * themselves out by pixel width and skip whichever days don't land on a
 * "nice" interval, which is what leaves the end of a month looking gapped.
 * Every day gets a label instead (its own first point, not every point in
 * it — the chart is intraday now, and one tick per candle would crowd the
 * axis with dozens of duplicates a day): the day number, or the month's name
 * on the day that starts it. Every label carries equal weight, so all of
 * them are bold.
 */
export function monthRangeTicks(points: CandlePoint[]): AxisTick[] {
  const ticks: AxisTick[] = [];
  let prevMonth = -1;
  let prevDay = -1;
  points.forEach((point, index) => {
    const { month, day } = dateParts(point.time);
    if (day === prevDay && month === prevMonth) return;
    const label = month === prevMonth ? String(day) : MONTH_ABBR[month];
    prevMonth = month;
    prevDay = day;
    ticks.push({ index, label, bold: true });
  });
  return ticks;
}

/**
 * One tick per calendar month — every month gets a label, rather than the
 * subset the library's own weighting happens to keep. The year stands in for
 * the label at January, the same way a year tick already reads standing in
 * for "Jan" in the library's own convention. Every label carries equal
 * weight, so all of them are bold.
 */
export function yearRangeTicks(points: CandlePoint[]): AxisTick[] {
  const ticks: AxisTick[] = [];
  let prevMonth = -1;
  points.forEach((point, index) => {
    const { month, year } = dateParts(point.time);
    if (month === prevMonth) return;
    prevMonth = month;
    ticks.push({
      index,
      label: month === 0 ? String(year) : MONTH_ABBR[month],
      bold: true,
    });
  });
  return ticks;
}

/**
 * One tick per calendar year, plus a deterministic July tick at the midpoint
 * of each one. The library's own weighting picks a single recurring month by
 * its own heuristic — which one can shift as the data changes — so this
 * fixes it to July outright rather than whatever the library lands on. Only
 * the year reads as the axis's primary unit here, so only the year is bold —
 * July is context for it, not a peer.
 */
export function fiveYearRangeTicks(points: CandlePoint[]): AxisTick[] {
  const ticks: AxisTick[] = [];
  let prevYear = -1;
  let julyMarkedFor = -1;
  points.forEach((point, index) => {
    const { month, year } = dateParts(point.time);
    if (year !== prevYear) {
      prevYear = year;
      ticks.push({ index, label: String(year), bold: true });
    }
    if (month === 6 && julyMarkedFor !== year) {
      julyMarkedFor = year;
      ticks.push({ index, label: "Jul", bold: false });
    }
  });
  return ticks;
}

/**
 * One tick per calendar day — the week chart has only a handful of trading
 * days on screen, so unlike Month there is room to name each one outright
 * ("Aug 27") rather than leaning on a month-boundary label plus bare day
 * numbers. The month is repeated only where the week actually crosses one.
 * Every label carries equal weight, so all of them are bold.
 */
export function weekRangeTicks(points: CandlePoint[]): AxisTick[] {
  const ticks: AxisTick[] = [];
  let prevMonth = -1;
  let prevDay = -1;
  points.forEach((point, index) => {
    const { month, day } = dateParts(point.time);
    if (day === prevDay && month === prevMonth) return;
    const label =
      month === prevMonth ? String(day) : `${MONTH_ABBR[month]} ${day}`;
    prevMonth = month;
    prevDay = day;
    ticks.push({ index, label, bold: true });
  });
  return ticks;
}

/** Real elapsed time between two candles wide enough to call out as a gap. */
const GAP_THRESHOLD_SECONDS = 24 * 3600;

/**
 * Wherever consecutive candles are further apart than a normal overnight
 * gap — Friday's close to Monday's open, mainly, in a five-day window — the
 * index just before the gap. Bars are spaced by position rather than by
 * elapsed time, so nothing about the plot itself marks a weekend; this is
 * what a "Weekend" note anchors to instead, sitting midway between this
 * index's pixel and the next one's (the library maps only whole indices to
 * pixels, not the halfway point directly).
 */
export function weekendGaps(points: CandlePoint[]): number[] {
  const gaps: number[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    if (points[i + 1].time - points[i].time > GAP_THRESHOLD_SECONDS) {
      gaps.push(i);
    }
  }
  return gaps;
}
