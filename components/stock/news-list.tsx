"use client";

import { ArrowUpRight, Lightbulb } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useNews } from "@/hooks/use-news";

/** Relative age, e.g. "3h ago" — everything here is under 48 hours old. */
function timeAgo(unixSeconds: number) {
  const minutes = Math.max(
    0,
    Math.round((Date.now() / 1000 - unixSeconds) / 60),
  );
  if (minutes < 60) return `${minutes || 1}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function NewsList({ symbol }: { symbol: string }) {
  const { data: news, isLoading, isError } = useNews(symbol);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            className="flex flex-col gap-2 rounded-xl border border-border p-4"
          >
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        ))}
      </div>
    );
  }

  if (isError || !news || news.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing published about {symbol} in the last 48 hours.
      </p>
    );
  }

  return (
    <ol className="flex flex-col gap-2">
      {news.map((item, index) => (
        <li key={item.id ?? item.url}>
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex gap-3 rounded-xl border border-border p-4 transition-colors hover:border-primary/40 hover:bg-accent/40"
          >
            <span className="num mt-0.5 text-xs text-muted-foreground">
              {String(index + 1).padStart(2, "0")}
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold leading-snug group-hover:text-primary">
                  {item.headline}
                </p>
                <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
              </div>

              <p className="mt-1 text-xs text-muted-foreground">
                <span className="font-medium text-foreground/70">
                  {item.source}
                </span>
                {" · "}
                {timeAgo(item.datetime)}
              </p>

              {item.reason && (
                <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
                  <Lightbulb className="mt-px size-3.5 shrink-0 text-primary/70" />
                  <span>{item.reason}</span>
                </p>
              )}
            </div>
          </a>
        </li>
      ))}
    </ol>
  );
}
