import { DashboardShell } from "@/components/layout/dashboard-shell";
import { WatchlistProvider } from "@/components/watchlist/watchlist-provider";
import { UserSettingsProvider } from "@/components/settings/user-settings-provider";
import { BackgroundProvider } from "@/components/settings/background-provider";
import { backgroundBootScript } from "@/lib/backgrounds";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {/* Paints a Pro member's saved gradient before first paint, so a reload
          doesn't flash the flat background. */}
      <script
        id="matmax-background-boot"
        dangerouslySetInnerHTML={{ __html: backgroundBootScript() }}
      />
      <BackgroundProvider>
        <UserSettingsProvider>
          <WatchlistProvider>
            <DashboardShell>{children}</DashboardShell>
          </WatchlistProvider>
        </UserSettingsProvider>
      </BackgroundProvider>
    </>
  );
}
