"use client";

import { useEffect, useRef, useState } from "react";
import { Menu } from "lucide-react";
import { Sidebar } from "@/components/layout/sidebar";
import { StockSearch } from "@/components/search/stock-search";
import { MarketStatus } from "@/components/stock/market-status";
import { useBackground } from "@/components/settings/background-provider";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

/** Horizontal travel that counts as a swipe rather than a tap or a scroll. */
const SWIPE_DISTANCE = 70;
/** Above this much vertical drift it was a scroll, not a swipe. */
const SWIPE_DRIFT = 50;

/**
 * True when the touch began inside something that scrolls sideways — a wide
 * table, a chart, the range strip. Those own the horizontal axis, and stealing
 * it to open a menu would make them impossible to use.
 */
function startedInScroller(target: EventTarget | null): boolean {
  let node = target instanceof HTMLElement ? target : null;
  while (node && node !== document.body) {
    const overflowX = getComputedStyle(node).overflowX;
    if (
      (overflowX === "auto" || overflowX === "scroll") &&
      node.scrollWidth > node.clientWidth
    ) {
      return true;
    }
    node = node.parentElement;
  }
  return false;
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isPaid, setIsPaid] = useState(false);
  const { activeId: gradient } = useBackground();
  const swipe = useRef<{ x: number; y: number; eligible: boolean } | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("is_paid")
        .eq("id", user.id)
        .maybeSingle();
      setIsPaid(Boolean(data?.is_paid));
    });
  }, []);

  return (
    <div className="flex h-full min-h-screen w-full">
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      {/* Swipe right anywhere on the page to open the menu, the way a native
          app behaves. Deliberately not an edge swipe: iOS Safari claims the
          left edge for "back", so an edge gesture here would fight the
          browser. Single-finger only, so the chart's two-finger compare is
          untouched. */}
      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col",
          // A gradient owns the page background; the muted wash would only
          // dull it.
          gradient ? "bg-transparent" : "bg-muted/30",
        )}
        onTouchStart={(event) => {
          if (event.touches.length !== 1) {
            swipe.current = null;
            return;
          }
          const touch = event.touches[0];
          swipe.current = {
            x: touch.clientX,
            y: touch.clientY,
            eligible: !startedInScroller(event.target),
          };
        }}
        onTouchMove={(event) => {
          // A second finger means a pinch or a chart compare, never a swipe.
          if (event.touches.length > 1) swipe.current = null;
        }}
        onTouchEnd={(event) => {
          const start = swipe.current;
          swipe.current = null;
          if (!start?.eligible || mobileOpen) return;
          const touch = event.changedTouches[0];
          if (!touch) return;
          const travelled = touch.clientX - start.x;
          const drifted = Math.abs(touch.clientY - start.y);
          if (travelled >= SWIPE_DISTANCE && drifted <= SWIPE_DRIFT) {
            setMobileOpen(true);
          }
        }}
      >
        <header
          className={cn(
            "flex items-center gap-3 border-b border-border px-4 py-3 md:px-8",
            gradient
              ? "bg-background/60 backdrop-blur-md"
              : "bg-background",
          )}
        >
          {/* Mobile: menu button + brand (the sidebar brand is hidden here). */}
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            className="shrink-0 text-foreground md:hidden"
          >
            <Menu className="size-6" />
          </button>
          <div className="flex items-center gap-2 md:hidden">
            <div className="flex size-8 items-center justify-center rounded-full bg-neutral-900 text-xs font-bold text-white">
              MS
            </div>
            <span className="text-base font-semibold">MATMAX Stock</span>
            {isPaid && (
              <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
                Pro
              </span>
            )}
          </div>
          <MarketStatus className="hidden md:inline-flex" />
          <div className="flex min-w-0 flex-1 justify-end">
            <StockSearch />
          </div>
        </header>
        <main className="min-w-0 flex-1 overflow-x-hidden p-4 md:p-8">
          <MarketStatus className="mb-4 md:hidden" />
          {children}
        </main>
      </div>
    </div>
  );
}
