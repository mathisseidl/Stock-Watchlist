import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccountSubscription } from "@/lib/subscription";
import type { SubscriptionResponse } from "@/app/api/subscription/route";

/**
 * Starts the no-card free trial for the signed-in member.
 *
 * This is the only thing that sets `trial_started_at`, and it only ever
 * writes the caller's own id (taken from the verified session, never from the
 * request body) — the same reasoning as `/api/account/logo`, since `profiles`
 * grants table-level UPDATE on every column and this route runs on the
 * service role specifically so no RLS policy has to open that door.
 *
 * No Stripe call here: the trial is entirely local, which is the point.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in to start your free trial." },
      { status: 401 },
    );
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("trial_started_at, stripe_subscription_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.trial_started_at || profile?.stripe_subscription_id) {
    return NextResponse.json(
      { error: "The free trial isn't available for this account." },
      { status: 409 },
    );
  }

  const { error } = await admin
    .from("profiles")
    .update({ trial_started_at: new Date().toISOString() })
    .eq("id", user.id);

  if (error) {
    console.error(`Failed to start the trial for ${user.id}`, error);
    return NextResponse.json(
      { error: "Couldn't start the trial. Try again." },
      { status: 500 },
    );
  }

  const account = await getAccountSubscription();
  if (!account) {
    return NextResponse.json(
      { error: "Sign in to start your free trial." },
      { status: 401 },
    );
  }

  return NextResponse.json({
    isPaid: account.isPaid,
    proExpiresAt: account.proExpiresAt,
    autoRenew: account.autoRenew,
    status: account.status,
    hasSubscription: account.hasSubscription,
    trialEligible: account.trialEligible,
  } satisfies SubscriptionResponse);
}
