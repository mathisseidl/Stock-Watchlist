"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { createClient } from "@/lib/supabase/client";
import {
  formatMoney,
  formatNumber,
  formatPercent,
  formatSignedPercent,
  type NumberFormat,
} from "@/lib/format";
import type { CandleRange } from "@/lib/market-data/types";

export type UserSettings = {
  notificationsEnabled: boolean;
  notifyPriceMove: boolean;
  priceMoveThreshold: number;
  notifyEarnings: boolean;
  notifyBigNews: boolean;
  numberFormat: NumberFormat;
  defaultRange: CandleRange;
};

export const DEFAULT_SETTINGS: UserSettings = {
  notificationsEnabled: true,
  notifyPriceMove: true,
  priceMoveThreshold: 5,
  notifyEarnings: true,
  notifyBigNews: false,
  numberFormat: "us",
  defaultRange: "1M",
};

/** Guests keep preferences on the device; signed-in users keep them on the account. */
const GUEST_KEY = "matmax-guest-settings";

type ContextValue = {
  settings: UserSettings;
  update: (patch: Partial<UserSettings>) => void;
  ready: boolean;
  isGuest: boolean;
  error: string | null;
  /** Formatters bound to the reader's chosen number format. */
  money: (value: number, fractionDigits?: number) => string;
  number: (value: number, fractionDigits?: number) => string;
  percent: (value: number) => string;
  signedPercent: (value: number) => string;
};

const SettingsContext = createContext<ContextValue | null>(null);

type SettingsRow = {
  notifications_enabled: boolean;
  notify_price_move: boolean;
  price_move_threshold: number | string;
  notify_earnings: boolean;
  notify_big_news: boolean;
  number_format: string;
  default_range: string;
};

function fromRow(row: SettingsRow): UserSettings {
  return {
    notificationsEnabled: row.notifications_enabled,
    notifyPriceMove: row.notify_price_move,
    priceMoveThreshold: Number(row.price_move_threshold),
    notifyEarnings: row.notify_earnings,
    notifyBigNews: row.notify_big_news,
    numberFormat: row.number_format === "eu" ? "eu" : "us",
    defaultRange: (row.default_range as CandleRange) ?? DEFAULT_SETTINGS.defaultRange,
  };
}

function toRow(settings: UserSettings) {
  return {
    notifications_enabled: settings.notificationsEnabled,
    notify_price_move: settings.notifyPriceMove,
    price_move_threshold: settings.priceMoveThreshold,
    notify_earnings: settings.notifyEarnings,
    notify_big_news: settings.notifyBigNews,
    number_format: settings.numberFormat,
    default_range: settings.defaultRange,
  };
}

function readGuestSettings(): UserSettings | null {
  try {
    const raw = localStorage.getItem(GUEST_KEY);
    if (!raw) return null;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return null;
  }
}

export function UserSettingsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [supabase] = useState(() => createClient());
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [userId, setUserId] = useState<string | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!active) return;

      if (!user) {
        setUserId(null);
        setIsGuest(true);
        setSettings(readGuestSettings() ?? DEFAULT_SETTINGS);
        setReady(true);
        return;
      }

      setUserId(user.id);
      setIsGuest(false);
      const { data } = await supabase
        .from("user_settings")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!active) return;

      // No row yet just means this user has never opened Settings.
      setSettings(data ? fromRow(data as SettingsRow) : DEFAULT_SETTINGS);
      setReady(true);
    }

    load();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => load());

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const update = useCallback(
    (patch: Partial<UserSettings>) => {
      const previous = settings;
      const next = { ...settings, ...patch };
      setSettings(next);
      setError(null);

      if (!userId) {
        try {
          localStorage.setItem(GUEST_KEY, JSON.stringify(next));
        } catch {
          // Nothing to do — the change still applies for this session.
        }
        return;
      }

      void supabase
        .from("user_settings")
        .upsert({ user_id: userId, ...toRow(next) }, { onConflict: "user_id" })
        .then(({ error: writeError }) => {
          if (writeError) {
            setSettings(previous);
            setError("That preference couldn't be saved.");
          }
        });
    },
    [settings, supabase, userId],
  );

  const format = settings.numberFormat;

  return (
    <SettingsContext.Provider
      value={{
        settings,
        update,
        ready,
        isGuest,
        error,
        money: (value, fractionDigits) =>
          formatMoney(value, format, fractionDigits),
        number: (value, fractionDigits) =>
          formatNumber(value, format, fractionDigits),
        percent: (value) => formatPercent(value, format),
        signedPercent: (value) => formatSignedPercent(value, format),
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useUserSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error(
      "useUserSettings must be used within a UserSettingsProvider",
    );
  }
  return context;
}
