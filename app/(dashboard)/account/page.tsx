import { Check, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { UpgradeButton } from "@/components/pricing/upgrade-button";
import { AuthForm } from "@/components/auth/auth-form";
import { SubscriptionCard } from "@/components/account/subscription-card";
import { InviteCard } from "@/components/account/invite-card";
import { createClient } from "@/lib/supabase/server";
import { getAccountSubscription } from "@/lib/subscription";
import { proDaysRemaining } from "@/lib/pro";
import { cn } from "@/lib/utils";

/**
 * Eight lines, and no more. Written for someone who has never used the app:
 * short, plain, and about what they get rather than how it works.
 */
const freeFeatures = [
  "Search any stock by name or ticker",
  "Your own watchlist, saved across your devices",
  "Live prices and charts, from one day to all time",
  "The 3 best news stories on every stock",
  "A daily digest of what moved on your list",
  "Test a past investment — 3 times a day",
  "A free S&P 500 forecast",
  "Add friends and compare watchlists",
];

/**
 * What Free does not get. Only claims that are actually true of Free belongs
 * here — a cross against something a free reader already has would be worse
 * than saying nothing.
 */
const freeMissing = [
  "Forecasts on any stock, not just the S&P 500",
  "News summary for every stock in 6 lines",
  "Unlimited investment analysis",
];

const proFeatures = [
  "Everything in Free",
  "Forecast any stock: best case, likely case and worst case on a date you pick",
  "News summary for every stock in 6 lines",
  "Unlimited what-if investment analysis",
  "Every forecast shows the 14 named methods behind it",
  "Cancel any time — right up to the day before the next payment",
];

function FeatureList({
  features,
  missing = false,
}: {
  features: string[];
  missing?: boolean;
}) {
  return (
    <ul className="flex flex-col gap-2.5">
      {features.map((feature) => (
        <li
          key={feature}
          className={cn(
            "flex items-start gap-2.5 text-sm",
            missing && "text-muted-foreground",
          )}
        >
          {missing ? (
            <X className="mt-0.5 size-4 shrink-0 text-loss" />
          ) : (
            <Check className="mt-0.5 size-4 shrink-0 text-gain" />
          )}
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
          Signing up is free. Forecasting any stock, the news summaries and
          unlimited investment analysis are on Pro.
        </p>
      </div>
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, created_at")
    .eq("id", user.id)
    .maybeSingle();

  // Reads the plan through Stripe when the paid period is nearly up, so a
  // renewal that just landed is already reflected here.
  const account = await getAccountSubscription();
  const isPaid = account?.isPaid ?? false;
  const proExpiresAt = account?.proExpiresAt ?? null;
  const autoRenew = account?.autoRenew ?? false;
  const daysLeft = proDaysRemaining(proExpiresAt);

  const username = profile?.username ?? null;
  const memberSince = profile?.created_at ?? user.created_at;
  const initials = (user.email ?? "MS").slice(0, 2).toUpperCase();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Account</h1>
        <p className="text-sm text-muted-foreground">Your profile and plan.</p>
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

      <SubscriptionCard initialExpiresAt={proExpiresAt} />

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
              <p className="mt-1 text-xs text-muted-foreground">
                No card, no trial clock. It just stays free.
              </p>
            </div>
            <FeatureList features={freeFeatures} />

            <div className="border-t border-border pt-4">
              <p className="mb-2.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Not on Free
              </p>
              <FeatureList features={freeMissing} missing />
            </div>

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
                  /month
                </span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Renews monthly. Cancel any time — even the day before the next
                payment — and you keep the days you&apos;ve paid for.
              </p>
            </div>
            <FeatureList features={proFeatures} />
            <div className="mt-auto">
              {isPaid ? (
                <div className="rounded-xl bg-gain-soft py-2 text-center">
                  <p className="text-sm font-medium text-gain">
                    {proExpiresAt
                      ? `✓ Active until ${new Date(proExpiresAt).toLocaleDateString(
                          "en-US",
                          { day: "numeric", month: "long", year: "numeric" },
                        )}`
                      : "✓ Active — no end date"}
                  </p>
                  <p className="num text-xs text-gain/80">
                    {daysLeft !== null ? `${daysLeft} days left · ` : ""}
                    {autoRenew ? "renews automatically" : "will not renew"}
                  </p>
                </div>
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
