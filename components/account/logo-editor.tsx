"use client";

import { useState } from "react";
import { Check, Loader2, Pencil } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  LOGO_COLORS,
  LOGO_SHAPES,
  SHAPE_CLASS,
  type LogoShape,
  type UserLogo,
} from "@/lib/logo";
import { cn } from "@/lib/utils";

const SHAPE_LABEL: Record<LogoShape, string> = {
  circle: "Circle",
  rounded: "Rounded",
  square: "Square",
};

/** The tile itself, at whatever size the caller needs. */
function Tile({
  logo,
  className,
}: {
  logo: UserLogo;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      style={{ backgroundColor: logo.color }}
      className={cn(
        "inline-flex select-none items-center justify-center font-semibold leading-none text-white",
        SHAPE_CLASS[logo.shape],
        className,
      )}
    >
      {logo.text}
    </span>
  );
}

/**
 * The member's logo with a pencil on it, and the designer behind that.
 *
 * Deliberately occupies exactly the footprint the plain tile did, so dropping
 * it into the account page's profile row moves nothing: the pencil sits on the
 * tile rather than beside it, and the controls live in a dialog rather than in
 * a card of their own.
 *
 * The saved logo is held here as state, so the tile changes the moment it is
 * saved instead of waiting for the page to be re-rendered by the server.
 */
export function LogoEditor({ initial }: { initial: UserLogo }) {
  const [logo, setLogo] = useState<UserLogo>(initial);
  const [open, setOpen] = useState(false);

  // Draft state, so abandoning the dialog leaves the saved logo alone.
  const [text, setText] = useState(initial.text);
  const [color, setColor] = useState(initial.color);
  const [shape, setShape] = useState<LogoShape>(initial.shape);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const graphemes = [...text.trim()];
  const valid = graphemes.length >= 1 && graphemes.length <= 2;
  const draft: UserLogo = {
    text: graphemes.slice(0, 2).join("") || "?",
    color,
    shape,
  };

  function openDialog() {
    // Start each edit from what is actually saved.
    setText(logo.text);
    setColor(logo.color);
    setShape(logo.shape);
    setError(null);
    setOpen(true);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/account/logo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim(), color, shape }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Couldn't save that just now.");
        return;
      }
      setLogo({ text: text.trim(), color, shape });
      setOpen(false);
    } catch {
      setError("Couldn't save that just now. Check your connection.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* Same 4rem box the tile alone used to be, so the row is unchanged. */}
      <span className="relative inline-flex size-16 shrink-0">
        <Tile logo={logo} className="size-16 text-xl" />
        <button
          type="button"
          onClick={openDialog}
          aria-label="Change your logo"
          title="Change your logo"
          className="absolute -bottom-0.5 -right-0.5 flex size-6 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm transition hover:text-foreground"
        >
          <Pencil className="size-3" />
        </button>
      </span>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>Your logo</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Shown next to your username when friends look you up.
          </p>

          <div className="mt-1 flex flex-wrap items-center gap-5">
            <Tile logo={draft} className="size-16 text-xl" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <label htmlFor="logo-text" className="text-sm font-medium">
                Letters or an emoji
              </label>
              <Input
                id="logo-text"
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="MS"
                className="max-w-32"
              />
              <p className="text-xs text-muted-foreground">
                Two letters, or one emoji.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Colour</span>
            <div className="flex flex-wrap gap-2">
              {LOGO_COLORS.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-label={`Use ${option}`}
                  aria-pressed={option === color}
                  onClick={() => setColor(option)}
                  style={{ backgroundColor: option }}
                  className={cn(
                    "flex size-8 items-center justify-center rounded-full ring-offset-2 ring-offset-background transition",
                    option === color
                      ? "ring-2 ring-primary"
                      : "hover:opacity-80",
                  )}
                >
                  {option === color && <Check className="size-4 text-white" />}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Shape</span>
            <div className="flex flex-wrap gap-2">
              {LOGO_SHAPES.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={option === shape}
                  onClick={() => setShape(option)}
                  className={cn(
                    "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition",
                    option === shape
                      ? "border-primary bg-accent text-accent-foreground"
                      : "border-border hover:bg-accent",
                  )}
                >
                  <span
                    className={cn("size-4 bg-foreground/70", SHAPE_CLASS[option])}
                  />
                  {SHAPE_LABEL[option]}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="mt-1 flex items-center justify-end gap-2">
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="rounded-full"
              disabled={!valid || saving}
              onClick={save}
            >
              {saving && <Loader2 className="size-4 animate-spin" />}
              Save logo
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
