"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { CompanyLogo } from "@/components/stock/company-logo";
import { useSymbolSearch } from "@/hooks/use-symbol-search";
import type { SymbolSearchResult } from "@/lib/market-data/types";

/**
 * Type a company name or a ticker and pick the match. Same lookup the top-bar
 * search uses, but it hands the choice back to a form instead of navigating.
 *
 * The dropdown is absolutely positioned, so any ancestor that clips (Card sets
 * `overflow-hidden` by default) will cut it off — give that ancestor
 * `overflow-visible`.
 */
export function SymbolCombobox({
  value,
  onValueChange,
  onSelect,
  onTopResultChange,
  placeholder = "Apple, NVDA, Tesla…",
  id,
}: {
  value: string;
  onValueChange: (value: string) => void;
  onSelect: (result: SymbolSearchResult) => void;
  /** Lets the form fall back to the best match if the user never clicks one. */
  onTopResultChange?: (result: SymbolSearchResult | null) => void;
  placeholder?: string;
  id?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const { results, isFetching, debounced } = useSymbolSearch(value);

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

  useEffect(() => {
    onTopResultChange?.(results[0] ?? null);
    // Only the identity of the top match matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results[0]?.symbol]);

  function choose(result: SymbolSearchResult) {
    onValueChange(result.symbol);
    onSelect(result);
    setOpen(false);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" && open && results.length > 0) {
      // Let the picker claim Enter so it doesn't submit a half-typed name.
      event.preventDefault();
      choose(results[0]);
    }
    if (event.key === "Escape") {
      setOpen(false);
    }
  }

  const showDropdown = open && debounced.length > 0;

  return (
    <div ref={containerRef} className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        id={id}
        value={value}
        autoComplete="off"
        onChange={(event) => {
          onValueChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="pl-9"
      />

      {showDropdown && (
        <div className="absolute left-0 z-50 mt-2 w-full min-w-64 overflow-hidden rounded-xl border border-border bg-popover shadow-lg">
          {isFetching && results.length === 0 ? (
            <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Searching…
            </div>
          ) : results.length > 0 ? (
            <ul className="max-h-72 overflow-y-auto py-1">
              {results.map((result) => (
                <li key={result.symbol}>
                  <button
                    type="button"
                    onClick={() => choose(result)}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-accent"
                  >
                    <CompanyLogo symbol={result.symbol} size="sm" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{result.symbol}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {result.description}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
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
