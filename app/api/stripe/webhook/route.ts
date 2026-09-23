import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { syncSubscriptionFromStripe } from "@/lib/subscription";

/**
 * Stripe calls this directly, independent of whether the customer's browser
 * ever makes it back to `/account/success`. That page is the fast path — it
 * syncs a subscription to the profile the moment someone completes checkout,
 * so they see Pro unlocked instantly. But a closed tab, a blocked redirect or
 * a network hiccup right after paying means that page never runs, and
 * without this webhook the subscription would exist in Stripe with no
 * `stripe_subscription_id` ever written to the profile — Stripe keeps
 * billing every month, and the account's own "cancel" button has nothing to
 * cancel. This is the source of truth that closes that gap.
 */
export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_KEY;
  if (!signature || !secret) {
    console.error("Stripe webhook received without a signature or secret configured");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const payload = await request.text();
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, secret);
  } catch (error) {
    console.error("Stripe webhook signature verification failed", error);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;
      const subscriptionId =
        typeof session.subscription === "string"
          ? session.subscription
          : (session.subscription?.id ?? null);
      if (userId && subscriptionId) {
        await syncSubscriptionFromStripe(userId, subscriptionId);
      }
      break;
    }

    // Covers auto-renew being toggled, a card failing, and every other status
    // change — not just cancellation.
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const userId = subscription.metadata?.userId;
      if (userId) {
        await syncSubscriptionFromStripe(userId, subscription.id);
      } else {
        console.error(
          `Stripe subscription ${subscription.id} has no userId metadata; can't sync it to a profile`,
        );
      }
      break;
    }

    default:
      break;
  }

  return NextResponse.json({ received: true });
}
