import { Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { UpgradeButton } from "@/components/pricing/upgrade-button";
import { AuthForm } from "@/components/auth/auth-form";
import { UsageCard } from "@/components/account/usage-card";
import { BillingCard } from "@/components/account/billing-card";
import { AccountStats } from "@/components/account/account-stats";
import { InviteCard } from "@/components/account/invite-card";
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
    .select("is_paid, username, created_at")
    .eq("id", user.id)
    .maybeSingle();

  const isPaid = Boolean(profile?.is_paid);
  const username = profile?.username ?? null;
  const memberSince = profile?.created_at ?? user.created_at;
  const initials = (user.email ?? "MS").slice(0, 2).toUpperCase();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Account</h1>
        <p className="text-sm text-muted-foreground">
          Your plan, payments and how your watchlist is doing.
        </p>
      </div>

      {/* ---- Profile ------------------------------------------------- */}
      <Card className="gap-4 p-6">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar className="size-16">
            <AvatarFallback className="bg-neutral-900 text-lg font-semibold text-white">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold">{user.email}</p>
            <p className="text-sm text-muted-foreground">
              {username ? `@${username} · ` : ""}
              Member since{" "}
              {new Date(memberSince).toLocaleDateString("en-US", {
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>
          <span
            className={
              "rounded-full px-3 py-1 text-xs font-semibold " +
              (isPaid
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground")
            }
          >
            {isPaid ? "Pro" : "Free"}
          </span>
        </div>
      </Card>

      <UsageCard />
      <AccountStats />
      <BillingCard isPaid={isPaid} />

      {/* ---- Plans --------------------------------------------------- */}
      <div id="plans" className="flex flex-col gap-3 scroll-mt-6">
        <h2 className="text-lg font-semibold">Plans</h2>
        <div className="grid gap-6 md:grid-cols-2">
          <Card className="gap-5 p-6">
            <div>
              <h3 className="text-lg font-semibold">Free</h3>
              <p className="num mt-1 text-3xl font-semibold">
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
              <h3 className="text-lg font-semibold">Pro</h3>
              <p className="num mt-1 text-3xl font-semibold">
                $4.99
                <span className="text-base font-normal text-muted-foreground">
                  {" "}
                  once
                </span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                A single payment, not a subscription. Nothing renews.
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

      <InviteCard username={username} />
    </div>
  );
}
