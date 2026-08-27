import {
  MARKET_CLOSURES,
  MARKET_EARLY_CLOSES,
  HOLIDAY_TABLE_THROUGH,
} from "./market-holidays";

export type Session = "pre" | "open" | "after" | "closed" | "holiday";

export const SESSION_LABELS: Record<Session, string> = {
  pre: "Pre-market",
  open: "Market open",
  after: "After hours",
  closed: "Market closed",
  holiday: "Closed for the holiday",
};

/** Exchange-local calendar day as YYYY-MM-DD. */
function exchangeDate(now: Date): string {
  // en-CA formats as YYYY-MM-DD, which is what the holiday table uses.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function exchangeParts(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return {
    weekday: get("weekday"),
    // Intl can render midnight as "24" in the hour cycle used here.
    minutes: (Number(get("hour")) % 24) * 60 + Number(get("minute")),
  };
}

/**
 * Which US market session a moment falls in, evaluated in exchange time so the
 * answer is the same wherever the reader is. Regular hours are 09:30–16:00 ET,
 * with pre-market from 04:00 and after-hours to 20:00, and a 13:00 close on
 * the exchange's half-days.
 *
 * Exchange holidays come from a table that runs through 2036; past that the
 * session falls back to weekday hours. Unscheduled closures (a hurricane, a
 * national day of mourning) are not predictable and are not covered.
 */
export function marketSession(now: Date): Session {
  const date = exchangeDate(now);
  if (MARKET_CLOSURES.has(date)) return "holiday";

  const { weekday, minutes } = exchangeParts(now);
  if (weekday === "Sat" || weekday === "Sun") return "closed";

  // Half-days stop at 13:00 instead of 16:00.
  const close = MARKET_EARLY_CLOSES.has(date) ? 13 * 60 : 16 * 60;

  if (minutes >= 9 * 60 + 30 && minutes < close) return "open";
  if (minutes >= 4 * 60 && minutes < 9 * 60 + 30) return "pre";
  if (minutes >= close && minutes < 20 * 60) return "after";
  return "closed";
}

/** True once the calendar runs out and holidays stop being accounted for. */
export function holidayTableExpired(now: Date): boolean {
  return Number(exchangeDate(now).slice(0, 4)) > HOLIDAY_TABLE_THROUGH;
}

/** Whether the exchange closes early on this date. */
export function isEarlyClose(now: Date): boolean {
  return MARKET_EARLY_CLOSES.has(exchangeDate(now));
}

/** Exchange-local clock, e.g. "10:42". */
export function exchangeTime(now: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(now);
}
