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

const DOTS: Record<Session, string> = {
  pre: "bg-amber-500",
  open: "bg-gain",
  after: "bg-amber-500",
  closed: "bg-muted-foreground/50",
  holiday: "bg-muted-foreground/50",
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

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs text-muted-foreground",
        className,
      )}
    >
      <span
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          DOTS[session],
          session === "open" && "animate-pulse",
        )}
      />
      <span className="font-medium text-foreground/80">
        {SESSION_LABELS[session]}
        {session === "open" && isEarlyClose(now) ? " · closes 1pm" : ""}
      </span>
      <span className="num hidden sm:inline">{exchangeTime(now)} ET</span>
    </span>
  );
}
