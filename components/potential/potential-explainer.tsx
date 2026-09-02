"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  HOLD_CONFIDENCE_THRESHOLD,
  DRAWDOWN_FLOOR,
} from "@/lib/potential/score";
import { POTENTIAL_HORIZONS_DAYS } from "@/lib/potential/types";
import { holdPhrase } from "@/lib/potential/read";
import type { PotentialPick } from "@/lib/potential/types";

export function PotentialExplainer({
  example,
  universeCount,
  simulations,
}: {
  example?: PotentialPick;
  universeCount: number;
  simulations: number;
}) {
  const [open, setOpen] = useState(false);

  const horizonList = POTENTIAL_HORIZONS_DAYS.map((d) => holdPhrase(d)).join(", ");

  return (
    <Card className="gap-0 p-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between gap-3 p-4 text-left"
      >
        <div>
          <p className="text-sm font-semibold">How this list is built</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {universeCount} hand-picked companies, {simulations.toLocaleString()}{" "}
            simulations each, one published formula.
          </p>
        </div>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="flex flex-col gap-3 border-t border-border p-4 text-sm text-muted-foreground">
          <p>
            The universe is a fixed list of well-known companies, chosen by hand
            and spread across sectors. Nobody picks the five you see &mdash; each
            week every name is run through the same Monte Carlo simulation the{" "}
            <span className="text-foreground">Forecast</span> page uses, at{" "}
            {horizonList}.
          </p>
          <p>
            The <span className="text-foreground">suggested hold</span> is the
            shortest of those horizons where the simulation ends ahead of a
            savings account in at least {HOLD_CONFIDENCE_THRESHOLD}% of runs. Each
            name is then scored{" "}
            <span className="text-foreground">at that horizon</span>:
          </p>
          <p className="rounded-lg bg-muted/50 p-3 text-xs text-foreground">
            score = median yearly return &times; (chance of beating cash &divide;
            100) &divide; (rough-run drawdown + {DRAWDOWN_FLOOR})
          </p>
          {example && (
            <p>
              {example.symbol}, this week:{" "}
              <span className="num text-foreground">
                {example.scoreBreakdown.medianAnnualizedPercent.toFixed(1)}%
              </span>{" "}
              &times;{" "}
              <span className="num text-foreground">
                {(example.scoreBreakdown.probBeatCashPercent / 100).toFixed(2)}
              </span>{" "}
              &divide;{" "}
              <span className="num text-foreground">
                ({example.scoreBreakdown.roughDrawdownPercent.toFixed(0)} +{" "}
                {DRAWDOWN_FLOOR})
              </span>{" "}
              ={" "}
              <span className="num text-foreground">
                {example.score.toFixed(2)}
              </span>
              .
            </p>
          )}
          <p>
            Higher scores rank first. A company whose median run never beats a
            savings account, at any horizon, is left off entirely. The list only
            moves when prices and the underlying trend do &mdash; it is
            recomputed once a week.
          </p>
        </div>
      )}
    </Card>
  );
}
