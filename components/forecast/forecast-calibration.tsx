"use client";

import { Card } from "@/components/ui/card";
import { Explain, GLOSSARY } from "@/components/forecast/explain";
import { useUserSettings } from "@/components/settings/user-settings-provider";
import { describeBias, describeCalibration, describeHorizon } from "@/lib/forecast/read";
import { cn } from "@/lib/utils";
import type { ForecastCalibration } from "@/lib/forecast/engine";

/**
 * The forecast's own report card.
 *
 * Every band on this page makes a testable claim — one run in ten below the
 * low end, one in ten above the high end — and this is the test. The model was
 * refitted at points across the stock's own past using only the data that
 * existed on each of those days, asked for the same band, and scored against
 * what the price went on to do.
 *
 * It is shown whether or not it flatters the forecast. A model that reports
 * only the answers it got right is the same product as one that never checked.
 */

/** One row of the meter: the three shares, in order, as percentages. */
function CoverageBar({
  below,
  inside,
  above,
  faded = false,
}: {
  below: number;
  inside: number;
  above: number;
  faded?: boolean;
}) {
  // A zero-width flex child collapses to nothing, which is the honest render —
  // but a sliver under half a percent would draw as a hairline pretending to
  // be a bar, so it is floored to zero instead.
  const segments = [
    { width: below, hit: false },
    { width: inside, hit: true },
    { width: above, hit: false },
  ].filter((segment) => segment.width >= 0.5);

  return (
    <div className="flex h-2.5 gap-0.5 overflow-hidden">
      {segments.map((segment, index) => (
        <div
          key={index}
          className={cn(
            "h-full rounded-[2px]",
            segment.hit
              ? faded
                ? "bg-gain/30"
                : "bg-gain"
              : faded
                ? "bg-muted-foreground/10"
                : "bg-muted-foreground/25",
          )}
          style={{ width: `${segment.width}%` }}
        />
      ))}
    </div>
  );
}

function LegendItem({
  swatch,
  label,
  value,
}: {
  swatch: string;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-1.5">
      <span
        aria-hidden
        className={cn("mt-1 size-2 shrink-0 rounded-[2px]", swatch)}
      />
      <span className="min-w-0">
        <span className="num block text-sm font-semibold">{value}</span>
        <span className="block text-[11px] leading-tight text-muted-foreground">
          {label}
        </span>
      </span>
    </div>
  );
}

export function ForecastCalibrationCard({
  calibration,
  name,
  horizonDays,
}: {
  calibration: ForecastCalibration;
  name: string;
  horizonDays: number;
}) {
  const { number } = useUserSettings();
  const verdict = describeCalibration(calibration);
  const horizon = describeHorizon(horizonDays);

  const target = calibration.expectedInsidePercent;
  const missTarget = (100 - target) / 2;

  return (
    <Card className="gap-4 p-6">
      <div>
        <h3 className="text-base font-semibold">
          How often this model has been right about the range
        </h3>
        <p className="mt-0.5 text-sm text-muted-foreground">
          The same model, refitted at{" "}
          <span className="num">{calibration.windows}</span> points in{" "}
          {name}&rsquo;s own past using only what was known on each of those
          days, then scored against what the price actually did over the next{" "}
          {horizon}.
        </p>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-semibold",
            verdict.tone === "good"
              ? "bg-gain-soft text-gain"
              : "bg-muted text-muted-foreground",
          )}
        >
          {verdict.label}
        </span>
        <span className="num-display text-2xl">
          {number(calibration.insideBandPercent, 0)}%
        </span>
        <span className="text-sm text-muted-foreground">
          landed inside the range, against the{" "}
          <span className="num">{number(target, 0)}%</span> a perfectly{" "}
          <Explain text={GLOSSARY.calibration}>calibrated</Explain> model scores
        </span>
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">
            This model, on {name}
          </p>
          <CoverageBar
            below={calibration.belowBandPercent}
            inside={calibration.insideBandPercent}
            above={calibration.aboveBandPercent}
          />
        </div>
        <div>
          <p className="mb-1.5 text-[11px] text-muted-foreground">
            What a perfectly calibrated model would score
          </p>
          <CoverageBar
            below={missTarget}
            inside={target}
            above={missTarget}
            faded
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 border-t border-border pt-4">
        <LegendItem
          swatch="bg-muted-foreground/25"
          label="finished below the range"
          value={`${number(calibration.belowBandPercent, 0)}%`}
        />
        <LegendItem
          swatch="bg-gain"
          label="finished inside it"
          value={`${number(calibration.insideBandPercent, 0)}%`}
        />
        <LegendItem
          swatch="bg-muted-foreground/25"
          label="finished above the range"
          value={`${number(calibration.aboveBandPercent, 0)}%`}
        />
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {verdict.detail} Across those windows the real price{" "}
        {describeBias(calibration.medianBiasPercent)}. Two caveats worth having:
        the windows sit{" "}
        <span className="num">{calibration.windowStrideDays}</span> trading days
        apart and so overlap, which means one long bull run can supply several
        of the hits; and while every per-stock estimate is strictly out of
        sample, the model&rsquo;s fixed constants were chosen knowing how
        markets have behaved.
      </p>
    </Card>
  );
}
