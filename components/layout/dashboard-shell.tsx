"use client";

import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { Sidebar } from "@/components/layout/sidebar";
import { StockSearch } from "@/components/search/stock-search";
import { createClient } from "@/lib/supabase/client";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isPaid, setIsPaid] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("is_paid")
        .eq("id", user.id)
        .maybeSingle();
      setIsPaid(Boolean(data?.is_paid));
    });
  }, []);

  return (
    <div className="flex h-full min-h-screen w-full">
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col bg-muted/30">
        <header className="flex items-center gap-3 border-b border-border bg-background px-4 py-3 md:px-8">
          {/* Mobile: menu button + brand (the sidebar brand is hidden here). */}
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            className="shrink-0 text-foreground md:hidden"
          >
            <Menu className="size-6" />
          </button>
          <div className="flex items-center gap-2 md:hidden">
            <div className="flex size-8 items-center justify-center rounded-full bg-neutral-900 text-xs font-bold text-white">
              MS
            </div>
            <span className="text-base font-semibold">MATMAX</span>
            {isPaid && (
              <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
                Pro
              </span>
            )}
          </div>
          <div className="flex min-w-0 flex-1 justify-end">
            <StockSearch />
          </div>
        </header>
        <main className="min-w-0 flex-1 overflow-x-hidden p-4 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
