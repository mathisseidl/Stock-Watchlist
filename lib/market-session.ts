export type Session = "pre" | "open" | "after" | "closed";

export const SESSION_LABELS: Record<Session, string> = {
  pre: "Pre-market",
  open: "Market open",
  after: "After hours",
  closed: "Market closed",
};

/**
 * Which US market session a moment falls in, evaluated in exchange time so the
 * answer is the same wherever the reader is. Regular hours are 09:30–16:00 ET,
 * with pre-market from 04:00 and after-hours to 20:00.
 *
 * Exchange holidays are not accounted for: on those days this reads "open"
 * while the tape is actually still. That is why quotes carry their own
 * timestamp rather than relying on this alone.
 */
export function marketSession(now: Date): Session {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";

  const weekday = get("weekday");
  if (weekday === "Sat" || weekday === "Sun") return "closed";

  // Intl can render midnight as "24" in the hour-cycle used here.
  const hour = Number(get("hour")) % 24;
  const minutes = hour * 60 + Number(get("minute"));

  if (minutes >= 9 * 60 + 30 && minutes < 16 * 60) return "open";
  if (minutes >= 4 * 60 && minutes < 9 * 60 + 30) return "pre";
  if (minutes >= 16 * 60 && minutes < 20 * 60) return "after";
  return "closed";
}

/** Exchange-local clock, e.g. "10:42". */
export function exchangeTime(now: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(now);
}
