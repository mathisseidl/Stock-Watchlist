"use client";

import Link from "next/link";
import { Ban, Check, Lock } from "lucide-react";
import { useBackground } from "@/components/settings/background-provider";
import { presetsForMode } from "@/lib/backgrounds";
import { cn } from "@/lib/utils";

/**
 * The gradient chooser, sat under the Light/Dark switch in the sidebar. Each
 * circle carries the gradient itself; clicking one paints the whole app.
 * Only the current theme's set shows — Light and Dark keep separate choices.
 * "No background" and the free default are open to everyone; the rest are Pro.
 */
export function BackgroundPicker() {
  const { activeId, mode, allowed, ready, setBackground } = useBackground();
  const presets = presetsForMode(mode);
  // Pro gate — applies only to the non-free gradients.
  const locked = ready && !allowed;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <Swatch
        label="No background"
        selected={activeId === null}
        onClick={() => setBackground(null)}
      >
        <span className="flex size-full items-center justify-center rounded-full bg-sidebar-accent text-sidebar-foreground/50">
          <Ban className="size-3.5" />
        </span>
      </Swatch>

      {presets.map((preset) => {
        const swatchLocked = locked && !preset.free;
        return (
          <Swatch
            key={preset.id}
            label={swatchLocked ? `${preset.label} — Pro` : preset.label}
            selected={activeId === preset.id}
            disabled={swatchLocked}
            onClick={() => setBackground(preset.id)}
          >
            <span
              className="block size-full rounded-full"
              style={{ backgroundImage: preset.swatch }}
            />
          </Swatch>
        );
      })}

      {locked && (
        <Link
          href="/account#plans"
          aria-label="Upgrade to Pro for more backgrounds"
          title="Pro"
          className="flex size-7 items-center justify-center rounded-full text-sidebar-foreground/50 hover:text-sidebar-foreground"
        >
          <Lock className="size-3.5" />
        </Link>
      )}
    </div>
  );
}

function Swatch({
  label,
  selected,
  onClick,
  disabled,
  children,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "relative block size-7 shrink-0 rounded-full ring-1 ring-sidebar-foreground/15 transition",
        "focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-40",
        selected && "ring-2 ring-sidebar-ring ring-offset-2 ring-offset-sidebar",
      )}
    >
      {children}
      {selected && (
        <span className="absolute -top-1 -right-1 flex size-3.5 items-center justify-center rounded-full bg-sidebar-primary text-sidebar-primary-foreground">
          <Check className="size-2" />
        </span>
      )}
    </button>
  );
}
