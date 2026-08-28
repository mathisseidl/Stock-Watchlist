"use client";

import Link from "next/link";
import { ArrowUpRight, Bell, BellOff } from "lucide-react";
import { useAlerts } from "@/hooks/use-alerts";
import { useUserSettings } from "@/components/settings/user-settings-provider";
import { ChangeBadge } from "@/components/stock/change-badge";

export function AlertList() {
  const { settings, ready } = useUserSettings();
  const { alerts } = useAlerts();

  if (!ready) return null;

  if (!settings.notificationsEnabled) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
        <BellOff className="size-4 shrink-0" />
        <span>Alerts are switched off.</span>
        <Link
          href="/settings"
          className="font-medium text-primary hover:underline"
        >
          Turn them on
        </Link>
      </div>
    );
  }

  if (alerts.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-primary/25 bg-accent/40 p-4">
      <div className="flex items-center gap-2">
        <Bell className="size-4 text-primary" />
        <p className="text-sm font-semibold">
          {alerts.length === 1
            ? "1 thing worth a look"
            : `${alerts.length} things worth a look`}
        </p>
        <Link
          href="/settings"
          className="ml-auto text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          Alert settings
        </Link>
      </div>

      <ul className="flex flex-col gap-1.5">
        {alerts.map((alert) => {
          const body = (
            <>
              <span className="min-w-0 flex-1">
                <span className="font-medium">{alert.headline}</span>{" "}
                <span className="text-muted-foreground">{alert.detail}</span>
              </span>
              {alert.changePercent !== undefined ? (
                <ChangeBadge changePercent={alert.changePercent} />
              ) : (
                <ArrowUpRight className="size-4 shrink-0 text-muted-foreground" />
              )}
            </>
          );

          return (
            <li key={alert.id}>
              {alert.url ? (
                <a
                  href={alert.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-card"
                >
                  {body}
                </a>
              ) : (
                <Link
                  href={`/stock/${alert.symbol}`}
                  className="flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-card"
                >
                  {body}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
