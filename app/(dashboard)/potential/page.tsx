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
  const { ready: planReady } = useProStatus();

  const meta = data?.meta;
  const locked = !!meta && "locked" in meta;
  const building = !!meta && "building" in meta;
  const snapshot =
    meta && !("locked" in meta) && !("building" in meta) ? meta : null;
  const hasPicks = !!data && data.picks.length > 0;
  const universeCount =
    meta && "universeCount" in meta ? meta.universeCount : undefined;
  const simulations =
    meta && "simulations" in meta ? meta.simulations : undefined;

  // Non-Pro readers get the upsell and nothing else — no locked rows, no
  // explainer, no disclaimer (there's nothing on the page to disclaim).
  if (!isLoading && planReady && locked) {
    return (
      <div className="flex max-w-2xl flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold">Potential</h1>
          <p className="mt-1 text-sm text-muted-foreground">Six rising stocks</p>
        </div>
        <PotentialUpsell />
      </div>
    );
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Potential</h1>
          <p className="mt-1 text-sm text-muted-foreground">Six rising stocks</p>
        </div>
        {snapshot && (
          <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
            In focus · {snapshot.isoWeek}
            {snapshot.stale && " · refreshing"}
          </span>
        )}
      </div>

      {isLoading || !planReady ? (
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
        <PotentialList picks={data.picks} lockedCount={0} />
      ) : (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          No picks this week — nothing in the universe cleared the bar.
        </Card>
      )}

      {snapshot && (
        <PotentialExplainer
          example={hasPicks ? data.picks[0] : undefined}
          universeCount={universeCount}
          simulations={simulations}
        />
      )}

      {snapshot && (
        <PotentialDisclaimer className="border-t border-border pt-4" />
      )}
    </div>
  );
}
