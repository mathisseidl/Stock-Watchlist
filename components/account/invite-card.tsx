"use client";

import { useState } from "react";
import { Check, Copy, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * A plain invite link, not a rewards programme — nothing is tracked or paid
 * out. It exists so someone can hand a friend the app and their username, and
 * the two can find each other in Community.
 */
export function InviteCard({ username }: { username: string | null }) {
  const [copied, setCopied] = useState(false);

  const link =
    typeof window !== "undefined"
      ? `${window.location.origin}/signup`
      : "/signup";

  async function copy() {
    const message = username
      ? `Track your stocks with MATMAX: ${link} — add me as @${username}`
      : `Track your stocks with MATMAX: ${link}`;
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked; the link is visible to copy by hand.
    }
  }

  return (
    <Card className="gap-4 p-6">
      <div className="flex items-start gap-3">
        <Users className="mt-0.5 size-5 shrink-0 text-primary" />
        <div>
          <h3 className="text-base font-semibold">Invite a friend</h3>
          <p className="text-sm text-muted-foreground">
            Share the app and your username so your friend can follow your
            watchlist
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <code className="num min-w-0 flex-1 truncate rounded-lg bg-muted px-3 py-2 text-xs">
          {link}
        </code>
        <Button variant="outline" className="rounded-full" onClick={copy}>
          {copied ? (
            <>
              <Check className="size-4 text-gain" />
              Copied
            </>
          ) : (
            <>
              <Copy className="size-4" />
              Copy invite
            </>
          )}
        </Button>
      </div>
    </Card>
  );
}
