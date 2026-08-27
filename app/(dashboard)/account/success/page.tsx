import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";

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
        await admin
          .from("profiles")
          .update({ is_paid: true })
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
            <CheckCircle2 className="size-12 text-emerald-500" />
            <h1 className="text-xl font-semibold">You&apos;re all set!</h1>
            <p className="text-sm text-muted-foreground">
              Your payment was successful. Analytics is now unlimited on your
              account.
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
            <XCircle className="size-12 text-red-500" />
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
