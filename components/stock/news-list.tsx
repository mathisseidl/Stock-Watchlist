"use client";

import { ExternalLink } from "lucide-react";
import { useNews } from "@/hooks/use-news";

function formatDate(unixSeconds: number) {
  return new Date(unixSeconds * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function NewsList({ symbol }: { symbol: string }) {
  const { data: news, isLoading, isError } = useNews(symbol);

  if (isLoading) {
    return (
      <p className="text-sm text-muted-foreground">Loading latest news…</p>
    );
  }

  if (isError || !news || news.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No recent news available for {symbol}.
      </p>
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-border">
      {news.map((item) => (
        <li key={item.id}>
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-start justify-between gap-4 py-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium group-hover:text-primary">
                {item.headline}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {item.source} · {formatDate(item.datetime)}
              </p>
            </div>
            <ExternalLink className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          </a>
        </li>
      ))}
    </ul>
  );
}
