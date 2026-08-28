import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import {
  getAccountSubscription,
  syncSubscriptionFromStripe,
} from "@/lib/subscription";

export type SubscriptionResponse = {
  isPaid: boolean;
  proExpiresAt: string | null;
  autoRenew: boolean;
  status: string | null;
  hasSubscription: boolean;
};

/** Current plan state, refreshed from Stripe when the period is nearly up. */
export async function GET() {
  const account = await getAccountSubscription();
  if (!account) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const body: SubscriptionResponse = {
    isPaid: account.isPaid,
    proExpiresAt: account.proExpiresAt,
    autoRenew: account.autoRenew,
    status: account.status,
    hasSubscription: account.hasSubscription,
  };
  return NextResponse.json(body);
}

/**
 * Flips auto-pay.
 *
 * Turning it off sets `cancel_at_period_end` on the Stripe subscription: no
 * further invoice is raised, and the user keeps everything they have already
 * paid for until the period ends. That is what makes "cancel any time, even
 * the day before" true rather than a slogan — the switch works right up to the
 * moment Stripe bills.
 *
 * Turning it back on clears the flag, and Stripe resumes billing at the end of
 * the current period.
 */
export async function PATCH(request: Request) {
  const account = await getAccountSubscription();
  if (!account) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let autoRenew: boolean;
  try {
    const body = (await request.json()) as { autoRenew?: unknown };
    if (typeof body.autoRenew !== "boolean") throw new Error("bad body");
    autoRenew = body.autoRenew;
  } catch {
    return NextResponse.json(
      { error: "Send { autoRenew: true | false }." },
      { status: 400 },
    );
  }

  if (!account.subscriptionId) {
    return NextResponse.json(
      { error: "There's no active subscription to change." },
      { status: 409 },
    );
  }

  try {
    const stripe = getStripe();
    await stripe.subscriptions.update(account.subscriptionId, {
      cancel_at_period_end: !autoRenew,
    });
  } catch (error) {
    console.error("Failed to update auto-renew on Stripe", error);
    return NextResponse.json(
      { error: "Stripe wouldn't accept that change. Try again in a moment." },
      { status: 502 },
    );
  }

  // Read the subscription back rather than trusting the write: Stripe is the
  // source of truth for both the flag and the renewal date.
  const refreshed = await syncSubscriptionFromStripe(
    account.userId,
    account.subscriptionId,
  );

  if (!refreshed) {
    // The change did land on Stripe, so record the user's intent locally even
    // though the read-back failed.
    const admin = createAdminClient();
    await admin
      .from("profiles")
      .update({ auto_renew: autoRenew })
      .eq("id", account.userId);
    return NextResponse.json({
      isPaid: account.isPaid,
      proExpiresAt: account.proExpiresAt,
      autoRenew,
      status: account.status,
      hasSubscription: true,
    } satisfies SubscriptionResponse);
  }

  return NextResponse.json(refreshed satisfies SubscriptionResponse);
}
