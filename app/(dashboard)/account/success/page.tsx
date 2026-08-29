import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { syncSubscriptionFromStripe } from "@/lib/subscription";
import { proExpiryFrom } from "@/lib/pro";

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
  let renewsOn: string | null = null;

  if (sessionId && user) {
    try {
      const stripe = getStripe();
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      // Only unlock when Stripe confirms payment AND the session belongs to the
      // signed-in user (guards against replaying someone else's session id).
      const belongsToUser = session.metadata?.userId === user.id;
      const settled =
        session.payment_status === "paid" ||
        session.payment_status === "no_payment_required";

      if (belongsToUser && settled) {
        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : (session.subscription?.id ?? null);

        if (subscriptionId) {
          // Stripe already knows when the first month ends and whether it will
          // renew, so take the dates from there rather than computing our own.
          const state = await syncSubscriptionFromStripe(
            user.id,
            subscriptionId,
          );
          paid = state?.isPaid ?? true;
          renewsOn = state?.proExpiresAt ?? null;
        } else {
          // Defensive: a session with no subscription attached still paid, so
          // grant the month rather than stranding them.
          const expires = proExpiryFrom().toISOString();
          const admin = createAdminClient();
          await admin
            .from("profiles")
            .update({ is_paid: true, pro_expires_at: expires })
            .eq("id", user.id);
          paid = true;
          renewsOn = expires;
        }
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
            <h1 className="text-xl font-semibold">You&apos;re Pro.</h1>
            <p className="text-sm text-muted-foreground">
              Forecasts, news briefings and unlimited analysis are open now.
              {renewsOn && (
                <>
                  {" "}
                  Your month runs to{" "}
                  <span className="font-medium text-foreground">
                    {new Date(renewsOn).toLocaleDateString("en-US", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </span>
                  , and renews at $1.99 unless you cancel your subscription
                  under &ldquo;Account&rdquo;.
                </>
              )}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Link
                href="/forecast"
                className={cn(buttonVariants(), "rounded-full")}
              >
                Run a forecast
              </Link>
              <Link
                href="/account"
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "rounded-full",
                )}
              >
                Manage plan
              </Link>
            </div>
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
