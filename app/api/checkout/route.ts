import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getStripe,
  PRO_PRICE_CENTS,
  PRO_PRODUCT_DESCRIPTION,
  PRO_PRODUCT_NAME,
  PRO_TRIAL_DAYS,
} from "@/lib/stripe";

/**
 * Starts Stripe Checkout for the monthly Pro subscription.
 *
 * `mode: "subscription"` means Stripe keeps the card on file and raises the
 * next invoice itself when the paid month runs out — that renewal is the
 * product's recurring charge, and cancelling before it lands stops it, even
 * with hours to spare.
 *
 * First-time members get a free trial (see PRO_TRIAL_HOURS): the card is still
 * taken at checkout, but the first charge only lands when the trial's hours run
 * out, so cancelling before then costs nothing.
 *
 * An existing customer id is reused so a returning user's payments all sit
 * under one Stripe customer rather than a new one per checkout.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Derive the origin from the request so checkout redirects work on whatever
  // port the app is actually running on (dev autoPort, preview, production).
  const siteUrl =
    request.headers.get("origin") ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    new URL(request.url).origin;

  try {
    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("stripe_customer_id, stripe_subscription_id")
      .eq("id", user.id)
      .maybeSingle();

    const customerId = profile?.stripe_customer_id ?? null;

    // The free trial is for first-time members. Anyone Stripe has seen before —
    // a past customer or a lapsed subscription — subscribes straight away.
    const offerTrial = !customerId && !profile?.stripe_subscription_id;

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      ...(customerId
        ? { customer: customerId }
        : { customer_email: user.email }),
      client_reference_id: user.id,
      metadata: { userId: user.id },
      // Also stamped on the subscription itself, so a webhook or a support
      // lookup can map it back to an account without the session.
      subscription_data: {
        metadata: { userId: user.id },
        ...(offerTrial ? { trial_period_days: PRO_TRIAL_DAYS } : {}),
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: PRO_PRICE_CENTS,
            recurring: { interval: "month" },
            product_data: {
              name: PRO_PRODUCT_NAME,
              description: PRO_PRODUCT_DESCRIPTION,
            },
          },
        },
      ],
      success_url: `${siteUrl}/account/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/account`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Failed to create checkout session", error);
    return NextResponse.json(
      { error: "Could not start checkout." },
      { status: 500 },
    );
  }
}
