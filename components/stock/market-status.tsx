"use client";

import { useSyncExternalStore } from "react";
import {
  marketSession,
  exchangeTime,
  isEarlyClose,
  SESSION_LABELS,
  type Session,
} from "@/lib/market-session";
import { cn } from "@/lib/utils";

const TICK_MS = 30_000;

/**
 * Green while regular hours are running, amber for the pre-market and
 * after-hours sessions, red once the exchange is shut.
 */
const DOT: Record<Session, string> = {
  open: "bg-gain",
  pre: "bg-amber-500",
  after: "bg-amber-500",
  closed: "bg-loss",
  holiday: "bg-loss",
};

function subscribe(onChange: () => void) {
  const timer = setInterval(onChange, TICK_MS);
  return () => clearInterval(timer);
}

/** Bucketed so the snapshot is stable between renders within the same tick. */
function getSnapshot() {
  return Math.floor(Date.now() / TICK_MS);
}

/** No clock on the server — the status renders after hydration instead. */
function getServerSnapshot(): number | null {
  return null;
}

export function MarketStatus({ className }: { className?: string }) {
  const tick = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Rendered only after hydration: the session depends on the clock, and the
  // server's answer would hydrate into a mismatch.
  if (tick === null) return null;

  const now = new Date(tick * TICK_MS);
  const session = marketSession(now);
  const label =
    SESSION_LABELS[session] +
    (session === "open" && isEarlyClose(now) ? " · closes 1 PM" : "");

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-xs font-medium",
        className,
      )}
    >
      <span className={cn("size-2 shrink-0 rounded-full", DOT[session])} />
      <span className="text-foreground">{label}</span>
      <span className="text-muted-foreground">{exchangeTime(now)} ET</span>
    </span>
  );
}
