import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";

export type Purchase = {
  id: string;
  amount: number;
  currency: string;
  created: number;
  receiptUrl: string | null;
  description: string;
};

/**
 * The signed-in user's completed payments.
 *
 * Checkout runs in `mode: "payment"`, so these are one-off charges — there is
 * no subscription to renew or cancel. Sessions are matched on the userId we
 * stamp into metadata at checkout, not on email, so a changed email address
 * still resolves to the right payments.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  try {
    const stripe = getStripe();
    const sessions = await stripe.checkout.sessions.list({ limit: 100 });

    const mine = sessions.data.filter(
      (session) =>
        session.metadata?.userId === user.id &&
        session.payment_status === "paid",
    );

    const purchases: Purchase[] = [];
    for (const session of mine) {
      let receiptUrl: string | null = null;

      // The receipt lives on the charge, which needs one more lookup.
      if (typeof session.payment_intent === "string") {
        try {
          const intent = await stripe.paymentIntents.retrieve(
            session.payment_intent,
            { expand: ["latest_charge"] },
          );
          const charge = intent.latest_charge;
          if (charge && typeof charge !== "string") {
            receiptUrl = charge.receipt_url ?? null;
          }
        } catch {
          // A missing receipt shouldn't hide the payment itself.
        }
      }

      purchases.push({
        id: session.id,
        amount: session.amount_total ?? 0,
        currency: session.currency ?? "usd",
        created: session.created,
        receiptUrl,
        description: "MATMAX Analytics Unlimited",
      });
    }

    purchases.sort((a, b) => b.created - a.created);

    return NextResponse.json({
      purchases,
      // Stated explicitly so the UI never implies a renewal that won't happen.
      recurring: false,
    });
  } catch (error) {
    console.error("Failed to load billing history", error);
    return NextResponse.json(
      { error: "Couldn't load your payment history." },
      { status: 502 },
    );
  }
}
