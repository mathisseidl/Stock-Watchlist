import type Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { isProActive, type ProProfile } from "@/lib/pro";

/**
 * Pro is a real Stripe subscription. Stripe owns the schedule and the money;
 * these columns are a local mirror so a page render never has to wait on a
 * Stripe round-trip.
 *
 * The mirror is refreshed lazily — whenever the period we recorded is close to
 * running out or has already passed. That is exactly the moment Stripe bills
 * the next month, so by the time a user looks at their account after a
 * renewal, the date they see has already rolled forward.
 */

/** Refresh from Stripe once the recorded period is inside this window. */
const SYNC_WINDOW_MS = 2 * 60 * 1000;

export type SubscriptionState = {
  isPaid: boolean;
  /** End of the period the user has paid for. */
  proExpiresAt: string | null;
  /** Whether Stripe will charge again when the period ends. */
  autoRenew: boolean;
  /** Stripe's own status: active, past_due, canceled, … */
  status: string | null;
  hasSubscription: boolean;
};

type ProfileRow = ProProfile & {
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
};

/**
 * Stripe moved the billing period onto the subscription *item* in the 2025
 * API versions, keeping it on the subscription for older ones. Read whichever
 * this account's API version actually returns.
 */
function periodEndOf(subscription: Stripe.Subscription): number | null {
  const item = subscription.items?.data?.[0] as
    | { current_period_end?: number }
    | undefined;
  if (typeof item?.current_period_end === "number") {
    return item.current_period_end;
  }
  const legacy = (subscription as unknown as { current_period_end?: number })
    .current_period_end;
  return typeof legacy === "number" ? legacy : null;
}

/** Statuses that should still open the Pro features. */
function grantsAccess(status: Stripe.Subscription.Status): boolean {
  return status === "active" || status === "trialing" || status === "past_due";
}

function stateFromProfile(profile: ProfileRow | null): SubscriptionState {
  return {
    isPaid: isProActive(profile),
    proExpiresAt: profile?.pro_expires_at ?? null,
    // No subscription means no card on file and nothing to renew — chiefly the
    // accounts that bought Pro before it became monthly. Reporting auto-pay as
    // "on" for them would promise a charge that will never happen.
    autoRenew: profile?.stripe_subscription_id
      ? (profile.auto_renew ?? true)
      : false,
    status: profile?.subscription_status ?? null,
    hasSubscription: Boolean(profile?.stripe_subscription_id),
  };
}

function needsSync(profile: ProfileRow | null): boolean {
  if (!profile?.stripe_subscription_id) return false;
  if (!profile.pro_expires_at) return true;
  const expires = new Date(profile.pro_expires_at).getTime();
  if (Number.isNaN(expires)) return true;
  return expires - Date.now() < SYNC_WINDOW_MS;
}

/**
 * Pull the live subscription from Stripe and write it back to the profile.
 * Returns the refreshed state, or null when there is nothing to sync.
 */
export async function syncSubscriptionFromStripe(
  userId: string,
  subscriptionId: string,
): Promise<SubscriptionState | null> {
  let subscription: Stripe.Subscription;
  try {
    subscription = await getStripe().subscriptions.retrieve(subscriptionId);
  } catch (error) {
    // A Stripe outage must not lock a paying user out of what they bought —
    // the mirror simply stays as it was until the next attempt.
    console.error("Failed to refresh subscription from Stripe", error);
    return null;
  }

  const periodEnd = periodEndOf(subscription);
  const active = grantsAccess(subscription.status);
  const proExpiresAt =
    periodEnd !== null ? new Date(periodEnd * 1000).toISOString() : null;
  const autoRenew = active && !subscription.cancel_at_period_end;

  const admin = createAdminClient();
  await admin
    .from("profiles")
    .update({
      is_paid: active,
      pro_expires_at: proExpiresAt,
      auto_renew: autoRenew,
      subscription_status: subscription.status,
      stripe_customer_id:
        typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer.id,
      stripe_subscription_id: subscription.id,
    })
    .eq("id", userId);

  return {
    isPaid: isProActive({ is_paid: active, pro_expires_at: proExpiresAt }),
    proExpiresAt,
    autoRenew,
    status: subscription.status,
    hasSubscription: true,
  };
}

export type AccountSubscription = SubscriptionState & {
  userId: string;
  email: string | null;
  customerId: string | null;
  subscriptionId: string | null;
};

/**
 * The signed-in user's plan, refreshed from Stripe when the recorded period is
 * about to lapse. Returns null for guests.
 */
export async function getAccountSubscription(): Promise<AccountSubscription | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select(
      "is_paid, pro_expires_at, auto_renew, subscription_status, stripe_customer_id, stripe_subscription_id",
    )
    .eq("id", user.id)
    .maybeSingle();

  const profile = (data ?? null) as ProfileRow | null;
  let state = stateFromProfile(profile);

  if (needsSync(profile) && profile?.stripe_subscription_id) {
    const refreshed = await syncSubscriptionFromStripe(
      user.id,
      profile.stripe_subscription_id,
    );
    if (refreshed) state = refreshed;
  }

  return {
    ...state,
    userId: user.id,
    email: user.email ?? null,
    customerId: profile?.stripe_customer_id ?? null,
    subscriptionId: profile?.stripe_subscription_id ?? null,
  };
}

/** Convenience gate for API routes that are Pro-only. */
export async function requirePro(): Promise<
  { ok: true; account: AccountSubscription } | { ok: false; reason: "guest" | "free" }
> {
  const account = await getAccountSubscription();
  if (!account) return { ok: false, reason: "guest" };
  if (!account.isPaid) return { ok: false, reason: "free" };
  return { ok: true, account };
}
