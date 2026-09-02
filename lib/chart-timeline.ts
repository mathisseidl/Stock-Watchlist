import type {
  AreaData,
  UTCTimestamp,
  WhitespaceData,
} from "lightweight-charts";
import type { CandlePoint, TradingSession } from "@/lib/market-data/types";

/** The interval the series was sampled at, as its median gap. */
export function sampleStep(points: CandlePoint[]): number {
  if (points.length < 2) return 60;
  const gaps: number[] = [];
  for (let i = 1; i < points.length; i += 1) {
    const gap = points[i].time - points[i - 1].time;
    if (gap > 0) gaps.push(gap);
  }
  if (gaps.length === 0) return 60;
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)];
}

export type SeriesItem = AreaData<UTCTimestamp> | WhitespaceData<UTCTimestamp>;

export type Timeline = {
  /** What the series is fed: the real points, padded out to the session. */
  data: SeriesItem[];
  /** Whitespace slots before the first real point, for index translation. */
  offset: number;
  /** Where the after-hours stretch starts in `data`, or null if none shows. */
  afterHoursIndex: number | null;
};

/**
 * The series padded with blanks so the axis spans the whole trading session
 * rather than only the hours that happen to have prices.
 *
 * lightweight-charts spaces bars by position, not by clock time, so an axis
 * cannot simply be told to run from the open to the close — the span has to
 * exist as data. Blank slots at the session's sample interval give the scale
 * something to measure against without drawing anything.
 *
 * The right edge stops at the current time while the day is still running, so
 * an afternoon chart is not mostly empty axis waiting for hours that have not
 * happened yet. Once the session is over it settles on the session's end.
 */
export function buildTimeline(
  points: CandlePoint[],
  session: TradingSession | undefined,
  now: number,
): Timeline {
  const data: SeriesItem[] = points.map((point) => ({
    time: point.time as UTCTimestamp,
    value: point.value,
  }));
  if (!session || points.length === 0) {
    return { data, offset: 0, afterHoursIndex: null };
  }

  const step = sampleStep(points);
  const first = points[0].time;
  const last = points[points.length - 1].time;
  const rightEdge = Math.min(session.end, Math.max(now, last));

  const lead: SeriesItem[] = [];
  for (let time = first - step; time >= session.start; time -= step) {
    lead.unshift({ time: time as UTCTimestamp });
  }

  const tail: SeriesItem[] = [];
  for (let time = last + step; time <= rightEdge; time += step) {
    tail.push({ time: time as UTCTimestamp });
  }
  // Stepping by the sample interval rarely divides the session evenly, which
  // would leave the axis stopping a few minutes short of the close. One more
  // slot on the edge itself makes the chart end where the session does.
  const lastSlot = (tail.at(-1)?.time as number | undefined) ?? last;
  if (lastSlot < rightEdge) {
    tail.push({ time: rightEdge as UTCTimestamp });
  }

  const all = [...lead, ...data, ...tail];

  // Only mark the stretch once the clock has actually reached it; before the
  // close there is nothing out there to label.
  const found =
    session.hasAfterHours && rightEdge > session.regularEnd
      ? all.findIndex((item) => (item.time as number) >= session.regularEnd)
      : -1;

  return {
    data: all,
    offset: lead.length,
    afterHoursIndex: found === -1 ? null : found,
  };
}
