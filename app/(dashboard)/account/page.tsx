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
  "Live prices and charts",
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
  "Test a past investment — Unlimited",
];

/**
 * What a guest gets by creating a free account — the case for signing up, shown
 * beside the form. Persistence and Community, not Pro features.
 */
const guestUnlocks: Feature[] = [
  "Your watchlist saved to your account",
  "Notifications, number-format and chart-range preferences saved and synced",
  "Add friends and compare watchlists",
  {
    text: "Option to upgrade to Pro",
    // Named here rather than in a sentence under the card, so the reader can
    // see what the upgrade actually buys at the moment they read about it.
    sub: [
      "Forecast on any stock",
      "A news summary from the past 24h on any stock in your watchlist",
      "Unlimited Lookbacks",
    ],
  },
];

const proFeatures = [
  "Everything in Free",
  "Forecast any stock: best case, likely case and worst case on a date you pick",
  // Sits directly under the forecast line: it describes that feature, not a
  // separate one.
  "Every forecast shows the 14 named methods behind it",
  "News summary for every stock in 6 lines",
  "Test a past investment — Unlimited",
  "Cancel any time — up to the day before the next payment",
];

/** A line in a feature list, optionally with its own nested checklist. */
type Feature = string | { text: string; sub: string[] };

function FeatureList({
  features,
  missing = false,
}: {
  features: Feature[];
  missing?: boolean;
}) {
  return (
    <ul className="flex flex-col gap-2.5">
      {features.map((feature) => {
        const text = typeof feature === "string" ? feature : feature.text;
        const sub = typeof feature === "string" ? null : feature.sub;
        return (
          <li
            key={text}
            className={cn("text-sm", missing && "text-muted-foreground")}
          >
            <span className="flex items-start gap-2.5">
              {missing ? (
                <X className="mt-0.5 size-4 shrink-0 text-loss" />
              ) : (
                <Check className="mt-0.5 size-4 shrink-0 text-gain" />
              )}
              {text}
            </span>
            {sub && (
              // Muted ticks, not green ones: these come with the upgrade
              // rather than with the free account this list is describing.
              <ul className="mt-2 flex flex-col gap-1.5 pl-6.5">
                {sub.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-2 text-sm text-muted-foreground"
                  >
                    <Check className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/60" />
                    {item}
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Guests see the sign-up form here, next to what an account unlocks.
  if (!user) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold">Create your account</h1>
        </div>

        <div className="grid items-start gap-6 md:grid-cols-2">
          <Card className="gap-5 p-6">
            <div>
              <h2 className="text-lg font-semibold">
                What signing up{" "}
                <span className="text-xl">for free</span> unlocks
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Free, no card. Takes a minute.
              </p>
            </div>
            <FeatureList features={guestUnlocks} />
          </Card>

          <div className="flex justify-center md:justify-start">
            <AuthForm mode="signup" subtitle="" />
          </div>
        </div>
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
  const isTrialing = account?.status === "trialing";
  const hadSubscription = account?.hasSubscription ?? false;
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
                $1.99
                <span className="text-base font-normal text-muted-foreground">
                  /month
                </span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {isPaid || hadSubscription
                  ? "Renews monthly. Cancel any time — even the day before the next payment — and you keep the days you've paid for."
                  : "Starts with a 7-day free trial. Then $1.99/month — cancel any time before the trial ends and you won't be charged."}
              </p>
            </div>
            <FeatureList features={proFeatures} />

            {/* Set apart from the feature list on purpose — it's reassurance
                about the checkout, not another thing the plan includes, and
                shouldn't read as the last bullet. */}
            <div className="mt-2 flex items-start gap-2.5 border-t border-border pt-5 text-sm">
              <Check className="mt-0.5 size-4 shrink-0 text-gain" />
              <span>
                Payment provider: <span className="font-medium">Stripe</span>{" "}
                <span className="text-muted-foreground">
                  (trusted by Google, Amazon, Shopify, etc.)
                </span>
              </span>
            </div>

            <div className="mt-auto">
              {isPaid ? (
                <div className="rounded-xl bg-gain-soft py-2 text-center">
                  <p className="text-sm font-medium text-gain">
                    {isTrialing && proExpiresAt
                      ? `✓ Free trial until ${new Date(proExpiresAt).toLocaleDateString(
                          "en-US",
                          { day: "numeric", month: "long", year: "numeric" },
                        )}`
                      : proExpiresAt
                        ? `✓ Active until ${new Date(proExpiresAt).toLocaleDateString(
                            "en-US",
                            { day: "numeric", month: "long", year: "numeric" },
                          )}`
                        : "✓ Active — no end date"}
                  </p>
                  <p className="num text-xs text-gain/80">
                    {daysLeft !== null ? `${daysLeft} days left · ` : ""}
                    {isTrialing
                      ? autoRenew
                        ? "first charge then"
                        : "cancelled — ends free"
                      : autoRenew
                        ? "renews automatically"
                        : "will not renew"}
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
