import { Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { UpgradeButton } from "@/components/pricing/upgrade-button";
import { AuthForm } from "@/components/auth/auth-form";
import { createClient } from "@/lib/supabase/server";

const freeFeatures = [
  "Search any stock",
  "Save stocks to your watchlist",
  "Live prices, charts & news",
  "Analyse stock: 3 searches per day",
];

const proFeatures = [
  "Everything in Free",
  "Unlimited Analytics searches",
];

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
          subtitle="To save your watchlist or to use the Analytics section unlimited, sign up."
        />
        <p className="text-sm text-muted-foreground">
          After signing up you can stay on Free or upgrade to Pro.
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
            <h2 className="text-lg font-semibold">Pro</h2>
            <p className="mt-1 text-3xl font-semibold">
              $4.99
              <span className="text-base font-normal text-muted-foreground">
                {" "}
                / year
              </span>
            </p>
          </div>
          <ul className="flex flex-col gap-2">
            {proFeatures.map((feature) => (
              <li key={feature} className="flex items-start gap-2 text-sm">
                <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                {feature}
              </li>
            ))}
          </ul>
          <div className="mt-auto">
            {isPaid ? (
              <p className="rounded-full bg-emerald-50 py-2 text-center text-sm font-medium text-emerald-600">
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
