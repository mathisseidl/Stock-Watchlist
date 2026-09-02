import Link from "next/link";
import { ArrowUpRight, Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function PotentialUpsell() {
  return (
    <Card className="gap-4 border-primary/40 p-6 ring-1 ring-primary/20">
      <div className="flex items-start gap-3">
        <Lock className="mt-0.5 size-5 shrink-0 text-primary" />
        <h2 className="text-base font-semibold">
          The weekly five is a Pro feature
        </h2>
      </div>

      <p className="rounded-xl border border-border px-4 py-3 text-sm">
        Free for 7 days, then{" "}
        <span className="num font-semibold">$1.99/month</span> — unlocking the
        five rising stocks each week with their suggested hold times, plus
        forecasts for any stock, a news summary of the last 24h on every stock,
        and unlimited past-investment analysis. Cancel any time before the trial
        ends and you won&apos;t be charged.
      </p>

      <Link
        href="/account#plans"
        className={cn(
          buttonVariants(),
          "w-full rounded-full sm:w-auto sm:self-start",
        )}
      >
        Start your 7-day free trial
        <ArrowUpRight className="size-4" />
      </Link>
    </Card>
  );
}
