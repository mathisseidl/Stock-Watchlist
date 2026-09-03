"use client";

import { useEffect, useRef, useState } from "react";
import { CircleHelp } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A term that explains itself.
 *
 * The forecast has to serve two readers at once: someone who has never seen a
 * percentile, and someone who wants to know which volatility estimator was
 * used. Hiding the jargon would fail the second; leading with it fails the
 * first. So every technical word stays on the page and carries its own plain-
 * English definition one tap away.
 *
 * The definition floats above the term rather than pushing the page around
 * below it, and closes on a click anywhere else, on Escape, or on a second
 * click of the trigger. Opening upward keeps it clear of the thing being
 * explained, which is almost always directly beneath.
 *
 * It is a click rather than a hover because half of this app's readers are on
 * a phone, where there is no hover.
 */
export function Explain({
  text,
  children,
  className,
  triggerClassName,
  underline = true,
  align = "start",
}: {
  /** One sentence, no jargon of its own. */
  text: string;
  children: React.ReactNode;
  className?: string;
  /** Lets a caller style the trigger — a dark pill on the outcome bar, say. */
  triggerClassName?: string;
  underline?: boolean;
  /**
   * Where the panel hangs from. "start" aligns to the trigger's left edge and
   * is the safe default: a centred panel on a trigger near a container's left
   * edge overhangs it. "center" is for a trigger that sits mid-container.
   */
  align?: "start" | "center";
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      // A pointerdown on the trigger itself is left alone — the button's own
      // click handler toggles it shut a moment later, and closing here first
      // would make that click re-open it.
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <span
      ref={root}
      className={cn("relative inline-flex items-center", className)}
    >
      {open && (
        <span
          role="tooltip"
          className={cn(
            "absolute bottom-full z-20 mb-2 w-56 rounded-lg border border-border bg-popover p-2.5 text-[11px] leading-relaxed font-normal text-muted-foreground shadow-lg",
            align === "center" ? "left-1/2 -translate-x-1/2" : "left-0",
          )}
        >
          {text}
        </span>
      )}
      <button
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        aria-expanded={open}
        className={cn(
          "group inline-flex items-center gap-1 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          triggerClassName,
        )}
      >
        <span
          className={cn(
            underline &&
              "border-b border-dashed border-muted-foreground/40 transition-colors group-hover:border-muted-foreground",
          )}
        >
          {children}
        </span>
        <CircleHelp
          className={cn(
            "size-3 shrink-0 transition-opacity",
            open ? "opacity-90" : "opacity-45 group-hover:opacity-90",
          )}
        />
      </button>
    </span>
  );
}

/**
 * The plain-English half of every technical term the result page uses. Kept
 * together so the definitions stay consistent with each other in tone and
 * reading level, rather than drifting apart across six components.
 */
export const GLOSSARY = {
  median:
    "Line up every simulated outcome from worst to best and take the one in the middle. Half did better, half did worse.",
  percentile:
    "A ranking out of a hundred. The 90th percentile is the point only one run in ten beat.",
  monteCarlo:
    "Running the same investment thousands of times over with different random luck, then counting how the endings fell.",
  volatility:
    "How violently the price swings, measured per year. A 40% figure means a year that ends flat can still have had big moves in it.",
  drift:
    "The return the model expects per year on average, before any luck. It is pulled toward a sensible market average rather than trusted from past returns alone.",
  volatilityDrag:
    "Losses hurt more than equal gains help: down 50% then up 50% leaves you down 25%. That is why the middle outcome sits below the average one.",
  drawdown:
    "The worst fall from a high point to a later low. It is what you would have watched happen if you held through it.",
  simulatedDip:
    "Across the simulated runs, how far the typical one fell from its own best moment before the end — measured against its peak, not against what you paid.",
  var95:
    "On the worst 1 day in 20, the stock has historically fallen at least this much.",
  expectedShortfall:
    "Averaging only the bad days beyond that line — so it says how bad a bad day usually gets, not just where 'bad' starts.",
  rsi: "A 0–100 gauge of how hard a stock has been bought lately. Above 70 is called overbought, below 30 oversold.",
  momentum:
    "How the stock did over the past year, ignoring the most recent month. Winners have historically kept winning a while longer.",
  sma200:
    "The average closing price of the last 200 trading days — the slow trend line the price wanders around.",
  macd: "Compares a fast and a slow average of the price. When the gap is widening the trend is strengthening.",
  annualized:
    "The same total return restated as a per-year rate, so a 3-month result and a 5-year one can be compared.",
  riskFree:
    "What cash earns sitting safely in a savings account or short government bond.",
  calibration:
    "A forecast that says '1 run in 10 ends below this' should be wrong about it 1 time in 10. Checking that against what really happened is what calibration means.",
  beta: "How hard this stock swings when the whole market moves. 1.0 is exactly with the market, 0.5 is half as hard, 2.0 twice as hard.",
  driftUncertainty:
    "Nobody can measure a stock's true expected return exactly, so the simulation runs a spread of plausible ones rather than betting the whole forecast on a single guess.",
  volatilityTermStructure:
    "Calm spells and panics both fade. Today's level of turbulence steers the next few weeks; the further out you look, the more the stock's own long-run average takes over.",
  skew: "Whether the sharp moves tend to be falls or rises. Most stocks fall faster than they rise, which shows up as a negative number.",
  fatTails:
    "How much more often huge days happen than a textbook bell curve allows. Zero would be the bell curve; real stocks run far above it.",
  totalReturn:
    "Price change plus dividends. Leaving the dividends out would understate what holding the stock actually paid you.",
} as const;
