"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import {
  LayoutGrid,
  LineChart,
  Telescope,
  Users,
  UserRound,
  Settings,
  Sparkles,
  Sun,
  Moon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { BackgroundPicker } from "@/components/settings/background-picker";

const nav = [
  { href: "/my-stock", label: "My Stocks", icon: LayoutGrid },
  { href: "/forecast", label: "Forecast", icon: Sparkles },
  { href: "/potential", label: "The Weekly 6", icon: Telescope },
  { href: "/analytics", label: "Lookback", icon: LineChart },
  { href: "/community", label: "Community", icon: Users },
  { href: "/account", label: "Account", icon: UserRound },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({
  mobileOpen = false,
  onClose,
}: {
  mobileOpen?: boolean;
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [pendingRequests, setPendingRequests] = useState(0);
  const [isPaid, setIsPaid] = useState(false);
  const swipe = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- next-themes hydration-safe mount check
    setMounted(true);

    const supabase = createClient();
    async function loadStatus() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setPendingRequests(0);
        setIsPaid(false);
        return;
      }
      const { count } = await supabase
        .from("friend_requests")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", user.id)
        .eq("status", "pending");
      setPendingRequests(count ?? 0);

      const { data: profile } = await supabase
        .from("profiles")
        .select("is_paid")
        .eq("id", user.id)
        .maybeSingle();
      setIsPaid(Boolean(profile?.is_paid));
    }
    loadStatus();
  }, [pathname]);

  const isDark = mounted && theme === "dark";

  return (
    <>
      {/* Mobile backdrop */}
      <div
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-40 bg-black/40 md:hidden",
          mobileOpen ? "block" : "hidden",
        )}
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-full w-64 shrink-0 flex-col overflow-y-auto border-r border-sidebar-border bg-sidebar px-4 py-6 transition-transform md:static md:z-auto md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
        // Swipe left to put it away again — the mirror of the gesture that
        // opened it, so the menu closes the same way it arrived.
        onTouchStart={(event) => {
          const touch = event.touches[0];
          swipe.current = touch
            ? { x: touch.clientX, y: touch.clientY }
            : null;
        }}
        onTouchEnd={(event) => {
          const start = swipe.current;
          swipe.current = null;
          if (!start || !mobileOpen) return;
          const touch = event.changedTouches[0];
          if (!touch) return;
          if (
            start.x - touch.clientX >= 70 &&
            Math.abs(touch.clientY - start.y) <= 50
          ) {
            onClose?.();
          }
        }}
      >
      <div className="flex items-center gap-2 px-2">
        <div className="flex size-9 items-center justify-center rounded-full bg-neutral-900 text-sm font-bold text-white">
          MS
        </div>
        <span className="text-lg font-semibold text-sidebar-foreground">
          MATMAX Stock
        </span>
        {isPaid && (
          <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
            Pro
          </span>
        )}
      </div>

      <nav className="mt-8 flex flex-col gap-1">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = pathname?.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground",
                active && "bg-sidebar-accent text-sidebar-foreground",
              )}
            >
              <Icon className="size-4" />
              <span className="flex-1">{label}</span>
              {label === "Community" && pendingRequests > 0 && (
                <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                  {pendingRequests}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* mt-auto pins this to the bottom; pt-8 keeps a gap from the nav even
          when that margin collapses on a short viewport, so the pills never
          crowd the Settings row. */}
      <div className="mt-auto pt-8">
        <div className="flex items-center gap-1 rounded-xl bg-sidebar-accent p-1">
          <button
            type="button"
            onClick={() => setTheme("light")}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-sidebar-foreground/60",
              !isDark && "bg-card text-sidebar-foreground shadow-sm",
            )}
          >
            <Sun className="size-3.5" />
            Light
          </button>
          <button
            type="button"
            onClick={() => setTheme("dark")}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-sidebar-foreground/60",
              isDark && "bg-card text-sidebar-foreground shadow-sm",
            )}
          >
            <Moon className="size-3.5" />
            Dark
          </button>
        </div>

        {/* Gradient backgrounds for the current theme — swatches only, since
            the switch above already names this corner. */}
        {mounted && <BackgroundPicker />}
      </div>
      </aside>
    </>
  );
}
