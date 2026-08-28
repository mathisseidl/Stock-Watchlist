import { Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { UpgradeButton } from "@/components/pricing/upgrade-button";
import { AuthForm } from "@/components/auth/auth-form";
import { createClient } from "@/lib/supabase/server";

const freeFeatures = [
  "Search any stock by name",
  "Your own watchlist",
  "Live prices and full charts",
  "The top 3 news stories for every stock",
  "See what a past investment would be worth today",
];

const proFeatures = [
  "Everything in Free",
  "Unlimited investment analysis",
  "A Pro badge in the app header",
];

function FeatureList({ features }: { features: string[] }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {features.map((feature) => (
        <li key={feature} className="flex items-start gap-2.5 text-sm">
          <Check className="mt-0.5 size-4 shrink-0 text-gain" />
          {feature}
        </li>
      ))}
    </ul>
  );
}

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Guests see the sign-up form here.
  if (!user) {
    return (
      <div className="flex flex-col items-center gap-4 py-4">
        <AuthForm
          mode="signup"
          subtitle="Create an account to keep your watchlist saved across devices."
        />
        <p className="text-sm text-muted-foreground">
          Signing up is free. Everything except unlimited investment analysis is
          on the Free plan.
        </p>
      </div>
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_paid")
    .eq("id", user.id)
    .maybeSingle();
  const isPaid = Boolean(profile?.is_paid);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Account</h1>
        <p className="text-sm text-muted-foreground">
          You&apos;re signed in as {user.email}. Choose the plan that fits you.
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
          <FeatureList features={freeFeatures} />
          <p className="mt-auto rounded-full border border-border py-2 text-center text-sm font-medium text-muted-foreground">
            {isPaid ? "Included" : "Your current plan"}
          </p>
        </Card>

        <Card className="gap-5 border-primary p-6 ring-1 ring-primary/30">
          <div>
            <h2 className="text-lg font-semibold">Pro</h2>
            <p className="mt-1 text-3xl font-semibold">
              $4.99
              <span className="text-base font-normal text-muted-foreground">
                {" "}
                / year
              </span>
            </p>
          </div>
          <FeatureList features={proFeatures} />
          <div className="mt-auto">
            {isPaid ? (
              <p className="rounded-full bg-gain-soft py-2 text-center text-sm font-medium text-gain">
                ✓ You&apos;re on Pro
              </p>
            ) : (
              <UpgradeButton />
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
