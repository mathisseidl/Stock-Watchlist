import { cn } from "@/lib/utils";

/**
 * The data-and-liability note. It lives only on the pages that lean on the
 * softer numbers — Lookback and Forecast — rather than in a global footer.
 */
export function DataDisclaimer({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        "text-xs leading-relaxed text-muted-foreground",
        className,
      )}
    >
      Prices, charts and company data come from Finnhub and Yahoo Finance and can
      be delayed. Forecasts are simulated probability ranges, not predictions,
      and news summaries are written by Claude and can be wrong or incomplete.
      MATMAX Stock
      is an information tool, not investment advice — nothing here is a
      recommendation to buy or sell any security, and past performance is no
      guide to future results.
    </p>
  );
}
