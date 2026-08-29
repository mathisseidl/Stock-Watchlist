"use client";

import Link from "next/link";
import { BellOff, ChevronRight } from "lucide-react";
import { useAlerts, type Alert } from "@/hooks/use-alerts";
import { useUserSettings } from "@/components/settings/user-settings-provider";
import { ChangeBadge } from "@/components/stock/change-badge";
import { CompanyLogo } from "@/components/stock/company-logo";

function timeAgo(unixSeconds: number) {
  const minutes = Math.max(1, Math.round((Date.now() / 1000 - unixSeconds) / 60));
  if (minutes < 60) return minutes === 1 ? "1 min ago" : `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  return "yesterday";
}

function AlertRow({ alert }: { alert: Alert }) {
  const body = (
    <>
      <CompanyLogo symbol={alert.symbol} size="sm" />

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-semibold">{alert.symbol}</span>
          {alert.kind === "earnings" && (
            <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold tracking-wide text-accent-foreground uppercase">
              Earnings
            </span>
          )}
          {alert.changePercent !== undefined && (
            <ChangeBadge changePercent={alert.changePercent} />
          )}
        </span>
        <span className="mt-0.5 block text-sm leading-snug font-medium text-balance">
          {alert.title}
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {alert.detail}
          {alert.publishedAt ? ` · ${timeAgo(alert.publishedAt)}` : ""}
        </span>
      </span>

      <ChevronRight className="mt-1 size-4 shrink-0 self-start text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
    </>
  );

  const className =
    "group flex items-start gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-muted/60";

  return (
    <li>
      {alert.url ? (
        <a
          href={alert.url}
          target="_blank"
          rel="noopener noreferrer"
          className={className}
        >
          {body}
        </a>
      ) : (
        <Link href={`/stock/${alert.symbol}`} className={className}>
          {body}
        </Link>
      )}
    </li>
  );
}

export function AlertList() {
  const { settings, ready } = useUserSettings();
  const { alerts } = useAlerts();

  if (!ready) return null;

  if (!settings.notificationsEnabled) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
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
    <section className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-3">
        <div>
          <h2 className="text-base font-semibold">Worth a look today</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {alerts.length === 1
              ? "One thing happened on your watchlist."
              : `The ${alerts.length} biggest things on your watchlist right now.`}
          </p>
        </div>
        <Link
          href="/settings"
          className="text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          Change what you see
        </Link>
      </div>

      <ul className="mt-2 flex flex-col divide-y divide-border">
        {alerts.map((alert) => (
          <AlertRow key={alert.id} alert={alert} />
        ))}
      </ul>
    </section>
  );
}
