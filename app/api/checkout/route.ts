import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStripe, UPGRADE_PRICE_CENTS } from "@/lib/stripe";

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
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: user.email,
      client_reference_id: user.id,
      metadata: { userId: user.id },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: UPGRADE_PRICE_CENTS,
            product_data: {
              name: "MATMAX Analytics Unlimited",
              description:
                "One-time unlock for unlimited use of the Analytics calculator.",
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
