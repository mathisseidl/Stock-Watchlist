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
  DEFAULT_CHOICE,
  parseChoice,
  presetById,
  resolveGradient,
  type BackgroundChoice,
  type BackgroundMode,
} from "@/lib/backgrounds";

type ContextValue = {
  /** The choice for each mode. */
  choice: BackgroundChoice;
  /** The preset id being painted for the current theme, or null. */
  activeId: string | null;
  /** The mode whose options the picker should show. */
  mode: BackgroundMode;
  /** Whether the account may use the Pro-only gradients. */
  allowed: boolean;
  /** True once the plan is known. */
  ready: boolean;
  /** Set (or clear, with null) the gradient for the current mode. */
  setBackground: (id: string | null) => void;
};

const BackgroundContext = createContext<ContextValue | null>(null);

function readChoice(): BackgroundChoice {
  if (typeof window === "undefined") return DEFAULT_CHOICE;
  return parseChoice(localStorage.getItem(BACKGROUND_STORAGE_KEY));
}

export function BackgroundProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { resolvedTheme } = useTheme();
  const { isPaid, ready } = useProStatus();
  const [choice, setChoice] = useState<BackgroundChoice>(DEFAULT_CHOICE);

  // Load once on mount — the boot script has already painted from the same key,
  // so this only catches the provider up with the DOM.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading a client-only store on mount
    setChoice(readChoice());
  }, []);

  // Light is the app default, so treat an unresolved theme as light.
  const mode: BackgroundMode = resolvedTheme === "dark" ? "dark" : "light";
  // Optimistic while the plan loads, so a Pro member's gradient doesn't blink
  // down to the default and back.
  const canUsePro = !ready || isPaid;

  const activeId = resolveGradient(choice, mode, canUsePro)?.id ?? null;

  // Keep the document in sync with the active choice, the theme and the plan.
  useEffect(() => {
    applyBackground(presetById(activeId));
  }, [activeId]);

  const setBackground = useCallback(
    (id: string | null) => {
      setChoice((prev) => {
        const next: BackgroundChoice =
          mode === "light" ? { ...prev, light: id } : { ...prev, dark: id };
        try {
          // Always persist. An explicit "No background" (id null) has to stick,
          // or the next load would read "no key" and restore the default.
          localStorage.setItem(BACKGROUND_STORAGE_KEY, JSON.stringify(next));
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
