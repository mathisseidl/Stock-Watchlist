"use client";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PotentialList } from "@/components/potential/potential-list";
import { PotentialExplainer } from "@/components/potential/potential-explainer";
import { PotentialDisclaimer } from "@/components/potential/potential-disclaimer";
import { PotentialUpsell } from "@/components/potential/potential-upsell";
import { usePotential } from "@/hooks/use-potential";
import { useProStatus } from "@/hooks/use-pro";

export default function PotentialPage() {
  const { data, isLoading } = usePotential();
  const { isPaid, ready: planReady } = useProStatus();

  const meta = data?.meta;
  const snapshot = meta && !("building" in meta) ? meta : null;
  const building = !!meta && "building" in meta;
  const hasPicks = !!data && data.picks.length > 0;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Potential</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            A hand-picked shortlist, scored by simulation once a week.
          </p>
        </div>
        {snapshot && (
          <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
            In focus · {snapshot.isoWeek}
            {snapshot.stale && " · refreshing"}
          </span>
        )}
      </div>

      {data && snapshot && (
        <PotentialExplainer
          example={data.picks[0]}
          universeCount={snapshot.universeCount}
          simulations={snapshot.simulations}
        />
      )}

      {isLoading ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : building ? (
        <Card className="items-center gap-2 p-10 text-center">
          <p className="text-sm font-medium">
            This week&apos;s screen is being built.
          </p>
          <p className="text-sm text-muted-foreground">
            Check back shortly — the simulation runs once a week.
          </p>
        </Card>
      ) : hasPicks ? (
        <PotentialList picks={data.picks} lockedCount={data.lockedCount} />
      ) : (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          No picks this week — nothing in the universe cleared the bar.
        </Card>
      )}

      {planReady && !isPaid && hasPicks && (
        <PotentialUpsell lockedCount={data.lockedCount} />
      )}

      <PotentialDisclaimer className="border-t border-border pt-4" />
    </div>
  );
}
