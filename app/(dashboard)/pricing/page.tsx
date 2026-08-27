import { Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { UpgradeButton } from "@/components/pricing/upgrade-button";
import { createClient } from "@/lib/supabase/server";

const freeFeatures = [
  "Unlimited watchlist stocks",
  "Live prices, charts & news",
  "Day / Week / Month / Year / 5Y / All ranges",
  "Analytics: 3 what-if searches per day",
];

const paidFeatures = [
  "Everything in Free",
  "Unlimited Analytics what-if searches",
  "One-time payment — no subscription",
];

export default async function PricingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let isPaid = false;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_paid")
      .eq("id", user.id)
      .single();
    isPaid = Boolean(profile?.is_paid);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Pricing</h1>
        <p className="text-sm text-muted-foreground">
          Track stocks for free. Unlock unlimited Analytics with a one-time
          payment.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="gap-5 p-6">
          <div>
            <h2 className="text-lg font-semibold">Free</h2>
            <p className="mt-1 text-3xl font-semibold">
              $0
              <span className="text-base font-normal text-muted-foreground">
                {" "}
                / forever
              </span>
            </p>
          </div>
          <ul className="flex flex-col gap-2">
            {freeFeatures.map((feature) => (
              <li key={feature} className="flex items-start gap-2 text-sm">
                <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                {feature}
              </li>
            ))}
          </ul>
          <p className="mt-auto rounded-full border border-border py-2 text-center text-sm font-medium text-muted-foreground">
            {isPaid ? "Included" : "Your current plan"}
          </p>
        </Card>

        <Card className="gap-5 border-primary p-6 ring-1 ring-primary/30">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">Unlimited</h2>
              <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">
                One-time
              </span>
            </div>
            <p className="mt-1 text-3xl font-semibold">
              $3.99
              <span className="text-base font-normal text-muted-foreground">
                {" "}
                once
              </span>
            </p>
          </div>
          <ul className="flex flex-col gap-2">
            {paidFeatures.map((feature) => (
              <li key={feature} className="flex items-start gap-2 text-sm">
                <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                {feature}
              </li>
            ))}
          </ul>
          <div className="mt-auto">
            {isPaid ? (
              <p className="rounded-full bg-emerald-50 py-2 text-center text-sm font-medium text-emerald-600">
                ✓ You have unlimited access
              </p>
            ) : (
              <UpgradeButton />
            )}
          </div>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground">
        Payments run in Stripe test mode. Use card 4242 4242 4242 4242, any
        future expiry, any CVC and ZIP.
      </p>
    </div>
  );
}
