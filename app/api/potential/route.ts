import { NextResponse } from "next/server";
import { getAccountSubscription } from "@/lib/subscription";
import { readLatestSnapshot } from "@/lib/potential/store";
import { currentIsoWeek } from "@/lib/potential/week";
import type { PotentialPick, PotentialSnapshot } from "@/lib/potential/types";

export type PotentialMeta =
  | { building: true }
  | {
      isoWeek: string;
      asOfDate: string;
      generatedAt: string;
      universeCount: number;
      simulations: number;
      /** The snapshot is from a previous week; a refresh is due. */
      stale: boolean;
      isPaid: boolean;
    };

export type PotentialResponse = {
  meta: PotentialMeta;
  picks: PotentialPick[];
  /** Picks hidden behind the Pro gate (0 for Pro readers). */
  lockedCount: number;
  runnersUp: PotentialSnapshot["runnersUp"];
  skipped: PotentialSnapshot["skipped"];
};

/**
 * The current "Potential" screen. Reads the latest weekly snapshot and nothing
 * else — the simulation runs in a separate weekly job, never on this request.
 *
 * Free readers see pick #1 in full and a count of the rest; Pro sees all five.
 * Mirrors the sample-vs-Pro split on `/api/forecast`.
 */
export async function GET() {
  const snapshot = await readLatestSnapshot();

  if (!snapshot) {
    return NextResponse.json<PotentialResponse>({
      meta: { building: true },
      picks: [],
      lockedCount: 0,
      runnersUp: [],
      skipped: [],
    });
  }

  const account = await getAccountSubscription();
  const isPaid = !!account?.isPaid;

  const full = snapshot.picks;
  const stale = snapshot.isoWeek !== currentIsoWeek();

  return NextResponse.json<PotentialResponse>({
    meta: {
      isoWeek: snapshot.isoWeek,
      asOfDate: snapshot.asOfDate,
      generatedAt: snapshot.generatedAt,
      universeCount: snapshot.universeCount,
      simulations: snapshot.simulations,
      stale,
      isPaid,
    },
    picks: isPaid ? full : full.slice(0, 1),
    lockedCount: isPaid ? 0 : Math.max(0, full.length - 1),
    runnersUp: isPaid ? snapshot.runnersUp : [],
    skipped: snapshot.skipped,
  });
}
