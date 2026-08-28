import { DashboardShell } from "@/components/layout/dashboard-shell";
import { WatchlistProvider } from "@/components/watchlist/watchlist-provider";
import { UserSettingsProvider } from "@/components/settings/user-settings-provider";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <UserSettingsProvider>
      <WatchlistProvider>
        <DashboardShell>{children}</DashboardShell>
      </WatchlistProvider>
    </UserSettingsProvider>
  );
}
