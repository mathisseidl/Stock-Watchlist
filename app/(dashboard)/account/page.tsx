"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { LogOut, Sun, Moon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

export default function AccountPage() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [supabase] = useState(() => createClient());
  const [email, setEmail] = useState("");
  const [isPaid, setIsPaid] = useState<boolean | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration flag
    setMounted(true);
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) setEmail(data.user.email);
    });
    fetch("/api/analytics")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setIsPaid(Boolean(data.isPaid));
      })
      .catch(() => {});
  }, [supabase]);

  const isDark = mounted && theme === "dark";
  const initials = email ? email.slice(0, 2).toUpperCase() : "MS";

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Account</h1>
        <p className="text-sm text-muted-foreground">
          Manage your profile and preferences.
        </p>
      </div>

      <Card className="gap-5 p-6">
        <div className="flex items-center gap-4">
          <Avatar className="size-16">
            <AvatarFallback className="bg-neutral-900 text-lg font-semibold text-white">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="text-base font-semibold">{email || "—"}</p>
            <p className="text-sm text-muted-foreground">
              {isPaid === null
                ? "Loading plan…"
                : isPaid
                  ? "Unlimited plan"
                  : "Free plan"}
            </p>
          </div>
        </div>

        {isPaid === false && (
          <>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Upgrade to Unlimited</p>
                <p className="text-xs text-muted-foreground">
                  Remove the 3/day limit on Analytics — one-time $3.99.
                </p>
              </div>
              <Link
                href="/pricing"
                className={cn(buttonVariants(), "rounded-full")}
              >
                View plans
              </Link>
            </div>
          </>
        )}
      </Card>

      <Card className="gap-4 p-6">
        <h3 className="text-base font-semibold">Preferences</h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Appearance</p>
            <p className="text-xs text-muted-foreground">
              Switch between light and dark mode.
            </p>
          </div>
          <div className="flex items-center gap-1 rounded-xl bg-muted p-1">
            <button
              type="button"
              onClick={() => setTheme("light")}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground",
                !isDark && "bg-card text-foreground shadow-sm",
              )}
            >
              <Sun className="size-3.5" />
              Light
            </button>
            <button
              type="button"
              onClick={() => setTheme("dark")}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground",
                isDark && "bg-card text-foreground shadow-sm",
              )}
            >
              <Moon className="size-3.5" />
              Dark
            </button>
          </div>
        </div>
      </Card>

      <Card className="gap-4 p-6">
        <h3 className="text-base font-semibold">Session</h3>
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Signed in as {email || "—"}
          </p>
          <Button
            variant="outline"
            className="rounded-full"
            onClick={handleSignOut}
          >
            <LogOut className="size-4" />
            Sign Out
          </Button>
        </div>
      </Card>
    </div>
  );
}
