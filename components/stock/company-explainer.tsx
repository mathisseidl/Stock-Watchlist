"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { HelpCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type ErrorBody = { error?: string; empty?: boolean };

type Description = {
  description: string;
  /** Present when the words are someone else's and must be credited. */
  source?: { name: string; url: string };
};

/**
 * "What does it do?" — one or two lines on the business behind a ticker,
 * fetched only when the reader asks.
 *
 * Deliberately a button rather than something always on screen: most visits
 * are to a ticker the reader already knows, and the answer costs a model
 * call the first time anybody asks about that company.
 */
export function CompanyExplainer({ symbol }: { symbol: string }) {
  const [asked, setAsked] = useState(false);

  const { data, isLoading, error } = useQuery<Description>({
    queryKey: ["describe", symbol],
    queryFn: async () => {
      const res = await fetch(`/api/describe/${encodeURIComponent(symbol)}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as ErrorBody;
        throw new Error(body.error ?? "Couldn't load the description.");
      }
      return res.json();
    },
    enabled: asked,
    // What a company does does not change; once fetched, keep it.
    staleTime: Infinity,
    retry: false,
  });

  if (!asked) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="rounded-full"
        onClick={() => setAsked(true)}
      >
        <HelpCircle className="size-4" />
        What does {symbol} do?
      </Button>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">
        What {symbol} does
      </p>
      {isLoading ? (
        <div className="mt-2 flex flex-col gap-2">
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-4/5" />
        </div>
      ) : error ? (
        <p className="mt-1.5 text-sm text-muted-foreground">
          {(error as Error).message}
        </p>
      ) : (
        <>
          <p className="mt-1.5 text-sm leading-relaxed">{data?.description}</p>
          {/* Wikipedia's text is CC BY-SA: shown, it has to be credited. */}
          {data?.source && (
            <p className="mt-2 text-xs text-muted-foreground">
              From{" "}
              <a
                href={data.source.url}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2 hover:text-foreground"
              >
                {data.source.name}
              </a>
              , CC BY-SA
            </p>
          )}
        </>
      )}
      {isLoading && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" />
          Writing it in plain English…
        </p>
      )}
    </div>
  );
}
