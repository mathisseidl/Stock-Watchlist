import type { CandlePoint } from "@/lib/market-data/types";

export type AxisTick = { index: number; label: string };

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
 * Every point gets a label instead: the day number, or the month's name on
 * the day that starts it.
 */
export function monthRangeTicks(points: CandlePoint[]): AxisTick[] {
  let prevMonth = -1;
  return points.map((point, index) => {
    const { month, day } = dateParts(point.time);
    const label = month === prevMonth ? String(day) : MONTH_ABBR[month];
    prevMonth = month;
    return { index, label };
  });
}

/**
 * One tick per calendar month — every month gets a label, rather than the
 * subset the library's own weighting happens to keep. The year stands in for
 * the label at January, the same way a year tick already reads standing in
 * for "Jan" in the library's own convention.
 */
export function yearRangeTicks(points: CandlePoint[]): AxisTick[] {
  const ticks: AxisTick[] = [];
  let prevMonth = -1;
  points.forEach((point, index) => {
    const { month, year } = dateParts(point.time);
    if (month === prevMonth) return;
    prevMonth = month;
    ticks.push({ index, label: month === 0 ? String(year) : MONTH_ABBR[month] });
  });
  return ticks;
}

/**
 * One tick per calendar year, plus a deterministic July tick at the midpoint
 * of each one. The library's own weighting picks a single recurring month by
 * its own heuristic — which one can shift as the data changes — so this
 * fixes it to July outright rather than whatever the library lands on.
 */
export function fiveYearRangeTicks(points: CandlePoint[]): AxisTick[] {
  const ticks: AxisTick[] = [];
  let prevYear = -1;
  let julyMarkedFor = -1;
  points.forEach((point, index) => {
    const { month, year } = dateParts(point.time);
    if (year !== prevYear) {
      prevYear = year;
      ticks.push({ index, label: String(year) });
    }
    if (month === 6 && julyMarkedFor !== year) {
      julyMarkedFor = year;
      ticks.push({ index, label: "Jul" });
    }
  });
  return ticks;
}
