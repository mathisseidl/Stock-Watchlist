"use client";

import { useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Without this, a client-side exception renders as a blank "page couldn't
 * load" with no detail. Show what broke and offer a retry that re-renders the
 * segment rather than forcing a full reload.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard] render failed:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-6">
      <h2 className="text-lg font-semibold">This page didn&apos;t load</h2>
      <p className="text-sm text-muted-foreground">
        Something broke while rendering. Market data may be briefly
        unavailable — trying again usually clears it.
      </p>

      <p className="num w-full overflow-x-auto rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
        {error.message || "Unknown error"}
        {error.digest ? ` · ${error.digest}` : ""}
      </p>

      <Button onClick={reset} className="rounded-full">
        <RefreshCw className="size-4" />
        Try again
      </Button>
    </div>
  );
}
