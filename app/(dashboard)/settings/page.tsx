"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

const APP_VERSION = "1.0.0";

export default function SettingsPage() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [email, setEmail] = useState<string | null>(null);
  const [isGuest, setIsGuest] = useState(false);

  const { settings, update, error } = useUserSettings();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) {
        setEmail(data.user.email);
      } else {
        setIsGuest(true);
      }
    });
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
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {isGuest && (
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
      )}

      {/* ---- Notifications ----------------------------------------- */}
      <Card className="gap-5 p-6">
        <div>
          <h3 className="text-base font-semibold">Notifications</h3>
          <p className="text-sm text-muted-foreground">
            Notifications on your watchlist
          </p>
        </div>

        <SettingRow
          label="Notifications"
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

      {!isGuest && <SessionsCard />}

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

      {!isGuest && <SecurityCard email={email} />}
    </div>
  );
}
