"use client";

import { Card } from "@/components/ui/card";
import { SettingRow, SegmentedControl } from "@/components/settings/setting-row";
import { useUserSettings } from "@/components/settings/user-settings-provider";
import { RANGES } from "@/lib/ranges";
import type { CandleRange } from "@/lib/market-data/types";

/**
 * Number and chart display preferences, shown in Settings under Notifications.
 * Appearance (light/dark) is not here — that switch is in the sidebar, and so
 * is the Pro gradient picker.
 */
export function DisplayCard() {
  const { settings, update } = useUserSettings();

  return (
    <Card className="gap-5 p-6">
      <div>
        <h3 className="text-base font-semibold">Display</h3>
        <p className="text-sm text-muted-foreground">
          How numbers and charts are shown to you.
        </p>
      </div>

      <SettingRow
        label="Number format"
        description={
          settings.numberFormat === "eu"
            ? "European: 1.234,56"
            : "US: 1,234.56"
        }
        control={
          <SegmentedControl
            label="Number format"
            value={settings.numberFormat}
            options={[
              { value: "us", label: "1,234.56" },
              { value: "eu", label: "1.234,56" },
            ]}
            onChange={(next) => update({ numberFormat: next })}
          />
        }
      />

      <SettingRow
        label="Default chart range"
        description="Which range a stock opens on."
        control={
          <SegmentedControl
            label="Default chart range"
            value={settings.defaultRange}
            options={RANGES.map((range) => ({
              value: range.key as CandleRange,
              label: range.label,
            }))}
            onChange={(next) => update({ defaultRange: next })}
          />
        }
      />
    </Card>
  );
}
