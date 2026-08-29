"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { useProfile } from "@/hooks/use-profile";
import { TickerAvatar } from "@/components/stock/ticker-avatar";
import type { TickerColor } from "@/lib/mock-data";

const SIZE_CLASSES: Record<"sm" | "md" | "lg", string> = {
  sm: "size-8",
  md: "size-10",
  lg: "size-14",
};

export function CompanyLogo({
  symbol,
  color,
  size = "md",
}: {
  symbol: string;
  color?: TickerColor;
  size?: "sm" | "md" | "lg";
}) {
  const { data: profile } = useProfile(symbol);
  const [imgFailed, setImgFailed] = useState(false);

  const logoUrl = profile?.logo;

  if (!logoUrl || imgFailed) {
    return <TickerAvatar symbol={symbol} color={color} size={size} />;
  }

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-white",
        SIZE_CLASSES[size],
      )}
    >
      {/* Company logos come from arbitrary provider hosts, so a plain img with
          an onError fallback is more robust here than next/image. */}
      {/* object-cover + the round, clipping parent means a square logo tile is
          cropped to the circle rather than sitting inside it as a square. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logoUrl}
        alt={`${symbol} logo`}
        className="size-full object-cover"
        onError={() => setImgFailed(true)}
      />
    </div>
  );
}
