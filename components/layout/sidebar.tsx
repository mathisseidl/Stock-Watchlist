"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import {
  LayoutGrid,
  LineChart,
  Users,
  UserRound,
  Sparkles,
  LogOut,
  Sun,
  Moon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

const nav = [
  { href: "/my-stock", label: "My Stock", icon: LayoutGrid },
  { href: "/analytics", label: "Analytics", icon: LineChart },
  { href: "/pricing", label: "Pricing", icon: Sparkles },
  { href: "/community", label: "Community", icon: Users },
  { href: "/account", label: "Account", icon: UserRound },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [pendingRequests, setPendingRequests] = useState(0);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- next-themes hydration-safe mount check
    setMounted(true);

    const supabase = createClient();
    async function loadPending() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { count } = await supabase
        .from("friend_requests")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", user.id)
        .eq("status", "pending");
      setPendingRequests(count ?? 0);
    }
    loadPending();
  }, [pathname]);

  const isDark = mounted && theme === "dark";

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-4 py-6">
      <div className="flex items-center gap-2 px-2">
        <div className="flex size-9 items-center justify-center rounded-full bg-neutral-900 text-sm font-bold text-white">
          MS
        </div>
        <span className="text-lg font-semibold text-sidebar-foreground">
          MATMAX
        </span>
      </div>

      <nav className="mt-8 flex flex-col gap-1">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = pathname?.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
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

      <button
        type="button"
        onClick={handleSignOut}
        className="mt-auto flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
      >
        <LogOut className="size-4" />
        Sign out
      </button>

      <div className="mt-3 flex items-center gap-1 rounded-xl bg-sidebar-accent p-1">
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
    </aside>
  );
}
