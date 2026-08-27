import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

export function ChangeBadge({
  changePercent,
  className,
}: {
  changePercent: number;
  className?: string;
}) {
  const isPositive = changePercent >= 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium",
        isPositive ? "bg-gain-soft text-gain" : "bg-loss-soft text-loss",
        className,
      )}
    >
      {isPositive ? (
        <ArrowUp className="size-3" />
      ) : (
        <ArrowDown className="size-3" />
      )}
      <span className="num">{Math.abs(changePercent).toFixed(2)}%</span>
    </span>
  );
}
