import { cn } from "@/lib/utils";

/**
 * Its own component rather than a variant of `DataDisclaimer` — that one says
 * "nothing here is a recommendation," which is right on Forecast and Lookback
 * but has to be phrased more carefully on a page that openly ranks a list.
 */
export function PotentialDisclaimer({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        "text-xs leading-relaxed text-muted-foreground",
        className,
      )}
    >
      <span className="font-medium text-foreground">How to read this.</span>{" "}
      The Weekly 6 is an algorithmic screen, not advice. Each week a fixed,
      hand-picked list of companies is run through the same simulation the
      Forecast page uses, and the six here simply scored highest on one
      published formula. No one at MATMAX picks the six, and the order is not a
      view on which company is &ldquo;best.&rdquo; The model only knows past
      prices &mdash; it cannot see a product, a lawsuit or a recession coming,
      and a stock that screens well can still fall hard. The suggested hold time
      is the shortest horizon at which the simulation clears a fixed confidence
      bar, not a target or a promise. Past performance does not predict future
      results. Nothing here is personalised to you or a recommendation to buy or
      sell any security.
    </p>
  );
}
