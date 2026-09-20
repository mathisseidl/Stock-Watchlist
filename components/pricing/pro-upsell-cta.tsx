"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { useProStatus } from "@/hooks/use-pro";
import { PRO_TRIAL_DAYS } from "@/lib/pro";
import { cn } from "@/lib/utils";

/**
 * The "go to Pro" link shown under a locked feature, plus the line under it.
 *
 * Anyone who hasn't clicked to start the free trial yet — a guest, or a
 * signed-in member who never started one — gets invited to start it on the
 * Account page. Once that trial has run out (or already been used), this is
 * a straight upgrade instead.
 */
export function ProUpsellCta({
  className,
  arrow = false,
}: {
  className?: string;
  arrow?: boolean;
}) {
  const { trialEligible } = useProStatus();

  return (
    <>
      <Link href="/account#plans" className={cn(buttonVariants(), className)}>
        {trialEligible
          ? `Start your ${PRO_TRIAL_DAYS}-day free trial`
          : "Upgrade to Pro — $1.99/month"}
        {arrow && <ArrowUpRight className="size-4" />}
      </Link>

      <p className="text-sm text-muted-foreground">
        {trialEligible
          ? "No bank card needed for the free trial."
          : "Billed $1.99/month. Cancel any time."}
      </p>
    </>
  );
}
