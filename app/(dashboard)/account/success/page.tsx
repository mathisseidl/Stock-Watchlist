import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { proExpiryFrom, PRO_TERM_MONTHS } from "@/lib/pro";

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id: sessionId } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let paid = false;
  if (sessionId && user) {
    try {
      const stripe = getStripe();
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      // Only unlock when Stripe confirms payment AND the session belongs to the
      // signed-in user (guards against replaying someone else's session id).
      if (
        session.payment_status === "paid" &&
        session.metadata?.userId === user.id
      ) {
        const admin = createAdminClient();
        // One-time charge buying a fixed term — record when it lapses so
        // access ends unless they buy again. Nothing auto-renews.
        await admin
          .from("profiles")
          .update({
            is_paid: true,
            pro_expires_at: proExpiryFrom().toISOString(),
          })
          .eq("id", user.id);
        paid = true;
      }
    } catch (error) {
      console.error("Failed to verify checkout session", error);
    }
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="w-full max-w-md items-center gap-4 p-8 text-center">
        {paid ? (
          <>
            <CheckCircle2 className="size-12 text-gain" />
            <h1 className="text-xl font-semibold">You&apos;re all set!</h1>
            <p className="text-sm text-muted-foreground">
              Your payment went through. Analytics is unlimited for the next{" "}
              {PRO_TERM_MONTHS} months — no subscription, nothing renews.
            </p>
            <Link
              href="/analytics"
              className={cn(buttonVariants(), "rounded-full")}
            >
              Go to Analytics
            </Link>
          </>
        ) : (
          <>
            <XCircle className="size-12 text-loss" />
            <h1 className="text-xl font-semibold">
              We couldn&apos;t confirm your payment
            </h1>
            <p className="text-sm text-muted-foreground">
              If you completed checkout, give it a moment and refresh. Otherwise
              you can try again from the Account page.
            </p>
            <Link
              href="/account"
              className={cn(
                buttonVariants({ variant: "outline" }),
                "rounded-full",
              )}
            >
              Back to Account
            </Link>
          </>
        )}
      </Card>
    </div>
  );
}
