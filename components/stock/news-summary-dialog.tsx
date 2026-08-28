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
  "Three trusted articles in six lines — the day's news in fifteen seconds.",
  "Credible desks only. Nothing over 24 hours, nothing paywalled, nothing off-topic.",
  "Every line sourced, so you can check it in one click.",
  "Works on every stock in your watchlist.",
];

function timeAgo(unixSeconds: number) {
  const minutes = Math.max(1, Math.round((Date.now() / 1000 - unixSeconds) / 60));
  if (minutes < 60) return minutes === 1 ? "1 min ago" : `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  return "yesterday";
}

type ErrorBody = { error?: string; requiresPro?: boolean; empty?: boolean };

/**
 * The brief arrives as up to six sentences with implicit roles: a lead, one
 * line per story (often "Source, 9 hours ago: …"), a "why it matters" line and
 * a closing take. Rendering them as one paragraph turned that into a wall of
 * text, so we recover the structure and give each part its own shape.
 */
type BriefSegment =
  | { kind: "lead"; text: string }
  | { kind: "story"; source: string | null; age: string | null; text: string }
  | { kind: "why"; text: string }
  | { kind: "note"; text: string }
  | { kind: "net"; text: string }
  | { kind: "meta"; text: string };

const AGE_HINT = /(ago|yesterday|hour|today|minute|week)/i;

function parseBrief(lines: string[]): BriefSegment[] {
  const segments = lines.map((raw, index): BriefSegment => {
    const line = raw.trim();
    if (index === 0) return { kind: "lead", text: line };

    const why = line.match(/^why (?:it|this) matters:?\s*(.+)/i);
    if (why) return { kind: "why", text: why[1] };

    const note = line.match(
      /^(?:also worth knowing|worth knowing|also):?\s*(.+)/i,
    );
    if (note) return { kind: "note", text: note[1] };

    const net = line.match(
      /^(?:net|bottom line|the net|what to watch):?\s*(.+)/i,
    );
    if (net) return { kind: "net", text: net[1] };

    if (/^everything above cleared/i.test(line))
      return { kind: "meta", text: line };

    const story = line.match(/^([A-Za-z][\w.&'’ -]{1,38}?),\s*([^:]{2,28}?):\s*(.+)/);
    if (story && AGE_HINT.test(story[2])) {
      return {
        kind: "story",
        source: story[1].trim(),
        age: story[2].trim(),
        text: story[3].trim(),
      };
    }

    return { kind: "story", source: null, age: null, text: line };
  });

  // Claude tends to drop the "Why it matters:" / "Net:" labels the built-in
  // composer writes, so fall back to position for the closing two lines when
  // they read as plain sentences rather than dated stories.
  if (!segments.some((s) => s.kind === "net") && segments.length >= 3) {
    const last = segments[segments.length - 1];
    if (last.kind === "story" && !last.source) {
      segments[segments.length - 1] = { kind: "net", text: last.text };
    }
  }
  if (!segments.some((s) => s.kind === "why") && segments.length >= 4) {
    const candidate = segments[segments.length - 2];
    if (candidate.kind === "story" && !candidate.source) {
      segments[segments.length - 2] = { kind: "why", text: candidate.text };
    }
  }

  return segments;
}

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

  const segments = parseBrief(data.lines);
  const lead = segments.find((s) => s.kind === "lead");
  const stories = segments.filter(
    (s): s is Extract<BriefSegment, { kind: "story" }> => s.kind === "story",
  );
  const why = segments.find((s) => s.kind === "why");
  const note = segments.find((s) => s.kind === "note");
  const net = segments.find((s) => s.kind === "net");
  const meta = segments.find((s) => s.kind === "meta");

  return (
    <div className="flex flex-col gap-5">
      {lead && (
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          {lead.text}
        </p>
      )}

      {stories.length > 0 && (
        <div className="flex flex-col gap-4">
          {stories.map((story, index) => (
            <div key={index} className="border-l-2 border-primary/25 pl-4">
              {(story.source || story.age) && (
                <p className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
                  {story.source}
                  {story.source && story.age ? " · " : ""}
                  {story.age}
                </p>
              )}
              <p className="mt-1 text-[15px] leading-relaxed text-foreground">
                {story.text}
              </p>
            </div>
          ))}
        </div>
      )}

      {(why || note) && (
        <div className="rounded-xl bg-accent px-4 py-3">
          {why && (
            <>
              <p className="text-[11px] font-semibold tracking-[0.08em] text-primary uppercase">
                Why it matters
              </p>
              <p className="mt-1 text-sm leading-relaxed text-accent-foreground">
                {why.text}
              </p>
            </>
          )}
          {note && (
            <p
              className={cn(
                "text-sm leading-relaxed text-accent-foreground/80",
                why && "mt-2.5 border-t border-border/60 pt-2.5",
              )}
            >
              <span className="font-medium text-accent-foreground">
                Also worth knowing.{" "}
              </span>
              {note.text}
            </p>
          )}
        </div>
      )}

      {net && (
        <p className="text-sm leading-relaxed text-foreground">
          <span className="font-semibold text-primary">Bottom line. </span>
          {net.text}
        </p>
      )}

      <div className="border-t border-border pt-3">
        <p className="text-xs font-medium text-muted-foreground">
          Sources{data.widened ? " · last 48 hours" : " · last 24 hours"}
        </p>
        {meta && (
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground/70">
            {meta.text}
          </p>
        )}
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
        <span className="num font-semibold">$4.99/month</span>, also unlocking
        forecasts and unlimited analysis. Cancel any time.
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
 * The purple "News Summary" link on a watchlist row, plus the panel it opens.
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
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              {symbol} — what happened in the last 24 hours
            </DialogTitle>
            <DialogDescription className="mt-1">
              {name && name !== symbol ? `${name} · ` : ""}
              Built from the three most trusted stories on this stock.
            </DialogDescription>
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
