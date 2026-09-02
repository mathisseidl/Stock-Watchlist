import { createAdminClient } from "@/lib/supabase/admin";
import type { PotentialSnapshot } from "@/lib/potential/types";

const TABLE = "potential_snapshots";

/**
 * The most recent finished weekly run. The page reads this and nothing else —
 * no compute on the request path. Returns null before the first run has landed.
 */
export async function readLatestSnapshot(): Promise<PotentialSnapshot | null> {
  const db = createAdminClient();
  const { data, error } = await db
    .from(TABLE)
    .select("payload")
    .eq("status", "ready")
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data.payload as PotentialSnapshot;
}

/** Upsert a finished run, keyed by ISO week so a re-run overwrites in place. */
export async function writeSnapshot(snapshot: PotentialSnapshot): Promise<void> {
  const db = createAdminClient();
  const { error } = await db.from(TABLE).upsert(
    {
      iso_week: snapshot.isoWeek,
      as_of_date: snapshot.asOfDate,
      status: "ready",
      payload: snapshot,
      universe_version: snapshot.universeVersion,
      generated_at: snapshot.generatedAt,
    },
    { onConflict: "iso_week" },
  );

  if (error) {
    throw new Error(`Failed to write potential snapshot: ${error.message}`);
  }
}
