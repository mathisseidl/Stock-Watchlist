import { NextResponse } from "next/server";
import { requirePro } from "@/lib/subscription";
import { readLatestSnapshot } from "@/lib/potential/store";
import { currentIsoWeek } from "@/lib/potential/week";
import { POTENTIAL_UNIVERSE } from "@/lib/potential/universe";
import { SIMULATIONS_PER_RUN } from "@/lib/forecast/engine";
import type { PotentialPick, PotentialSnapshot } from "@/lib/potential/types";

export type PotentialMeta =
  | { building: true }
  | { locked: true; universeCount: number; simulations: number }
  | {
      isoWeek: string;
      asOfDate: string;
      generatedAt: string;
      universeCount: number;
      simulations: number;
      /** The snapshot is from a previous week; a refresh is due. */
      stale: boolean;
    };

export type PotentialResponse = {
  meta: PotentialMeta;
  picks: PotentialPick[];
  /** How many picks are hidden — 5 for a locked (non-Pro) reader, else 0. */
  lockedCount: number;
  runnersUp: PotentialSnapshot["runnersUp"];
  skipped: PotentialSnapshot["skipped"];
};

/**
 * The current "Potential" screen. Reads the latest weekly snapshot and nothing
 * else — the simulation runs in a separate weekly job. Pro only.
 */
export async function GET() {
  const snapshot = await readLatestSnapshot();

  const access = await requirePro();
  if (!access.ok) {
    return NextResponse.json<PotentialResponse>({
      meta: {
        locked: true,
        universeCount: snapshot?.universeCount ?? POTENTIAL_UNIVERSE.length,
        simulations: snapshot?.simulations ?? SIMULATIONS_PER_RUN,
      },
      picks: [],
      lockedCount: snapshot?.picks.length ?? 5,
      runnersUp: [],
      skipped: [],
    });
  }

  if (!snapshot) {
    return NextResponse.json<PotentialResponse>({
      meta: { building: true },
      picks: [],
      lockedCount: 0,
      runnersUp: [],
      skipped: [],
    });
  }

  return NextResponse.json<PotentialResponse>({
    meta: {
      isoWeek: snapshot.isoWeek,
      asOfDate: snapshot.asOfDate,
      generatedAt: snapshot.generatedAt,
      universeCount: snapshot.universeCount,
      simulations: snapshot.simulations,
      stale: snapshot.isoWeek !== currentIsoWeek(),
    },
    picks: snapshot.picks,
    lockedCount: 0,
    runnersUp: snapshot.runnersUp,
    skipped: snapshot.skipped,
  });
}
