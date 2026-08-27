import { cn } from "@/lib/utils";
import type { TickerColor } from "@/lib/mock-data";

const DEFAULT_COLOR: TickerColor = { bg: "bg-neutral-800", fg: "text-white" };

const SIZE_CLASSES: Record<"sm" | "md" | "lg", string> = {
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-14 text-lg",
};

export function TickerAvatar({
  symbol,
  color = DEFAULT_COLOR,
  size = "md",
}: {
  symbol: string;
  color?: TickerColor;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold",
        color.bg,
        color.fg,
        SIZE_CLASSES[size],
      )}
    >
      {symbol.charAt(0)}
    </div>
  );
}
