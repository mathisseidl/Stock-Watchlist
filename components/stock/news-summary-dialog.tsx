"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, ExternalLink, Lock, MoveRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { buttonVariants } from "@/components/ui/button";
import { useProStatus } from "@/hooks/use-pro";
import { SourceLogo } from "@/components/stock/source-logo";
import { cn } from "@/lib/utils";
import type { NewsBrief } from "@/lib/news-summary";

/** Why the brief is worth the $1.99, in the reader's own terms. */
const SELLING_POINTS = [
  "Top 3 News stories summarized into a few sentences",
  "All news within 24h of publishing",
  "Every line sourced, so you can check it in one click.",
];

function timeAgo(unixSeconds: number) {
  const minutes = Math.max(1, Math.round((Date.now() / 1000 - unixSeconds) / 60));
  if (minutes < 60) return minutes === 1 ? "1 min ago" : `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  return "yesterday";
}

type ErrorBody = { error?: string; requiresPro?: boolean; empty?: boolean };

function BriefBody({ symbol }: { symbol: string }) {
  const { data, isLoading, error } = useQuery<NewsBrief>({
    queryKey: ["news-brief", symbol],
    queryFn: async () => {
      const res = await fetch(`/api/summary/${symbol}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as ErrorBody;
        throw new Error(body.error ?? "Couldn't load the briefing.");
      }
      return res.json();
    },
    // Briefings are expensive to produce and the news underneath them only
    // turns over every so often, so one per ticker per 15 minutes is plenty.
    staleTime: 15 * 60 * 1000,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        {[0, 1, 2].map((index) => (
          <div key={index} className="flex flex-col gap-2">
            <Skeleton className="h-5 w-28 rounded-full" />
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-11/12" />
            <Skeleton className="h-3.5 w-2/3" />
          </div>
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <p className="text-sm text-muted-foreground">
        {error instanceof Error
          ? error.message
          : "Couldn't load the briefing right now."}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-4">
        {data.sources.map((source, index) => (
          <div key={source.url} className="flex flex-col gap-1.5">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-muted py-0.5 pr-2 pl-1.5 text-xs font-medium text-foreground/75">
              <SourceLogo source={source.name} />
              {source.name}
              <span className="text-muted-foreground">
                · {timeAgo(source.datetime)}
              </span>
            </span>
            <p className="text-[15px] leading-relaxed text-foreground">
              {data.paragraphs[index]}
            </p>
          </div>
        ))}
      </div>

      <div className="border-t border-border pt-3">
        <p className="text-xs font-medium text-muted-foreground">
          Sources{data.widened ? " · last 48 hours" : " · last 24 hours"}
        </p>
        <ul className="mt-2.5 flex flex-col gap-2.5">
          {data.sources.map((source) => (
            <li key={source.url}>
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-start gap-1.5 text-xs text-muted-foreground hover:text-primary"
              >
                <span className="min-w-0">
                  <span className="font-medium text-foreground/80 group-hover:text-primary">
                    {source.name}
                  </span>
                  <span> · {timeAgo(source.datetime)}</span>
                  <span className="block leading-snug">{source.title}</span>
                </span>
                <ExternalLink className="mt-0.5 size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
              </a>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground/70">
        {data.writtenBy === "claude"
          ? "Summarized by AI from the sources above."
          : "Assembled from the sources above."}
      </p>
    </div>
  );
}

function ProPitch({ symbol }: { symbol: string }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3 rounded-xl bg-accent p-4">
        <Lock className="mt-0.5 size-4 shrink-0 text-primary" />
        <p className="text-sm font-medium text-accent-foreground">
          This service is only for Pro users.
        </p>
      </div>

      <p className="text-sm text-muted-foreground">
        The {symbol} briefing is ready. What you get:
      </p>

      <ul className="flex flex-col gap-2.5">
        {SELLING_POINTS.map((point) => (
          <li key={point} className="flex gap-2.5 text-sm leading-relaxed">
            <MoveRight className="mt-1 size-3.5 shrink-0 text-primary" />
            <span>{point}</span>
          </li>
        ))}
      </ul>

      <p className="rounded-xl border border-border px-4 py-3 text-sm">
        Free for 7 days, then{" "}
        <span className="num font-semibold">$1.99/month</span> — also unlocking
        news summaries of the last 24h for every stock, forecast analysis on any
        stock you wish and many more cool features. Cancel any time before the
        trial ends and you won&apos;t be charged.
      </p>

      <Link
        href="/account#plans"
        className={cn(buttonVariants(), "w-full rounded-full")}
      >
        Start your 7-day free trial
        <ArrowUpRight className="size-4" />
      </Link>
    </div>
  );
}

/**
 * The purple "News Summary" link on a watchlist row, plus the panel it opens.
 *
 * Non-Pro readers get the pitch instead of the brief — and the API refuses
 * them independently, so the gate is not just a hidden button.
 */
export function NewsSummaryLink({
  symbol,
  className,
}: {
  symbol: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const { isPaid, ready } = useProStatus();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex items-center gap-1 text-xs font-medium text-primary transition-colors hover:underline",
          className,
        )}
      >
        <span aria-hidden>→</span>
        News Summary
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <div className="pr-8">
            <DialogTitle>{symbol} — what happened in the last 24 hours</DialogTitle>
          </div>

          {/* Never show the upsell until the plan is actually known — the hook
              reads as "guest" while loading, which would tell a Pro user they
              haven't paid. */}
          {!ready ? (
            <div className="flex flex-col gap-3">
              {[0, 1, 2, 3].map((index) => (
                <Skeleton
                  key={index}
                  className="h-3.5 rounded-full"
                  style={{ width: `${95 - index * 8}%` }}
                />
              ))}
            </div>
          ) : isPaid ? (
            <BriefBody symbol={symbol} />
          ) : (
            <ProPitch symbol={symbol} />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
