"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useTheme } from "next-themes";
import { useProStatus } from "@/hooks/use-pro";
import {
  applyBackground,
  BACKGROUND_STORAGE_KEY,
  EMPTY_CHOICE,
  parseChoice,
  presetById,
  type BackgroundChoice,
  type BackgroundMode,
} from "@/lib/backgrounds";

type ContextValue = {
  /** The choice for each mode. */
  choice: BackgroundChoice;
  /** The preset id active for the current theme, or null. */
  activeId: string | null;
  /** The mode whose options the picker should show. */
  mode: BackgroundMode;
  /** Whether the account may use gradients at all. */
  allowed: boolean;
  /** True once the plan is known. */
  ready: boolean;
  /** Set (or clear, with null) the gradient for the current mode. */
  setBackground: (id: string | null) => void;
};

const BackgroundContext = createContext<ContextValue | null>(null);

function readChoice(): BackgroundChoice {
  if (typeof window === "undefined") return EMPTY_CHOICE;
  return parseChoice(localStorage.getItem(BACKGROUND_STORAGE_KEY));
}

export function BackgroundProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { resolvedTheme } = useTheme();
  const { isPaid, ready } = useProStatus();
  const [choice, setChoice] = useState<BackgroundChoice>(EMPTY_CHOICE);

  // Load once on mount — the boot script has already painted from the same key,
  // so this only catches the provider up with the DOM.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading a client-only store on mount
    setChoice(readChoice());
  }, []);

  const mode: BackgroundMode = resolvedTheme === "light" ? "light" : "dark";
  const allowed = !ready || isPaid;
  const activeId = allowed ? (mode === "light" ? choice.light : choice.dark) : null;

  // Keep the document in sync with the active choice, the theme and the plan.
  useEffect(() => {
    applyBackground(presetById(activeId));
  }, [activeId]);

  // A lapsed membership shouldn't keep a stored gradient around.
  useEffect(() => {
    if (ready && !isPaid) {
      const stored = readChoice();
      if (stored.light || stored.dark) {
        localStorage.removeItem(BACKGROUND_STORAGE_KEY);
        // eslint-disable-next-line react-hooks/set-state-in-effect -- clears a stored choice once the plan is known
        setChoice(EMPTY_CHOICE);
      }
    }
  }, [ready, isPaid]);

  const setBackground = useCallback(
    (id: string | null) => {
      setChoice((prev) => {
        const next: BackgroundChoice =
          mode === "light" ? { ...prev, light: id } : { ...prev, dark: id };
        try {
          if (!next.light && !next.dark) {
            localStorage.removeItem(BACKGROUND_STORAGE_KEY);
          } else {
            localStorage.setItem(BACKGROUND_STORAGE_KEY, JSON.stringify(next));
          }
        } catch {
          // The change still holds for this session.
        }
        return next;
      });
    },
    [mode],
  );

  const value = useMemo<ContextValue>(
    () => ({
      choice,
      activeId,
      mode,
      allowed: ready ? isPaid : false,
      ready,
      setBackground,
    }),
    [choice, activeId, mode, ready, isPaid, setBackground],
  );

  return (
    <BackgroundContext.Provider value={value}>
      {children}
    </BackgroundContext.Provider>
  );
}

export function useBackground() {
  const context = useContext(BackgroundContext);
  if (!context) {
    throw new Error("useBackground must be used within a BackgroundProvider");
  }
  return context;
}
