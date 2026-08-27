import { DashboardShell } from "@/components/layout/dashboard-shell";
import { WatchlistProvider } from "@/components/watchlist/watchlist-provider";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <WatchlistProvider>
      <DashboardShell>{children}</DashboardShell>
    </WatchlistProvider>
  );
}
