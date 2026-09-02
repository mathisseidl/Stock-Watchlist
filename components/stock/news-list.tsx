"use client";

import { ArrowUpRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useNews } from "@/hooks/use-news";
import { SourceLogo } from "@/components/stock/source-logo";

/** Relative age, e.g. "3 hours ago" — everything here is under 48h old. */
function timeAgo(unixSeconds: number) {
  const minutes = Math.max(
    1,
    Math.round((Date.now() / 1000 - unixSeconds) / 60),
  );
  if (minutes < 60) {
    return minutes === 1 ? "1 minute ago" : `${minutes} minutes ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  return "yesterday";
}

export function NewsList({ symbol }: { symbol: string }) {
  const { data: news, isLoading, isError } = useNews(symbol);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            className="flex flex-col gap-2.5 rounded-2xl border border-border p-4"
          >
            <Skeleton className="h-3 w-28 rounded-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        ))}
      </div>
    );
  }

  if (isError || !news || news.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-6 text-center">
        <p className="text-sm font-medium">Nothing new in the last two days</p>
        <p className="mt-1 text-sm text-muted-foreground">
          We only show {symbol} stories published within 48 hours, so this fills
          in as soon as something lands.
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {news.map((item) => (
        <li key={item.id ?? item.url}>
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group block rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/30 hover:bg-accent/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted py-0.5 pr-2 pl-1.5 font-medium text-foreground/75">
                <SourceLogo source={item.source} />
                {item.source}
              </span>
              <span>{timeAgo(item.datetime)}</span>
            </div>

            <h4 className="mt-2 text-[15px] leading-snug font-semibold text-balance">
              {item.headline}
            </h4>

            {item.reason && (
              <p className="mt-2 border-l-2 border-primary/25 pl-3 text-sm leading-relaxed text-muted-foreground">
                {item.reason}
              </p>
            )}

            <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors group-hover:text-primary">
              Read at {item.source}
              <ArrowUpRight className="size-3.5 transition-transform group-hover:-translate-y-px group-hover:translate-x-px" />
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}
