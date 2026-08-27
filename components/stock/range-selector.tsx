"use client";

import { cn } from "@/lib/utils";
import { RANGES } from "@/lib/ranges";
import type { CandleRange } from "@/lib/market-data/types";

export function RangeSelector({
  value,
  onChange,
  size = "md",
  /** Ranges with too little data to draw — shown, but not selectable. */
  disabledKeys,
}: {
  value: CandleRange;
  onChange: (range: CandleRange) => void;
  size?: "sm" | "md";
  disabledKeys?: CandleRange[];
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full bg-muted p-1">
      {RANGES.map((range) => {
        const disabled = disabledKeys?.includes(range.key) ?? false;
        return (
          <button
            key={range.key}
            type="button"
            disabled={disabled}
            aria-pressed={value === range.key}
            onClick={() => onChange(range.key)}
            className={cn(
              "rounded-full font-medium text-muted-foreground transition-colors hover:text-foreground",
              size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-1.5 text-sm",
              value === range.key && "bg-card text-foreground shadow-sm",
              disabled &&
                "cursor-not-allowed opacity-35 hover:text-muted-foreground",
            )}
          >
            {range.label}
          </button>
        );
      })}
    </div>
  );
}
