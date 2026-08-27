import { Sidebar } from "@/components/layout/sidebar";
import { StockSearch } from "@/components/search/stock-search";
import { WatchlistProvider } from "@/components/watchlist/watchlist-provider";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <WatchlistProvider>
      <div className="flex h-full min-h-screen w-full">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col bg-muted/30">
          <header className="flex items-center justify-end gap-4 border-b border-border bg-background/60 px-8 py-4 backdrop-blur">
            <StockSearch />
          </header>
          <main className="min-w-0 flex-1 overflow-x-hidden p-8">{children}</main>
        </div>
      </div>
    </WatchlistProvider>
  );
}
