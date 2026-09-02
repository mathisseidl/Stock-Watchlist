"use client";

import { Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PotentialPickCard } from "@/components/potential/potential-pick-card";
import type { PotentialPick } from "@/lib/potential/types";

function LockedRow({ rank }: { rank: number }) {
  return (
    <Card className="flex-row items-center gap-3 p-4">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
        {rank}
      </span>
      <div className="flex-1 space-y-1.5">
        <div className="h-3 w-24 rounded bg-muted" />
        <div className="h-3 w-40 rounded bg-muted/60" />
      </div>
      <Lock className="size-4 shrink-0 text-muted-foreground" />
    </Card>
  );
}

export function PotentialList({
  picks,
  lockedCount,
}: {
  picks: PotentialPick[];
  lockedCount: number;
}) {
  const shown = picks.length;
  return (
    <div className="flex flex-col gap-4">
      {picks.map((pick) => (
        <PotentialPickCard key={pick.symbol} pick={pick} />
      ))}
      {Array.from({ length: lockedCount }, (_, i) => (
        <LockedRow key={`locked-${i}`} rank={shown + i + 1} />
      ))}
    </div>
  );
}
