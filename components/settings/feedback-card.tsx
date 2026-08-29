"use client";

import { useState } from "react";
import { Lightbulb } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const MAX_LENGTH = 2000;

/**
 * A short "what would make this better?" note, saved to the `feedback` table.
 * Signed-in only — the API insert relies on the caller's session for RLS.
 * Sits in Settings just above "Where you're signed in".
 */
export function FeedbackCard() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSending(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          path:
            typeof window !== "undefined" ? window.location.pathname : undefined,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Couldn't send that just now. Try again.");
        return;
      }
      setSent(true);
      setMessage("");
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Card className="gap-4 p-6">
      <div className="flex items-start gap-3">
        <Lightbulb className="mt-0.5 size-5 shrink-0 text-primary" />
        <div>
          <h3 className="text-base font-semibold">Have an idea?</h3>
          <p className="text-sm text-muted-foreground">
            Tell us what would make MATMAX Stock better — a feature you want,
            something that felt off, anything. It goes straight to the team.
          </p>
        </div>
      </div>

      {sent ? (
        <p className="text-sm text-gain">Thanks — we&apos;ve got it.</p>
      ) : open ? (
        <form onSubmit={submit} className="flex flex-col gap-3">
          <textarea
            autoFocus
            rows={4}
            maxLength={MAX_LENGTH}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="What would you change or add?"
            className="w-full resize-y rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30"
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              className="rounded-full"
              disabled={sending || message.trim().length < 3}
            >
              {sending ? "Sending…" : "Send idea"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => {
                setOpen(false);
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <Button
          variant="outline"
          className="w-fit rounded-full"
          onClick={() => setOpen(true)}
        >
          <Lightbulb className="size-4" />
          Share an idea
        </Button>
      )}
    </Card>
  );
}
