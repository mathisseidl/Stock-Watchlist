"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Monitor, Smartphone, Tablet } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";

type SessionRow = {
  id: string;
  created_at: string;
  last_seen_at: string | null;
  user_agent: string | null;
  ip: string | null;
  is_current: boolean;
};

/** Best-effort device name from the user agent. */
function describe(userAgent: string | null) {
  if (!userAgent) return { label: "Unknown device", kind: "desktop" as const };

  const isTablet = /iPad|Tablet/i.test(userAgent);
  const isPhone = /iPhone|Android.*Mobile|Mobile/i.test(userAgent);

  const os = /Windows/i.test(userAgent)
    ? "Windows"
    : /iPhone|iPad|iOS/i.test(userAgent)
      ? "iOS"
      : /Mac OS X|Macintosh/i.test(userAgent)
        ? "macOS"
        : /Android/i.test(userAgent)
          ? "Android"
          : /Linux/i.test(userAgent)
            ? "Linux"
            : "Unknown OS";

  const browser = /Edg\//i.test(userAgent)
    ? "Edge"
    : /OPR\//i.test(userAgent)
      ? "Opera"
      : /Firefox\//i.test(userAgent)
        ? "Firefox"
        : /Chrome\//i.test(userAgent)
          ? "Chrome"
          : /Safari\//i.test(userAgent)
            ? "Safari"
            : "Browser";

  return {
    label: `${browser} on ${os}`,
    kind: isTablet ? ("tablet" as const) : isPhone ? ("phone" as const) : ("desktop" as const),
  };
}

function when(value: string | null) {
  if (!value) return "unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  const hours = (Date.now() - date.getTime()) / 3_600_000;
  if (hours < 1) return "active now";
  if (hours < 24) return `${Math.round(hours)} hours ago`;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function SessionsCard() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let active = true;
    supabase
      .rpc("get_my_sessions")
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setFailed(true);
          return;
        }
        setSessions((data ?? []) as SessionRow[]);
      });
    return () => {
      active = false;
    };
  }, [supabase]);

  async function signOutEverywhere() {
    setSigningOut(true);
    await supabase.auth.signOut({ scope: "global" });
    router.push("/my-stock");
    router.refresh();
  }

  return (
    <Card className="gap-4 p-6">
      <div>
        <h3 className="text-base font-semibold">Where you&apos;re signed in</h3>
        <p className="text-sm text-muted-foreground">
          Devices with an active session on your account.
        </p>
      </div>

      {failed ? (
        <p className="text-sm text-muted-foreground">
          Couldn&apos;t load your sessions right now.
        </p>
      ) : sessions === null ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No active sessions.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {sessions.map((session) => {
            const device = describe(session.user_agent);
            const Icon =
              device.kind === "phone"
                ? Smartphone
                : device.kind === "tablet"
                  ? Tablet
                  : Monitor;
            return (
              <li
                key={session.id}
                className="flex items-center gap-3 rounded-xl border border-border px-4 py-3"
              >
                <Icon className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {device.label}
                    {session.is_current && (
                      <span className="ml-2 rounded-full bg-gain-soft px-2 py-0.5 text-[11px] font-medium text-gain">
                        This device
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Last active {when(session.last_seen_at)}
                    {session.ip ? ` · ${session.ip}` : ""}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Button
        variant="outline"
        className="w-fit rounded-full"
        disabled={signingOut}
        onClick={signOutEverywhere}
      >
        {signingOut ? "Signing out…" : "Sign out everywhere"}
      </Button>
    </Card>
  );
}
