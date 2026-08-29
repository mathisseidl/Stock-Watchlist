"use client";

import Link from "next/link";
import { Ban, Check, Lock } from "lucide-react";
import { useBackground } from "@/components/settings/background-provider";
import { presetsForMode } from "@/lib/backgrounds";
import { cn } from "@/lib/utils";

/**
 * The gradient chooser in Settings → Display. Circles carry the gradient
 * itself; clicking one paints the whole app. Only the current theme's set is
 * shown — Light and Dark keep separate choices. Pro only.
 */
export function BackgroundPicker() {
  const { activeId, mode, allowed, ready, setBackground } = useBackground();
  const presets = presetsForMode(mode);
  // Don't flash the locked state at a Pro member while their plan loads.
  const locked = ready && !allowed;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">
            Background
            {locked && (
              <span className="ml-2 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                Pro
              </span>
            )}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            A gradient behind the whole app, just for {mode} mode. Switch themes
            in the sidebar to set the other one.
          </p>
        </div>
      </div>

      <div
        className={cn(
          "flex flex-wrap items-center gap-2.5",
          locked && "pointer-events-none opacity-50",
        )}
      >
        <Swatch
          label="No background"
          selected={activeId === null}
          onClick={() => setBackground(null)}
        >
          <span className="flex size-full items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Ban className="size-4" />
          </span>
        </Swatch>

        {presets.map((preset) => (
          <Swatch
            key={preset.id}
            label={preset.label}
            selected={activeId === preset.id}
            onClick={() => setBackground(preset.id)}
          >
            <span
              className="block size-full rounded-full"
              style={{ backgroundImage: preset.swatch }}
            />
          </Swatch>
        ))}
      </div>

      {locked && (
        <Link
          href="/account#plans"
          className="flex w-fit items-center gap-1.5 text-xs font-medium text-primary"
        >
          <Lock className="size-3.5" />
          Upgrade to Pro to use backgrounds
        </Link>
      )}
    </div>
  );
}

function Swatch({
  label,
  selected,
  onClick,
  children,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      title={label}
      onClick={onClick}
      className={cn(
        "relative block size-9 shrink-0 rounded-full ring-1 ring-foreground/15 transition",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        selected && "ring-2 ring-primary ring-offset-2 ring-offset-card",
      )}
    >
      {children}
      {selected && (
        <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="size-2.5" />
        </span>
      )}
    </button>
  );
}
