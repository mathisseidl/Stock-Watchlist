"use client";

import { useState } from "react";
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
 * The definition opens *in place* rather than in a floating tooltip. Tooltips
 * need hover, and half of this app's readers are on a phone.
 */
export function Explain({
  text,
  children,
  className,
}: {
  /** One sentence, no jargon of its own. */
  text: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <span className={cn("inline-flex flex-col items-start", className)}>
      <button
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        aria-expanded={open}
        className="group inline-flex items-center gap-1 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <span className="border-b border-dashed border-muted-foreground/40 transition-colors group-hover:border-muted-foreground">
          {children}
        </span>
        <CircleHelp
          className={cn(
            "size-3 shrink-0 transition-opacity",
            open ? "opacity-90" : "opacity-45 group-hover:opacity-90",
          )}
        />
      </button>
      {open && (
        <span className="mt-1.5 block rounded-lg bg-muted/70 px-2.5 py-1.5 text-[11px] leading-relaxed font-normal text-muted-foreground">
          {text}
        </span>
      )}
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
    "Roughly what cash earns sitting safely in a savings account or short government bond.",
} as const;
