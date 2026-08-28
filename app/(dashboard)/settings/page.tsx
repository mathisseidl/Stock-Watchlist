"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { LogOut, Sun, Moon, Monitor } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { SecurityCard } from "@/components/settings/security-card";
import { SessionsCard } from "@/components/settings/sessions-card";
import {
  SettingRow,
  Toggle,
  SegmentedControl,
} from "@/components/settings/setting-row";
import { useUserSettings } from "@/components/settings/user-settings-provider";
import { RANGES } from "@/lib/ranges";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { CandleRange } from "@/lib/market-data/types";

const APP_VERSION = "1.0.0";

export default function SettingsPage() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [supabase] = useState(() => createClient());
  const [email, setEmail] = useState<string | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [isPaid, setIsPaid] = useState<boolean | null>(null);
  const [mounted, setMounted] = useState(false);

  const { settings, update, error } = useUserSettings();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration flag
    setMounted(true);
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) {
        setEmail(data.user.email);
      } else {
        setIsGuest(true);
      }
    });
    fetch("/api/analytics")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setIsPaid(Boolean(data.isPaid));
      })
      .catch(() => {});
  }, [supabase]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/my-stock");
    router.refresh();
  }

  const alertsOff = !settings.notificationsEnabled;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          How the app behaves, and your account security.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {isGuest ? (
        <Card className="gap-4 p-6">
          <div>
            <p className="text-base font-semibold">
              You&apos;re browsing as a guest
            </p>
            <p className="text-sm text-muted-foreground">
              Preferences below are saved on this device. Sign up to sync them
              and your watchlist across devices.
            </p>
          </div>
          <Link
            href="/account"
            className={cn(buttonVariants(), "w-fit rounded-full")}
          >
            Sign up
          </Link>
        </Card>
      ) : (
        <Card className="gap-4 p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{email ?? "—"}</p>
              <p className="text-xs text-muted-foreground">
                {isPaid === null
                  ? "Loading plan…"
                  : isPaid
                    ? "Pro plan"
                    : "Free plan"}
                {" · "}
                Plan, payments and receipts live in Account.
              </p>
            </div>
            <Link
              href="/account"
              className={cn(
                buttonVariants({ variant: "outline" }),
                "w-fit rounded-full",
              )}
            >
              Go to Account
            </Link>
          </div>
        </Card>
      )}

      {/* ---- Alerts -------------------------------------------------- */}
      <Card className="gap-5 p-6">
        <div>
          <h3 className="text-base font-semibold">Alerts</h3>
          <p className="text-sm text-muted-foreground">
            What we flag on your watchlist. Alerts appear in the app on My
            Stock.
          </p>
        </div>

        <SettingRow
          label="Alerts"
          description="Turn everything below off in one go."
          control={
            <Toggle
              label="Enable alerts"
              checked={settings.notificationsEnabled}
              onChange={(next) => update({ notificationsEnabled: next })}
            />
          }
        />

        <Separator />

        <SettingRow
          label="Big price moves"
          description="When a stock on your watchlist moves more than your threshold in a day."
          control={
            <Toggle
              label="Price move alerts"
              disabled={alertsOff}
              checked={settings.notifyPriceMove}
              onChange={(next) => update({ notifyPriceMove: next })}
            />
          }
        />

        <SettingRow
          className={cn(
            "pl-0 sm:pl-4",
            (alertsOff || !settings.notifyPriceMove) &&
              "pointer-events-none opacity-40",
          )}
          label="Threshold"
          description="Anything at or above this daily move gets flagged."
          control={
            <div className="flex items-center gap-2">
              <SegmentedControl
                label="Price move threshold"
                value={String(settings.priceMoveThreshold)}
                options={[
                  { value: "2", label: "2%" },
                  { value: "5", label: "5%" },
                  { value: "10", label: "10%" },
                ]}
                onChange={(next) =>
                  update({ priceMoveThreshold: Number(next) })
                }
              />
              <Input
                type="number"
                min="0.5"
                max="50"
                step="0.5"
                aria-label="Custom threshold percent"
                value={settings.priceMoveThreshold}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (Number.isFinite(next) && next > 0) {
                    update({ priceMoveThreshold: next });
                  }
                }}
                className="w-20"
              />
            </div>
          }
        />

        <Separator />

        <SettingRow
          label="Earnings news"
          description="Earnings results and guidance are what move a price most, so these are flagged separately."
          control={
            <Toggle
              label="Earnings alerts"
              disabled={alertsOff}
              checked={settings.notifyEarnings}
              onChange={(next) => update({ notifyEarnings: next })}
            />
          }
        />

        <SettingRow
          label="Other major news"
          description="Deals, lawsuits, leadership changes and product launches on stocks you follow."
          control={
            <Toggle
              label="Major news alerts"
              disabled={alertsOff}
              checked={settings.notifyBigNews}
              onChange={(next) => update({ notifyBigNews: next })}
            />
          }
        />
      </Card>

      {/* ---- Display ------------------------------------------------- */}
      <Card className="gap-5 p-6">
        <div>
          <h3 className="text-base font-semibold">Display</h3>
          <p className="text-sm text-muted-foreground">
            How numbers and charts are shown to you.
          </p>
        </div>

        <SettingRow
          label="Number format"
          description={
            settings.numberFormat === "eu"
              ? "European: 1.234,56"
              : "US: 1,234.56"
          }
          control={
            <SegmentedControl
              label="Number format"
              value={settings.numberFormat}
              options={[
                { value: "us", label: "1,234.56" },
                { value: "eu", label: "1.234,56" },
              ]}
              onChange={(next) => update({ numberFormat: next })}
            />
          }
        />

        <SettingRow
          label="Default chart range"
          description="Which range a stock opens on."
          control={
            <SegmentedControl
              label="Default chart range"
              value={settings.defaultRange}
              options={RANGES.map((range) => ({
                value: range.key as CandleRange,
                label: range.label,
              }))}
              onChange={(next) => update({ defaultRange: next })}
            />
          }
        />

        <SettingRow
          label="Appearance"
          description="Follow your system setting, or pick one."
          control={
            <div className="inline-flex items-center gap-1 rounded-xl bg-muted p-1">
              {[
                { value: "light", label: "Light", Icon: Sun },
                { value: "dark", label: "Dark", Icon: Moon },
                { value: "system", label: "System", Icon: Monitor },
              ].map(({ value, label, Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTheme(value)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground transition-colors",
                    mounted &&
                      theme === value &&
                      "bg-card text-foreground shadow-sm",
                  )}
                >
                  <Icon className="size-3.5" />
                  {label}
                </button>
              ))}
            </div>
          }
        />
      </Card>

      {!isGuest && <SecurityCard email={email} />}
      {!isGuest && <SessionsCard />}

      {!isGuest && (
        <Card className="gap-4 p-6">
          <h3 className="text-base font-semibold">Session</h3>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Signed in as {email ?? "—"}
            </p>
            <Button
              variant="outline"
              className="w-fit rounded-full"
              onClick={handleSignOut}
            >
              <LogOut className="size-4" />
              Sign out
            </Button>
          </div>
        </Card>
      )}

      {/* ---- About --------------------------------------------------- */}
      <Card className="gap-4 p-6">
        <h3 className="text-base font-semibold">About</h3>
        <dl className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Version</dt>
            <dd className="num">{APP_VERSION}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Market data</dt>
            <dd>Finnhub &amp; Yahoo Finance</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Payments</dt>
            <dd>Stripe</dd>
          </div>
        </dl>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Prices may be delayed by up to 15 minutes. MATMAX is an information
          tool, not investment advice.
        </p>
      </Card>
    </div>
  );
}
