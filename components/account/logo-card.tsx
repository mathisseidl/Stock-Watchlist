"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
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

/**
 * The logo designer on the account page: type initials or paste an emoji,
 * pick a colour and a shape, watch the preview, save.
 *
 * The preview is the same markup the rest of the app draws, so what a member
 * sets here is exactly what their friends see next to their username.
 */
export function LogoCard({ initial }: { initial: UserLogo }) {
  const [text, setText] = useState(initial.text);
  const [color, setColor] = useState(initial.color);
  const [shape, setShape] = useState<LogoShape>(initial.shape);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Graphemes, so an emoji counts as one character however many code units
  // it is stored as.
  const graphemes = [...text.trim()];
  const valid = graphemes.length >= 1 && graphemes.length <= 2;

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/account/logo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim(), color, shape }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Couldn't save that just now.");
      } else {
        setSaved(true);
      }
    } catch {
      setError("Couldn't save that just now. Check your connection.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="gap-5 p-6">
      <div>
        <h3 className="text-base font-semibold">Your logo</h3>
        <p className="text-sm text-muted-foreground">
          Shown next to your username when friends look you up.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-5">
        {/* Live preview — the same markup UserLogoBadge renders. */}
        <span
          aria-hidden
          style={{ backgroundColor: color }}
          className={cn(
            "inline-flex size-16 shrink-0 select-none items-center justify-center text-xl font-semibold leading-none text-white",
            SHAPE_CLASS[shape],
          )}
        >
          {graphemes.slice(0, 2).join("") || "?"}
        </span>

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <label htmlFor="logo-text" className="text-sm font-medium">
            Letters or an emoji
          </label>
          <Input
            id="logo-text"
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setSaved(false);
            }}
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
              onClick={() => {
                setColor(option);
                setSaved(false);
              }}
              style={{ backgroundColor: option }}
              className={cn(
                "flex size-8 items-center justify-center rounded-full ring-offset-2 ring-offset-background transition",
                option === color ? "ring-2 ring-primary" : "hover:opacity-80",
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
              onClick={() => {
                setShape(option);
                setSaved(false);
              }}
              className={cn(
                "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition",
                option === shape
                  ? "border-primary bg-accent text-accent-foreground"
                  : "border-border hover:bg-accent",
              )}
            >
              <span
                className={cn(
                  "size-4 bg-foreground/70",
                  SHAPE_CLASS[option],
                )}
              />
              {SHAPE_LABEL[option]}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center gap-3">
        <Button
          className="rounded-full"
          disabled={!valid || saving}
          onClick={save}
        >
          {saving && <Loader2 className="size-4 animate-spin" />}
          Save logo
        </Button>
        {saved && (
          <span className="flex items-center gap-1.5 text-sm text-gain">
            <Check className="size-4" />
            Saved
          </span>
        )}
        {!valid && (
          <span className="text-sm text-muted-foreground">
            Add one or two characters.
          </span>
        )}
      </div>
    </Card>
  );
}
