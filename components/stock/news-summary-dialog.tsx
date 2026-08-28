"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  ExternalLink,
  Lock,
  MoveRight,
  Sparkles,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { buttonVariants } from "@/components/ui/button";
import { useProStatus } from "@/hooks/use-pro";
import { cn } from "@/lib/utils";
import type { NewsBrief } from "@/lib/news-summary";

/** Why the brief is worth the $4.99, in the reader's own terms. */
const SELLING_POINTS = [
  "Three trusted articles, distilled to six lines. The last 24 hours on this stock, read in fifteen seconds instead of ten minutes.",
  "Only credible financial desks, nothing older than a day, nothing behind a paywall, and nothing that isn't genuinely about this company.",
  "Every briefing lists its sources, so you can check any line in one click rather than taking it on faith.",
  "It works on every stock on your watchlist — your whole list turns into a single morning read.",
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
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Sparkles className="size-4 animate-pulse text-primary" />
          Reading today&apos;s coverage…
        </div>
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <Skeleton
            key={index}
            className="h-3.5 rounded-full"
            style={{ width: `${100 - index * 7}%` }}
          />
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
    <div className="flex flex-col gap-4">
      <ol className="flex flex-col gap-2.5">
        {data.lines.map((line, index) => (
          <li key={index} className="flex gap-3 text-sm leading-relaxed">
            <span className="num mt-0.5 w-4 shrink-0 text-xs text-primary/60">
              {index + 1}
            </span>
            <span>{line}</span>
          </li>
        ))}
      </ol>

      <div className="border-t border-border pt-3">
        <p className="text-xs font-medium text-muted-foreground">
          Sources{data.widened ? " (last 48 hours)" : " (last 24 hours)"}
        </p>
        <ul className="mt-2 flex flex-col gap-2">
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
        Summarised by AI from the sources above. It can miss nuance — open a
        source before acting on anything here.
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
        The briefing for {symbol} is written and waiting. Here is what you get
        when you unlock it:
      </p>

      <ul className="flex flex-col gap-3">
        {SELLING_POINTS.map((point) => (
          <li key={point} className="flex gap-2.5 text-sm leading-relaxed">
            <MoveRight className="mt-1 size-3.5 shrink-0 text-primary" />
            <span>{point}</span>
          </li>
        ))}
      </ul>

      <p className="rounded-xl border border-border px-4 py-3 text-sm">
        Pro is <span className="num font-semibold">$4.99/month</span> and also
        unlocks stock forecasts and unlimited investment analysis. Cancel any
        time — right up to the day before the next payment.
      </p>

      <Link
        href="/account#plans"
        className={cn(buttonVariants(), "w-full rounded-full")}
      >
        Get Pro — $4.99/month
        <ArrowUpRight className="size-4" />
      </Link>
    </div>
  );
}

/**
 * The purple "View summary" link on a watchlist row, plus the panel it opens.
 *
 * Non-Pro readers get the pitch instead of the brief — and the API refuses
 * them independently, so the gate is not just a hidden button.
 */
export function NewsSummaryLink({
  symbol,
  name,
  className,
}: {
  symbol: string;
  name?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const { isPaid } = useProStatus();

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
        View summary
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <div className="pr-8">
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              {symbol} — what happened in the last 24 hours
            </DialogTitle>
            <DialogDescription className="mt-1">
              {name && name !== symbol ? `${name} · ` : ""}
              An AI briefing built from the three most trusted stories about
              this stock.
            </DialogDescription>
          </div>

          {isPaid ? <BriefBody symbol={symbol} /> : <ProPitch symbol={symbol} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
