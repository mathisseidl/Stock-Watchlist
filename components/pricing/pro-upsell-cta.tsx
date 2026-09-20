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
 * A guest hasn't started the free trial yet — signing up does that
 * automatically, no card involved — so they get invited to start it. A
 * signed-in reader seeing this has already had their trial week (Pro is open
 * automatically until it runs out), so this is a straight upgrade for them.
 */
export function ProUpsellCta({
  className,
  arrow = false,
}: {
  className?: string;
  arrow?: boolean;
}) {
  const { isGuest } = useProStatus();

  return (
    <>
      <Link href="/account#plans" className={cn(buttonVariants(), className)}>
        {isGuest
          ? `Start your ${PRO_TRIAL_DAYS}-day free trial`
          : "Upgrade to Pro — $1.99/month"}
        {arrow && <ArrowUpRight className="size-4" />}
      </Link>

      <p className="text-sm text-muted-foreground">
        {isGuest
          ? "No bank card needed for the free trial."
          : "Billed $1.99/month. Cancel any time."}
      </p>
    </>
  );
}
