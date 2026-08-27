"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2, Plus, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { CompanyLogo } from "@/components/stock/company-logo";
import { useSymbolSearch } from "@/hooks/use-symbol-search";
import { useWatchlist } from "@/components/watchlist/watchlist-provider";

export function StockSearch() {
  const router = useRouter();
  const { has, add } = useWatchlist();
  const containerRef = useRef<HTMLDivElement>(null);
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const { results, isFetching, debounced } = useSymbolSearch(term);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function goToSymbol(symbol: string) {
    setOpen(false);
    setTerm("");
    router.push(`/stock/${symbol}`);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" && results.length > 0) {
      goToSymbol(results[0].symbol);
    }
    if (event.key === "Escape") {
      setOpen(false);
    }
  }

  const showDropdown = open && debounced.length > 0;

  return (
    <div ref={containerRef} className="relative w-full max-w-xs">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={term}
        onChange={(event) => {
          setTerm(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder="Search stocks (e.g. AAPL)"
        className="pl-9"
      />

      {showDropdown && (
        <div className="absolute right-0 z-50 mt-2 w-full min-w-72 overflow-hidden rounded-xl border border-border bg-popover shadow-lg">
          {isFetching && results.length === 0 ? (
            <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Searching…
            </div>
          ) : results.length > 0 ? (
            <ul className="max-h-80 overflow-y-auto py-1">
              {results.map((result) => {
                const added = has(result.symbol);
                return (
                  <li key={result.symbol} className="flex items-center pr-2 hover:bg-accent">
                    <button
                      type="button"
                      onClick={() => goToSymbol(result.symbol)}
                      className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left"
                    >
                      <CompanyLogo symbol={result.symbol} size="sm" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{result.symbol}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {result.description}
                        </p>
                      </div>
                    </button>
                    <button
                      type="button"
                      aria-label={
                        added
                          ? `${result.symbol} is in your watchlist`
                          : `Add ${result.symbol} to watchlist`
                      }
                      disabled={added}
                      onClick={() =>
                        add({ symbol: result.symbol, name: result.description })
                      }
                      className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground hover:text-primary disabled:opacity-50"
                    >
                      {added ? (
                        <Check className="size-4 text-gain" />
                      ) : (
                        <Plus className="size-4" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="px-4 py-3 text-sm text-muted-foreground">
              No matching stocks found.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
